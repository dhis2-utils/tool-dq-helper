// Removal of a configuration: dataStore + group membership cleanup, and
// optional deletion of the generated metadata guarded by four safety
// gates (ownership, edit-time, template match, dry-run references).
import { D2Api, errorMessage } from './api'
import { removeFromGroup } from './importer'
import {
    CHECK_TYPES,
    labelMapsByCheck,
    checkTypeLabel,
    collectTemplateEntries,
    kindFromPlaceholder,
    labelForPlaceholder,
    templateToRegex,
} from './labels'
import {
    BaseConfig,
    CheckType,
    MetadataKind,
    MetadataObject,
    PlaceholderConfig,
    StoreEntry,
} from './types'

interface Candidate {
    id: string
    placeholderKey: string
    kind: MetadataKind
}

interface GateFailure extends Candidate {
    reason: string
}

interface CheckEvaluation {
    ok: boolean
    failures: GateFailure[]
    candidates: Candidate[]
    deleted?: boolean
    deleteError?: string
}

const ENDPOINT_BY_KIND: Record<MetadataKind, string> = {
    dataElement: 'dataElements',
    predictor: 'predictors',
    indicator: 'indicators',
}

const entryConfig = (
    entry: StoreEntry | undefined,
    key: string
): PlaceholderConfig | null => (entry ? entry[key] || null : null)

/**
 * Build candidate metadata lists per check type from the stored config.
 * Only values that look like real UIDs (11 chars) are included.
 */
interface CandidateSource {
    outlierEntry: StoreEntry | undefined
    consistencyEntry: StoreEntry | undefined
    completenessEntry: StoreEntry | undefined
    deId: string
}

const buildCandidateSets = (
    source: CandidateSource
): Partial<Record<CheckType, Candidate[]>> => {
    const { outlierEntry, consistencyEntry, completenessEntry, deId } = source
    const sets: Partial<Record<CheckType, Candidate[]>> = {}
    const configs: Record<CheckType, PlaceholderConfig | null> = {
        outliers: entryConfig(outlierEntry, deId),
        consistency: entryConfig(consistencyEntry, deId),
        // The completeness entry may be keyed by an operand id
        completeness: completenessEntry
            ? completenessEntry[Object.keys(completenessEntry)[0]]
            : null,
    }

    for (const checkType of CHECK_TYPES) {
        const config = configs[checkType]
        if (!config) {
            continue
        }
        const labelMap = labelMapsByCheck()[checkType]
        const candidates: Candidate[] = []
        for (const placeholderKey of Object.keys(labelMap)) {
            const value = config[placeholderKey]
            if (typeof value === 'string' && value.length === 11) {
                const kind = kindFromPlaceholder(placeholderKey)
                if (kind) {
                    candidates.push({ id: value, placeholderKey, kind })
                }
            }
        }
        if (candidates.length > 0) {
            sets[checkType] = candidates
        }
    }
    return sets
}

/**
 * Fetch the member IDs of each app-managed group, bucketed by kind.
 */
const fetchOwnedIds = async (
    api: D2Api,
    config: BaseConfig
): Promise<Record<MetadataKind, Set<string>>> => {
    const owned: Record<MetadataKind, Set<string>> = {
        dataElement: new Set(),
        predictor: new Set(),
        indicator: new Set(),
    }

    try {
        const deGroup = await api.get<{ dataElements?: { id: string }[] }>(
            `dataElementGroups/${config.dataElementGroup}`,
            { fields: 'dataElements[id]', paging: false }
        )
        for (const member of deGroup.dataElements || []) {
            owned.dataElement.add(member.id)
        }
    } catch (error) {
        console.warn('fetchOwnedIds: failed to fetch dataElementGroup', error)
    }

    try {
        const inGroup = await api.get<{ indicators?: { id: string }[] }>(
            `indicatorGroups/${config.indicatorGroup}`,
            { fields: 'indicators[id]', paging: false }
        )
        for (const member of inGroup.indicators || []) {
            owned.indicator.add(member.id)
        }
    } catch (error) {
        console.warn('fetchOwnedIds: failed to fetch indicatorGroup', error)
    }

    const predictorGroupIds = [
        config.predictorGroup,
        config.predictorGroupThreshold,
        config.predictorGroupAnalysis,
        config.predictorGroupConsistency,
    ].filter(Boolean)
    const uniquePredictorGroupIds = [...new Set(predictorGroupIds)]
    for (const groupId of uniquePredictorGroupIds) {
        try {
            const pdGroup = await api.get<{ predictors?: { id: string }[] }>(
                `predictorGroups/${groupId}`,
                { fields: 'predictors[id]', paging: false }
            )
            for (const member of pdGroup.predictors || []) {
                owned.predictor.add(member.id)
            }
        } catch (error) {
            console.warn(
                'fetchOwnedIds: failed to fetch predictorGroup ' + groupId,
                error
            )
        }
    }

    return owned
}

/**
 * Evaluate one check type's candidates against all four safety gates.
 */
interface EvaluationSpec {
    candidates: Candidate[]
    ownedIds: Record<MetadataKind, Set<string>>
    templateMap: ReturnType<typeof collectTemplateEntries>
    // When the app itself last modified this check's metadata (threshold
    // edits) — such modifications must not trip the edit-time gate
    editedAt?: string
}

const evaluateCheckForDeletion = async (
    api: D2Api,
    spec: EvaluationSpec
): Promise<CheckEvaluation> => {
    const { candidates, ownedIds, templateMap, editedAt } = spec
    const failures: GateFailure[] = []

    // Gate 1: Ownership — each candidate must be in the app-managed group
    for (const candidate of candidates) {
        if (!ownedIds[candidate.kind]?.has(candidate.id)) {
            failures.push({ ...candidate, reason: 'not owned by app' })
        }
    }
    if (failures.length > 0) {
        return { ok: false, failures, candidates }
    }

    // Gate 2: Edit-time — batch-fetch items, require lastUpdated within
    // 5s of created (i.e. never modified after the import created them).
    // Predictor descriptions live in generator.description, not top-level.
    const fieldsByKind: Record<MetadataKind, string> = {
        dataElement: 'id,name,description,created,lastUpdated',
        predictor: 'id,name,generator[description],created,lastUpdated',
        indicator: 'id,name,description,created,lastUpdated',
    }
    const fetchedByKind: Partial<
        Record<MetadataKind, Record<string, MetadataObject>>
    > = {}
    const kindsPresent = [...new Set(candidates.map((c) => c.kind))]
    for (const kind of kindsPresent) {
        const ids = candidates
            .filter((candidate) => candidate.kind === kind)
            .map((candidate) => candidate.id)
        const endpoint = ENDPOINT_BY_KIND[kind]
        const result = await api.get<Record<string, MetadataObject[]>>(
            endpoint,
            {
                filter: `id:in:[${ids.join(',')}]`,
                fields: fieldsByKind[kind],
                paging: false,
            }
        )
        const itemMap: Record<string, MetadataObject> = {}
        for (const item of result[endpoint] || []) {
            itemMap[item.id] = item
        }
        fetchedByKind[kind] = itemMap

        // Items deleted out-of-band fail the gate
        for (const id of ids) {
            if (!itemMap[id]) {
                const missing = candidates.find(
                    (candidate) => candidate.id === id
                ) as Candidate
                failures.push({ ...missing, reason: 'no longer exists' })
            }
        }
    }
    if (failures.length > 0) {
        return { ok: false, failures, candidates }
    }

    const editedAtTime = editedAt ? new Date(editedAt).getTime() : null
    for (const candidate of candidates) {
        const item = (fetchedByKind[candidate.kind] || {})[candidate.id]
        const created = new Date(item.created as string).getTime()
        const lastUpdated = new Date(item.lastUpdated as string).getTime()
        const untouchedSinceImport = lastUpdated - created < 5000
        // Threshold edits made by this app update the metadata too; the
        // dataStore records when, so accept a lastUpdated near that time.
        // Renames outside the app are still caught by the template gate.
        const editedByApp =
            editedAtTime !== null &&
            Math.abs(lastUpdated - editedAtTime) < 60_000
        if (!untouchedSinceImport && !editedByApp) {
            failures.push({ ...candidate, reason: 'modified after creation' })
        }
    }
    if (failures.length > 0) {
        return { ok: false, failures, candidates }
    }

    // Gate 3: Template match — name and description must still match the
    // template the object was generated from.
    const templateMapEntries = templateMap
    for (const candidate of candidates) {
        const item = (fetchedByKind[candidate.kind] || {})[candidate.id]
        const template = templateMapEntries[candidate.placeholderKey]
        if (!template || !template.name) {
            failures.push({
                ...candidate,
                reason: 'no template found for placeholder',
            })
            continue
        }
        const nameRegex = templateToRegex(template.name)
        if (!nameRegex.test(item.name || '')) {
            failures.push({
                ...candidate,
                reason: 'name no longer matches template',
            })
            continue
        }
        if (template.description) {
            const currentDescription =
                candidate.kind === 'predictor'
                    ? item.generator?.description || ''
                    : item.description || ''
            const descriptionRegex = templateToRegex(template.description)
            if (!descriptionRegex.test(currentDescription)) {
                failures.push({
                    ...candidate,
                    reason: 'description no longer matches template',
                })
            }
        }
    }
    if (failures.length > 0) {
        return { ok: false, failures, candidates }
    }

    // NOTE: earlier versions had a fourth gate — a DELETE import with
    // dryRun=true to detect external references. DHIS2 (verified on
    // 2.41.9) IGNORES dryRun for importStrategy=DELETE and actually
    // deletes the objects, so that "gate" was destructive and has been
    // removed. External references are instead caught by the real delete
    // (atomicMode=ALL per object type, in dependency order): a referenced
    // object makes its delete request fail atomically, which is reported
    // to the user as "delete failed".

    return { ok: failures.length === 0, failures, candidates }
}

const configIds = (config: PlaceholderConfig, keys: string[]): string[] =>
    keys
        .map((key) => config[key])
        .filter((value): value is string => Boolean(value))

export interface DeleteOutcome {
    message: string
    hasWarnings: boolean
}

/**
 * Remove the configuration for a data element: group membership,
 * dataStore entries, and (optionally, gated) the generated metadata.
 */
export interface DeleteRequest {
    baseConfig: BaseConfig
    deId: string
    deName: string
    alsoDeleteMetadata: boolean
}

export const deleteConfiguration = async (
    api: D2Api,
    request: DeleteRequest
): Promise<DeleteOutcome> => {
    const { baseConfig, deId, deName, alsoDeleteMetadata } = request
    const outliers = await api.get<StoreEntry[]>('dataStore/dqConfig/outliers')
    const consistency = await api.get<StoreEntry[]>(
        'dataStore/dqConfig/consistency'
    )
    const completeness = await api.get<StoreEntry[]>(
        'dataStore/dqConfig/completeness'
    )

    const deIdBase = deId.split('.')[0]

    const outlierEntry = outliers.find((item) => Object.keys(item)[0] === deId)
    const consistencyEntry = consistency.find(
        (item) => Object.keys(item)[0] === deId
    )
    // Completeness — dual match: overview cards are normalised to the bare
    // DE id, so a bare deId must still match entries stored under an
    // operand id (deId.cocId) and vice versa.
    const completenessEntry = completeness.find((item) => {
        const key = Object.keys(item)[0]
        return key === deId || key.split('.')[0] === deIdBase
    })

    // --- Metadata-deletion safety gates ---
    // These MUST be evaluated before the group-membership cleanup below:
    // the ownership gate checks membership of the app-managed groups,
    // which the cleanup removes. (Evaluating after the cleanup made the
    // ownership gate always fail — a bug in the pre-platform tool.)
    const perCheckResults: Partial<Record<CheckType, CheckEvaluation>> = {}
    if (alsoDeleteMetadata) {
        const candidateSets = buildCandidateSets({
            outlierEntry,
            consistencyEntry,
            completenessEntry,
            deId,
        })
        const ownedIds = await fetchOwnedIds(api, baseConfig)
        const templateMap = collectTemplateEntries()
        const completenessKey = completenessEntry
            ? Object.keys(completenessEntry)[0]
            : deId
        const editedAtByCheck: Partial<Record<CheckType, string>> = {
            outliers: outlierEntry?.[deId]?.editedAt as string | undefined,
            consistency: consistencyEntry?.[deId]?.editedAt as
                | string
                | undefined,
            completeness: completenessEntry?.[completenessKey]?.editedAt as
                | string
                | undefined,
        }

        for (const checkType of CHECK_TYPES) {
            const candidates = candidateSets[checkType]
            if (!candidates) {
                continue
            }
            try {
                perCheckResults[checkType] = await evaluateCheckForDeletion(
                    api,
                    {
                        candidates,
                        ownedIds,
                        templateMap,
                        editedAt: editedAtByCheck[checkType],
                    }
                )
            } catch (evalError) {
                perCheckResults[checkType] = {
                    ok: false,
                    failures: [
                        {
                            id: 'N/A',
                            placeholderKey: 'N/A',
                            kind: 'dataElement',
                            reason:
                                'evaluation error: ' + errorMessage(evalError),
                        },
                    ],
                    candidates,
                }
            }
        }
    }

    // Remove the generated objects from the app-managed groups
    const removeIfAny = async (
        groupKind: 'dataElementGroups' | 'indicatorGroups' | 'predictorGroups',
        groupId: string,
        memberIds: string[]
    ): Promise<void> => {
        if (memberIds.length > 0) {
            await removeFromGroup(api, { groupKind, groupId, memberIds })
        }
    }

    if (outlierEntry) {
        const config = outlierEntry[deId]
        const pdIds = configIds(config, [
            '§PD_NOUTLIER_COUNT§',
            '§PD_NOUTLIER_VAL§',
            '§PD_OUTLIER_COUNT§',
            '§PD_OUTLIER_VAL§',
            '§PD_THRESHOLD§',
            '§PD_THRESHOLD_V2§',
        ])
        const thresholdPdIds = configIds(config, [
            '§PD_THRESHOLD§',
            '§PD_THRESHOLD_V2§',
        ])
        const analysisPdIds = pdIds.filter((id) => !thresholdPdIds.includes(id))

        await removeIfAny(
            'dataElementGroups',
            baseConfig.dataElementGroup,
            configIds(config, [
                '§DE_NOUTLIER_COUNT§',
                '§DE_NOUTLIER_VAL§',
                '§DE_OUTLIER_COUNT§',
                '§DE_OUTLIER_VAL§',
                '§DE_THRESHOLD§',
                '§DE_THRESHOLD_V2§',
            ])
        )
        await removeIfAny(
            'indicatorGroups',
            baseConfig.indicatorGroup,
            configIds(config, [
                '§IN_NOUTLIER_PROP§',
                '§IN_OUTLIER_PROP§',
                '§IN_NOUTLIER_PROP_V2§',
                '§IN_OUTLIER_PROP_V2§',
                '§IN_OUTLIER_VAL_V2§',
            ])
        )
        await removeIfAny('predictorGroups', baseConfig.predictorGroup, pdIds)
        await removeIfAny(
            'predictorGroups',
            baseConfig.predictorGroupThreshold,
            thresholdPdIds
        )
        await removeIfAny(
            'predictorGroups',
            baseConfig.predictorGroupAnalysis,
            analysisPdIds
        )
    }

    if (consistencyEntry) {
        const config = consistencyEntry[deId]
        const pdIds = configIds(config, ['§PD_CONS_ALL§', '§PD_CONS_ANY§'])

        await removeIfAny(
            'dataElementGroups',
            baseConfig.dataElementGroup,
            configIds(config, ['§DE_CONS_ALL§', '§DE_CONS_ANY§'])
        )
        await removeIfAny(
            'indicatorGroups',
            baseConfig.indicatorGroup,
            configIds(config, ['§IN_CONS_PROP§', '§IN_CONS_PROP_V2§'])
        )
        await removeIfAny('predictorGroups', baseConfig.predictorGroup, pdIds)
        await removeIfAny(
            'predictorGroups',
            baseConfig.predictorGroupConsistency,
            pdIds
        )
    }

    if (completenessEntry) {
        const key = Object.keys(completenessEntry)[0]
        const config = completenessEntry[key]
        await removeIfAny(
            'indicatorGroups',
            baseConfig.indicatorGroup,
            configIds(config, ['§IN_COMPL§', '§IN_COMPL_ANY§', '§IN_COMPL_V2§'])
        )
    }

    // Remove entries from the dataStore arrays
    const newOutliers = outliers.filter((item) => Object.keys(item)[0] !== deId)
    const newConsistency = consistency.filter(
        (item) => Object.keys(item)[0] !== deId
    )
    const newCompleteness = completeness.filter((item) => {
        const key = Object.keys(item)[0]
        return !(key === deId || key.split('.')[0] === deIdBase)
    })

    await api.put('dataStore/dqConfig', 'outliers', newOutliers)
    await api.put('dataStore/dqConfig', 'consistency', newConsistency)
    await api.put('dataStore/dqConfig', 'completeness', newCompleteness)

    if (!alsoDeleteMetadata) {
        return {
            message: `Configuration for '${deName}' removed successfully.`,
            hasWarnings: false,
        }
    }

    // Real delete per check where all gates passed. Delete in dependency
    // order: indicators first (leaf objects), then predictors (reference
    // DEs as output), then data elements — otherwise DHIS2 rejects DE
    // deletes because the referencing objects still exist.
    const deleteOrder: MetadataKind[] = [
        'indicator',
        'predictor',
        'dataElement',
    ]
    for (const checkType of CHECK_TYPES) {
        const result = perCheckResults[checkType]
        if (!result || !result.ok) {
            continue
        }
        let deleteFailed = false
        let deleteFailReason = ''
        for (const kind of deleteOrder) {
            if (deleteFailed) {
                break
            }
            const idsForKind = result.candidates
                .filter((candidate) => candidate.kind === kind)
                .map((candidate) => ({ id: candidate.id }))
            if (idsForKind.length === 0) {
                continue
            }
            try {
                await api.post(
                    'metadata',
                    { [kind + 's']: idsForKind },
                    { importStrategy: 'DELETE', atomicMode: 'ALL' }
                )
            } catch (deleteError) {
                deleteFailed = true
                deleteFailReason = kind + 's: ' + errorMessage(deleteError)
            }
        }
        result.deleted = !deleteFailed
        if (deleteFailed) {
            result.deleteError = deleteFailReason
        }
    }

    // Dev inspection — full per-check detail on the browser console
    console.log('perCheckResults:', perCheckResults)

    const summaryParts = ['Config removed.']
    let hasWarnings = false
    for (const checkType of CHECK_TYPES) {
        const result = perCheckResults[checkType]
        if (!result) {
            continue
        }
        const label = checkTypeLabel(checkType)
        if (result.deleted) {
            summaryParts.push(`${label} metadata: deleted.`)
        } else if (result.deleteError) {
            hasWarnings = true
            summaryParts.push(
                `${label} metadata: delete failed (${result.deleteError}).`
            )
        } else {
            hasWarnings = true
            if (result.failures.length > 0) {
                const firstFailure = result.failures[0]
                const failLabel = labelForPlaceholder(
                    firstFailure.placeholderKey
                )
                summaryParts.push(
                    `${label} metadata: skipped (${failLabel} '${firstFailure.id}' ${firstFailure.reason}).`
                )
            } else {
                summaryParts.push(`${label} metadata: skipped.`)
            }
        }
    }

    return { message: summaryParts.join(' '), hasWarnings }
}
