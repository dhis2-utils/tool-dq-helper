// Executes a previewed configuration: imports the metadata bundles,
// adds the created objects to the app-managed groups, and records the
// configuration in the dataStore.
import { D2Api, errorStatus } from './api'
import {
    BaseConfig,
    CheckImport,
    ImportResultRow,
    MetadataObject,
    PendingImport,
    PlaceholderConfig,
    StoreEntry,
} from './types'

interface ImportReport {
    status: string
}

type GroupKind = 'dataElementGroups' | 'indicatorGroups' | 'predictorGroups'
const MEMBER_FIELD: Record<GroupKind, string> = {
    dataElementGroups: 'dataElements',
    indicatorGroups: 'indicators',
    predictorGroups: 'predictors',
}

interface GroupChange {
    groupKind: GroupKind
    groupId: string
}

const addToGroup = async (
    api: D2Api,
    change: GroupChange & { members: { id: string }[] }
): Promise<ImportReport> => {
    const { groupKind, groupId, members } = change
    const group = await api.get<Record<string, { id: string }[]>>(
        `${groupKind}/${groupId}`,
        { fields: ':owner' }
    )
    const memberField = MEMBER_FIELD[groupKind]
    const existing = group[memberField] || []
    for (const member of members) {
        existing.push({ id: member.id })
    }
    group[memberField] = existing
    return api.put<ImportReport>(groupKind, groupId, group)
}

export const removeFromGroup = async (
    api: D2Api,
    change: GroupChange & { memberIds: string[] }
): Promise<ImportReport> => {
    const { groupKind, groupId, memberIds } = change
    const group = await api.get<Record<string, { id: string }[]>>(
        `${groupKind}/${groupId}`,
        { fields: ':owner' }
    )
    const memberField = MEMBER_FIELD[groupKind]
    group[memberField] = (group[memberField] || []).filter(
        (member) => !memberIds.includes(member.id)
    )
    return api.put<ImportReport>(groupKind, groupId, group)
}

const splitOutlierPredictors = (
    outlierConfig: PlaceholderConfig,
    predictors: MetadataObject[]
): { threshold: MetadataObject[]; analysis: MetadataObject[] } => {
    const result: { threshold: MetadataObject[]; analysis: MetadataObject[] } =
        {
            threshold: [],
            analysis: [],
        }
    for (const predictor of predictors) {
        if (
            outlierConfig['§PD_THRESHOLD§'] === predictor.id ||
            outlierConfig['§PD_THRESHOLD_V2§'] === predictor.id
        ) {
            result.threshold.push(predictor)
        } else {
            result.analysis.push(predictor)
        }
    }
    return result
}

/** Append this check's config to its dataStore array. */
const saveToDataStore = async (
    api: D2Api,
    storeKey: string,
    config: PlaceholderConfig
): Promise<ImportReport> => {
    const store = await api.get<StoreEntry[]>(`dataStore/dqConfig/${storeKey}`)
    store.push({ [config['§DE_SOURCE§'] as string]: config })
    return api.put<ImportReport>('dataStore/dqConfig', storeKey, store)
}

const rowFor = (
    label: string,
    report: ImportReport | undefined,
    error?: unknown
): ImportResultRow => {
    if (error !== undefined) {
        return { label, status: errorStatus(error), success: false }
    }
    const status = report?.status || 'OK'
    return { label, status, success: status === 'OK' || status === 'SUCCESS' }
}

interface ImportCheckSpec {
    checkLabel: string
    checkImport: CheckImport
    storeKey: string
    addGroupSteps: {
        label: string
        groupKind: GroupKind
        groupId: string
        members: MetadataObject[]
    }[]
}

const importCheck = async (
    api: D2Api,
    spec: ImportCheckSpec
): Promise<ImportResultRow[]> => {
    const { checkLabel, checkImport, storeKey, addGroupSteps } = spec
    const results: ImportResultRow[] = []

    try {
        const report = await api.post<ImportReport>(
            'metadata',
            checkImport.metadata
        )
        results.push(rowFor(`${checkLabel} - Metadata import`, report))
    } catch (error) {
        results.push(
            rowFor(`${checkLabel} - Metadata import`, undefined, error)
        )
        // Metadata import failed — skip group/dataStore updates for this check
        return results
    }

    try {
        for (const step of addGroupSteps) {
            // V2 checks have no predictors/data elements for some steps
            if (step.members.length === 0) {
                continue
            }
            const report = await addToGroup(api, {
                groupKind: step.groupKind,
                groupId: step.groupId,
                members: step.members,
            })
            results.push(rowFor(`${checkLabel} - ${step.label}`, report))
        }
    } catch (error) {
        results.push(rowFor(`${checkLabel} - Add to groups`, undefined, error))
    }

    try {
        const report = await saveToDataStore(api, storeKey, checkImport.config)
        results.push(rowFor(`${checkLabel} - Save DQ helper config`, report))
    } catch (error) {
        results.push(
            rowFor(`${checkLabel} - Save DQ helper config`, undefined, error)
        )
    }

    return results
}

export const runImport = async (
    api: D2Api,
    pending: PendingImport,
    baseConfig: BaseConfig
): Promise<ImportResultRow[]> => {
    const outlierPredictors = splitOutlierPredictors(
        pending.outlier.config,
        pending.outlier.metadata.predictors || []
    )

    const outlierResults = await importCheck(api, {
        checkLabel: 'Outlier',
        checkImport: pending.outlier,
        storeKey: 'outliers',
        addGroupSteps: [
            {
                label: 'Add to data element group',
                groupKind: 'dataElementGroups',
                groupId: baseConfig.dataElementGroup,
                members: pending.outlier.metadata.dataElements || [],
            },
            {
                label: 'Add to indicator group',
                groupKind: 'indicatorGroups',
                groupId: baseConfig.indicatorGroup,
                members: pending.outlier.metadata.indicators || [],
            },
            {
                label: 'Add to general predictor group',
                groupKind: 'predictorGroups',
                groupId: baseConfig.predictorGroup,
                members: pending.outlier.metadata.predictors || [],
            },
            {
                label: 'Add to threshold predictor group',
                groupKind: 'predictorGroups',
                groupId: baseConfig.predictorGroupThreshold,
                members: outlierPredictors.threshold,
            },
            {
                label: 'Add to analysis predictor group',
                groupKind: 'predictorGroups',
                groupId: baseConfig.predictorGroupAnalysis,
                members: outlierPredictors.analysis,
            },
        ],
    })

    const consistencyResults = await importCheck(api, {
        checkLabel: 'Consistency',
        checkImport: pending.consistency,
        storeKey: 'consistency',
        addGroupSteps: [
            {
                label: 'Add to data element group',
                groupKind: 'dataElementGroups',
                groupId: baseConfig.dataElementGroup,
                members: pending.consistency.metadata.dataElements || [],
            },
            {
                label: 'Add to indicator group',
                groupKind: 'indicatorGroups',
                groupId: baseConfig.indicatorGroup,
                members: pending.consistency.metadata.indicators || [],
            },
            {
                label: 'Add to general predictor group',
                groupKind: 'predictorGroups',
                groupId: baseConfig.predictorGroup,
                members: pending.consistency.metadata.predictors || [],
            },
            {
                label: 'Add to consistency predictor group',
                groupKind: 'predictorGroups',
                groupId: baseConfig.predictorGroupConsistency,
                members: pending.consistency.metadata.predictors || [],
            },
        ],
    })

    // Completeness may include predictors/data elements (disaggregated
    // "any value" approach) — but only indicators are added to groups,
    // matching the original tool's behaviour.
    const completenessResults = await importCheck(api, {
        checkLabel: 'Completeness',
        checkImport: pending.completeness,
        storeKey: 'completeness',
        addGroupSteps: [
            {
                label: 'Add to indicator group',
                groupKind: 'indicatorGroups',
                groupId: baseConfig.indicatorGroup,
                members: pending.completeness.metadata.indicators || [],
            },
        ],
    })

    return [...outlierResults, ...consistencyResults, ...completenessResults]
}
