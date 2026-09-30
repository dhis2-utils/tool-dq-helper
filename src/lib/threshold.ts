// Editing the outlier threshold value (k) of an existing configuration:
// renames the affected metadata objects and updates the predictor
// expression, then records the new value in the dataStore. Handles both
// legacy (mean + k SD, 5 predictors) and V2 hybrid configurations
// (single threshold predictor; modified-Z or mean + k SD).
import { D2Api } from './api'
import { thresholdGenerator } from './templates'
import { MetadataObject, PlaceholderConfig, StoreEntry } from './types'

/**
 * Replace the old SD value with the new one in the strings the templates
 * embed it in. Targeted replacements so unrelated numbers are untouched.
 */
const replaceSD = (value: string, oldSD: string, newSD: string): string =>
    value
        .split(`mean + ${oldSD} SD`)
        .join(`mean + ${newSD} SD`)
        .split(`${oldSD} standard deviations`)
        .join(`${newSD} standard deviations`)
        .split(`(${oldSD} * stddevPop`)
        .join(`(${newSD} * stddevPop`)
        .split(`+ ${oldSD} SD)`)
        .join(`+ ${newSD} SD)`)

/** Fetch the objects, apply `mutate` to each, and import them back. */
const updateObjects = async (
    api: D2Api,
    spec: {
        endpoint: 'dataElements' | 'predictors' | 'indicators'
        ids: string[]
        mutate: (object: MetadataObject) => void
    }
): Promise<void> => {
    const { endpoint, ids, mutate } = spec
    if (ids.length === 0) {
        return
    }
    const result = await api.get<Record<string, MetadataObject[]>>(endpoint, {
        filter: `id:in:[${ids.join(',')}]`,
        fields: ':owner',
        paging: false,
    })
    const objects = result[endpoint] || []
    if (objects.length === 0) {
        return
    }
    objects.forEach(mutate)
    await api.post('metadata', { [endpoint]: objects })
}

/** Record the edit time from the server clock (zone-less date strings —
 * a client-side timestamp would skew by the browser's timezone offset). */
const stampEditedAt = async (
    api: D2Api,
    config: PlaceholderConfig,
    predictorId: string | undefined
): Promise<void> => {
    if (!predictorId) {
        return
    }
    const stamp = await api.get<{ lastUpdated: string }>(
        `predictors/${predictorId}`,
        { fields: 'lastUpdated' }
    )
    config.editedAt = stamp.lastUpdated
}

/** V2 hybrid: only the threshold data element + predictor embed k. */
const updateThresholdV2 = async (
    api: D2Api,
    config: PlaceholderConfig,
    newK: string
): Promise<void> => {
    const method = config['§VAL_MODZ§'] ? 'modZ' : 'sd'
    const valueKey = method === 'modZ' ? '§VAL_MODZ§' : '§VAL_STDDEV§'
    const oldDesc = config['§THRESHOLD_DESC§'] as string
    const generator = thresholdGenerator(method, newK)
    const expression = generator.expression
        .split('§DE_SOURCE§')
        .join(config['§DE_SOURCE§'] as string)

    const rename = (object: MetadataObject): void => {
        object.name = (object.name || '')
            .split(oldDesc)
            .join(generator.description)
        object.description = (object.description || '')
            .split(oldDesc)
            .join(generator.description)
    }

    await updateObjects(api, {
        endpoint: 'dataElements',
        ids: [config['§DE_THRESHOLD_V2§'] as string],
        mutate: rename,
    })
    const predictorId = config['§PD_THRESHOLD_V2§'] as string
    await updateObjects(api, {
        endpoint: 'predictors',
        ids: [predictorId],
        mutate: (predictor) => {
            rename(predictor)
            if (predictor.generator) {
                predictor.generator.expression = expression
            }
        },
    })
    // The outlier indicators mention the threshold description too
    await updateObjects(api, {
        endpoint: 'indicators',
        ids: [
            config['§IN_OUTLIER_PROP_V2§'] as string,
            config['§IN_NOUTLIER_PROP_V2§'] as string,
            config['§IN_OUTLIER_VAL_V2§'] as string,
        ].filter(Boolean),
        mutate: rename,
    })

    config[valueKey] = newK
    config['§THRESHOLD_DESC§'] = generator.description
    await stampEditedAt(api, config, predictorId)
}

export const updateOutlierThreshold = async (
    api: D2Api,
    deId: string,
    newSD: string
): Promise<void> => {
    const outliers = await api.get<StoreEntry[]>('dataStore/dqConfig/outliers')
    const entryIndex = outliers.findIndex(
        (item) => Object.keys(item)[0] === deId
    )
    if (entryIndex === -1) {
        throw new Error('Outlier configuration not found.')
    }
    const config = outliers[entryIndex][deId]

    if (config['§PD_THRESHOLD_V2§']) {
        await updateThresholdV2(api, config, newSD)
        outliers[entryIndex] = { [deId]: config }
        await api.put('dataStore/dqConfig', 'outliers', outliers)
        return
    }

    const oldSD = config['§VAL_STDDEV§'] as string

    const substitute = (value?: string): string =>
        replaceSD(value || '', oldSD, newSD)
    const rename = (object: MetadataObject): void => {
        object.name = substitute(object.name)
        object.shortName = substitute(object.shortName)
        object.description = substitute(object.description)
    }

    const configIds = (keys: string[]): string[] =>
        keys
            .map((key) => config[key])
            .filter((value): value is string => Boolean(value))

    // Only names/descriptions/expressions that embed the SD value change
    await updateObjects(api, {
        endpoint: 'dataElements',
        ids: configIds(['§DE_THRESHOLD§', '§DE_NOUTLIER_VAL§']),
        mutate: rename,
    })
    const thresholdPredictorIds = configIds(['§PD_THRESHOLD§'])
    await updateObjects(api, {
        endpoint: 'predictors',
        ids: thresholdPredictorIds,
        mutate: (predictor) => {
            rename(predictor)
            if (predictor.generator) {
                predictor.generator.expression = substitute(
                    predictor.generator.expression
                )
                predictor.generator.description = substitute(
                    predictor.generator.description
                )
                if (predictor.generator.displayDescription) {
                    predictor.generator.displayDescription = substitute(
                        predictor.generator.displayDescription
                    )
                }
            }
        },
    })
    await updateObjects(api, {
        endpoint: 'indicators',
        ids: configIds(['§IN_NOUTLIER_PROP§', '§IN_OUTLIER_PROP§']),
        mutate: rename,
    })

    config['§VAL_STDDEV§'] = newSD
    // Record when the app itself modified the generated metadata, so the
    // deletion safety gate can distinguish app edits from manual edits.
    await stampEditedAt(api, config, thresholdPredictorIds[0])
    outliers[entryIndex] = { [deId]: config }
    await api.put('dataStore/dqConfig', 'outliers', outliers)
}
