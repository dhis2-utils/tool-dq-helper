// Placeholder-key → [metadata kind, human label] maps, plus helpers for
// translating between placeholder keys, metadata kinds and labels.
// The placeholder keys (with § markers) are the dataStore format — do not
// change them. The maps are built lazily (functions) so the labels pick
// up the active locale instead of being frozen at module load.
import i18n from '@dhis2/d2-i18n'
import {
    templateCompleteness,
    templateCompletenessDisaggregated,
    templateConsistency,
    templateHybridCompleteness,
    templateHybridConsistency,
    templateHybridOutlier,
    templateOutlier,
} from './templates'
import { CheckType, MetadataKind } from './types'

type LabelMap = Record<string, [MetadataKind, string]>

const outlierMetadataLabels = (): LabelMap => ({
    '§DE_NOUTLIER_VAL§': [
        'dataElement',
        i18n.t('Excluding outliers (data element)'),
    ],
    '§DE_NOUTLIER_COUNT§': [
        'dataElement',
        i18n.t('Non-outlier count (data element)'),
    ],
    '§DE_OUTLIER_COUNT§': [
        'dataElement',
        i18n.t('Outlier count (data element)'),
    ],
    '§DE_OUTLIER_VAL§': [
        'dataElement',
        i18n.t('Outlier values (data element)'),
    ],
    '§DE_THRESHOLD§': [
        'dataElement',
        i18n.t('Outlier threshold (data element)'),
    ],
    '§PD_NOUTLIER_VAL§': [
        'predictor',
        i18n.t('Excluding outliers (predictor)'),
    ],
    '§PD_NOUTLIER_COUNT§': [
        'predictor',
        i18n.t('Non-outlier count (predictor)'),
    ],
    '§PD_OUTLIER_COUNT§': ['predictor', i18n.t('Outlier count (predictor)')],
    '§PD_OUTLIER_VAL§': ['predictor', i18n.t('Outlier values (predictor)')],
    '§PD_THRESHOLD§': ['predictor', i18n.t('Outlier threshold (predictor)')],
    '§IN_NOUTLIER_PROP§': ['indicator', i18n.t('Excluding outliers (%)')],
    '§IN_OUTLIER_PROP§': ['indicator', i18n.t('Values that are outliers (%)')],
    // V2 hybrid layout
    '§DE_THRESHOLD_V2§': [
        'dataElement',
        i18n.t('Outlier threshold (data element)'),
    ],
    '§PD_THRESHOLD_V2§': ['predictor', i18n.t('Outlier threshold (predictor)')],
    '§IN_OUTLIER_PROP_V2§': [
        'indicator',
        i18n.t('Values that are outliers (%)'),
    ],
    '§IN_NOUTLIER_PROP_V2§': ['indicator', i18n.t('Excluding outliers (%)')],
    '§IN_OUTLIER_VAL_V2§': ['indicator', i18n.t('Outlier values')],
})

const consistencyMetadataLabels = (): LabelMap => ({
    '§DE_CONS_ALL§': [
        'dataElement',
        i18n.t('Reported all 12 months (data element)'),
    ],
    '§DE_CONS_ANY§': [
        'dataElement',
        i18n.t('Reported any of last 12 months (data element)'),
    ],
    '§PD_CONS_ALL§': [
        'predictor',
        i18n.t('Reported all 12 months (predictor)'),
    ],
    '§PD_CONS_ANY§': [
        'predictor',
        i18n.t('Reported any of last 12 months (predictor)'),
    ],
    '§IN_CONS_PROP§': ['indicator', i18n.t('Consistent reporting (%)')],
    '§IN_CONS_PROP_V2§': ['indicator', i18n.t('Consistent reporting (%)')],
})

const completenessMetadataLabels = (): LabelMap => ({
    '§IN_COMPL§': ['indicator', i18n.t('Completeness (%)')],
    '§DE_COMPL_ANY§': [
        'dataElement',
        i18n.t('Reported any disaggregation (data element)'),
    ],
    '§PD_COMPL_ANY§': [
        'predictor',
        i18n.t('Reported any disaggregation (predictor)'),
    ],
    '§IN_COMPL_ANY§': [
        'indicator',
        i18n.t('Completeness any disaggregation (%)'),
    ],
    '§IN_COMPL_V2§': ['indicator', i18n.t('Completeness (%)')],
})

export const labelMapsByCheck = (): Record<CheckType, LabelMap> => ({
    outliers: outlierMetadataLabels(),
    consistency: consistencyMetadataLabels(),
    completeness: completenessMetadataLabels(),
})

export const allLabelMaps = (): LabelMap[] => [
    outlierMetadataLabels(),
    consistencyMetadataLabels(),
    completenessMetadataLabels(),
]

export const CHECK_TYPES: CheckType[] = [
    'outliers',
    'consistency',
    'completeness',
]

/** Display label for an organisation unit level, e.g. "Level 4 - Facility". */
export const formatOuLevelName = (level: number, displayName: string): string =>
    `Level ${level} - ${displayName}`

export const checkTypeLabel = (checkType: CheckType): string => {
    switch (checkType) {
        case 'outliers':
            return i18n.t('Outliers')
        case 'consistency':
            return i18n.t('Consistency')
        case 'completeness':
            return i18n.t('Completeness')
    }
}

/** Human-readable label for a placeholder key, falling back to the key. */
export const labelForPlaceholder = (placeholderKey: string): string => {
    for (const map of allLabelMaps()) {
        if (map[placeholderKey]) {
            return map[placeholderKey][1]
        }
    }
    return placeholderKey
}

/** Derive the metadata kind from a placeholder key prefix. */
export const kindFromPlaceholder = (
    placeholderKey: string
): MetadataKind | null => {
    if (placeholderKey.startsWith('§DE_')) {
        return 'dataElement'
    }
    if (placeholderKey.startsWith('§PD_')) {
        return 'predictor'
    }
    if (placeholderKey.startsWith('§IN_')) {
        return 'indicator'
    }
    return null
}

interface TemplateEntry {
    name: string
    description: string | null
    shortName?: string
    kind: MetadataKind
}

/**
 * Map from placeholder key (e.g. "§DE_NOUTLIER_VAL§") to the template
 * name/description used when that object was generated. Used by the
 * deletion safety gates to verify objects are still unmodified.
 */
export const collectTemplateEntries = (): Record<string, TemplateEntry> => {
    const map: Record<string, TemplateEntry> = {}
    const bundles = [
        templateOutlier(),
        templateConsistency(),
        templateCompleteness(),
        templateCompletenessDisaggregated(),
        templateHybridOutlier(),
        templateHybridConsistency(),
        templateHybridCompleteness(),
    ]
    const kinds = ['dataElements', 'predictors', 'indicators'] as const
    for (const bundle of bundles) {
        for (const kind of kinds) {
            for (const entry of bundle[kind] || []) {
                if (entry.id && entry.id.startsWith('§')) {
                    // For predictors, the deletion gate always compares
                    // generator.description (not the top-level description),
                    // so we must store the same field here. Consistency
                    // predictors have BOTH a top-level description and a
                    // generator.description with different text.
                    const isPredictor = kind === 'predictors'
                    const description =
                        isPredictor && entry.generator?.description
                            ? entry.generator.description
                            : entry.description ||
                              entry.generator?.description ||
                              null
                    map[entry.id] = {
                        name: entry.name,
                        description,
                        shortName: entry.shortName,
                        // "dataElements" -> "dataElement", etc.
                        kind: kind.slice(0, -1) as MetadataKind,
                    }
                }
            }
        }
    }
    return map
}

/**
 * Convert a template string (containing §PLACEHOLDER§ tokens) into a
 * regex that matches any substitution at those positions.
 */
export const templateToRegex = (templateStr: string): RegExp => {
    const parts = templateStr.split(/§[^§]*§/)
    const pattern = parts
        .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*?')
    return new RegExp('^' + pattern + '$')
}
