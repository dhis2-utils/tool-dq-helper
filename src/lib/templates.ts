// Metadata templates for the three data quality check types.
// Ported verbatim from the pre-App-Platform version — the JSON shape,
// names and descriptions MUST stay identical: the deletion safety gates
// match existing metadata against these templates, including metadata
// created by older versions of the tool.
//
// §PLACEHOLDER§ tokens are substituted at preview time (see configure.ts).
import { MetadataBundle } from './types'

export const templateCompleteness = (): MetadataBundle => {
    return {
        indicators: [
            {
                name: 'DQ - §NAME§ data element completeness (%)',
                shortName: '§SHORTNAME§ completeness (%)',
                description:
                    '§NAME§ data element completeness, defined as 100 x (count of reported values)/(expected reports).',
                annualized: false,
                indicatorType: {
                    id: '§IN_TYPE§',
                },
                numerator: 'subExpression(if(isNotNull(#{§DE_SOURCE§}), 1, 0))',
                numeratorDescription: '§NAME§ count of values',
                denominator: 'R{§DS_SOURCE§.EXPECTED_REPORTS}',
                denominatorDescription: '§NAME_DS§ - Expected reports',
                id: '§IN_COMPL§',
            },
        ],
    }
}

export const templateCompletenessDisaggregated = (): MetadataBundle => {
    return {
        dataElements: [
            {
                aggregationType: 'SUM',
                domainType: 'AGGREGATE',
                id: '§DE_COMPL_ANY§',
                name: 'DQ - §NAME§ data reported for any disaggregation',
                shortName: '§SHORTNAME§ any disaggr',
                valueType: 'INTEGER_ZERO_OR_POSITIVE',
                zeroIsSignificant: false,
                description:
                    'Auto-generated from predictor. Count of orgunits (facilities) that reported §NAME§ for any disaggregation. Used to calculate data element completeness.',
            },
        ],
        indicators: [
            {
                annualized: false,
                denominator: 'R{§DS_SOURCE§.EXPECTED_REPORTS}',
                denominatorDescription: '§NAME_DS§ - Expected reports',
                description:
                    '§NAME§ data element completeness, defined as 100 x (count of reported values)/(expected reports). The data element is considered reported if there is data for any disaggregation.',
                id: '§IN_COMPL_ANY§',
                indicatorType: {
                    id: '§IN_TYPE§',
                },
                name: 'DQ - §NAME§ data element completeness (%)',
                numerator: '§DE_COMPL_ANY§',
                numeratorDescription:
                    '§NAME§ count of values (for any disaggregation)',
                shortName: '§SHORTNAME§ completeness (%)',
            },
        ],
        predictors: [
            {
                name: 'DQ - §NAME§ data reported for any disaggregation',
                shortName: '§SHORTNAME§ any disaggr',
                id: '§PD_COMPL_ANY§',
                generator: {
                    description: '§NAME§ data for any disaggregation',
                    expression: '(if(isNotNull(#{§DE_SOURCE§}), 1, 0))',
                    missingValueStrategy: 'SKIP_IF_ALL_VALUES_MISSING',
                    slidingWindow: false,
                },
                annualSampleCount: 0,
                sequentialSampleCount: 0,
                organisationUnitLevels: [
                    {
                        id: '§OU_LEVEL§',
                    },
                ],
                organisationUnitDescendants: 'SELECTED',
                output: {
                    id: '§DE_COMPL_ANY§',
                },
                outputCombo: {
                    id: '§COC_DEFAULT§',
                },
                periodType: 'Monthly',
            },
        ],
    }
}

export const templateConsistency = (): MetadataBundle => {
    return {
        dataElements: [
            {
                name: 'DQ - §NAME§ orgunits reported in all the last 12 Months',
                shortName: '§SHORTNAME§ all last 12 mnths',
                description:
                    'Auto-generated from predictor. Count of orgunits (facilities) that reported §NAME§ in ALL the 12 months prior to the reporting period.',
                aggregationType: 'SUM',
                valueType: 'INTEGER_ZERO_OR_POSITIVE',
                domainType: 'AGGREGATE',
                zeroIsSignificant: false,
                id: '§DE_CONS_ALL§',
            },
            {
                name: 'DQ - §NAME§ orgunits reported in any of the last 12 Months',
                shortName: '§SHORTNAME§ any last 12 mnths',
                description:
                    "Auto-generated from predictor. Count of orgunits (facilities) that reported §NAME§ in ANY of the 12 months prior to the reporting period. Used as an alternative measure of 'expected reports' for completeness.",
                aggregationType: 'SUM',
                valueType: 'INTEGER_ZERO_OR_POSITIVE',
                domainType: 'AGGREGATE',
                zeroIsSignificant: false,
                id: '§DE_CONS_ANY§',
            },
        ],
        indicators: [
            {
                name: 'DQ - §NAME§ facilities consistently reporting last 12 months (%)',
                shortName: '§SHORTNAME§ reported 12 mnths (%)',
                description:
                    'The percentage of facilities that reported §NAME§ in all the previous 12 months, out of those facilities that reported §NAME§ in any of the previous 12 months.',
                annualized: false,
                decimals: 1,
                indicatorType: {
                    id: '§IN_TYPE§',
                },
                numerator: '#{§DE_CONS_ALL§}',
                numeratorDescription:
                    'Orgunits reported §NAME§ in all the last 12 Months',
                denominator: '#{§DE_CONS_ANY§}',
                denominatorDescription:
                    'Orgunits reported §NAME§ in any of the last 12 Months',
                id: '§IN_CONS_PROP§',
            },
        ],
        predictors: [
            {
                name: 'DQ - §NAME§ orgunits reported in all the last 12 Months',
                shortName: '§SHORTNAME§ all last 12 mnths',
                description:
                    'Count of orgunits (facilities) that reported §NAME§ in ALL the 12 months prior to the reporting period.',
                output: {
                    id: '§DE_CONS_ALL§',
                },
                outputCombo: {
                    id: '§COC_DEFAULT§',
                },
                generator: {
                    expression:
                        'if(sum(if(isNotNull(#{§DE_SOURCE§}),1,0)) == 12,1,0)',
                    description:
                        '§NAME§ reported in all the previous 12 months',
                    slidingWindow: false,
                    missingValueStrategy: 'SKIP_IF_ALL_VALUES_MISSING',
                },
                periodType: 'Monthly',
                organisationUnitLevels: [
                    {
                        id: '§OU_LEVEL§',
                    },
                ],
                organisationUnitDescendants: 'SELECTED',
                sequentialSampleCount: 12,
                annualSampleCount: 0,
                sequentialSkipCount: 0,
                id: '§PD_CONS_ALL§',
            },
            {
                name: 'DQ - §NAME§ orgunits reported in any of the last 12 Months',
                shortName: '§SHORTNAME§ any last 12 mnths',
                description:
                    "Count of orgunits (facilities) that reported §NAME§ in ANY of the 12 months prior to the reporting period. Used as an alternative measure of 'expected reports' for completeness.",
                output: {
                    id: '§DE_CONS_ANY§',
                },
                outputCombo: {
                    id: '§COC_DEFAULT§',
                },
                generator: {
                    expression: 'if(isNotNull(sum(#{§DE_SOURCE§})),1,0)',
                    description:
                        '§NAME§ reported in any of the previous 12 months',
                    slidingWindow: false,
                    missingValueStrategy: 'SKIP_IF_ALL_VALUES_MISSING',
                },
                periodType: 'Monthly',
                organisationUnitLevels: [
                    {
                        id: '§OU_LEVEL§',
                    },
                ],
                organisationUnitDescendants: 'SELECTED',
                sequentialSampleCount: 12,
                annualSampleCount: 0,
                sequentialSkipCount: 0,
                id: '§PD_CONS_ANY§',
            },
        ],
    }
}

export const templateOutlier = (): MetadataBundle => {
    return {
        dataElements: [
            {
                aggregationType: 'SUM',
                description:
                    'Auto-generated from predictor. This data element mirrors the §NAME§ data element (total for all disaggregations), but with values outside the specified outlier threshold (mean + §VAL_STDDEV§ SD) excluded. This allows doing analysis of the significance/impact of outliers.',
                domainType: 'AGGREGATE',
                id: '§DE_NOUTLIER_VAL§',
                name: 'DQ - §NAME§ excluding outliers',
                shortName: '§SHORTNAME§ excl outlier',
                valueType: 'INTEGER_ZERO_OR_POSITIVE',
            },
            {
                aggregationType: 'SUM',
                description:
                    'Auto-generated from predictor. The count of §NAME§ data values reported (total for disaggregations) that are not outliers.',
                domainType: 'AGGREGATE',
                id: '§DE_NOUTLIER_COUNT§',
                name: 'DQ - §NAME§ non-outlier count',
                shortName: '§SHORTNAME§ non-outl count',
                valueType: 'INTEGER_ZERO_OR_POSITIVE',
            },
            {
                aggregationType: 'SUM',
                description:
                    'Auto-generated from predictor. The count of §NAME§ data values reported (total for disaggregations) that are outliers.',
                domainType: 'AGGREGATE',
                id: '§DE_OUTLIER_COUNT§',
                name: 'DQ - §NAME§ outlier count',
                shortName: '§SHORTNAME§ outlier count',
                valueType: 'INTEGER_ZERO_OR_POSITIVE',
            },
            {
                aggregationType: 'SUM',
                description:
                    'Auto-generated from predictor. The outlier threshold for §NAME§, defined as mean + §VAL_STDDEV§ standard deviations. Values greater than this are considered outliers, and should be investigated.',
                domainType: 'AGGREGATE',
                id: '§DE_OUTLIER_VAL§',
                name: 'DQ - §NAME§ outliers',
                shortName: '§SHORTNAME§ outliers',
                valueType: 'INTEGER_ZERO_OR_POSITIVE',
            },
            {
                aggregationType: 'SUM',
                description:
                    'Auto-generated from predictor. All §NAME§ data values (total for all disaggregations) that are outside the specified outlier threshold (mean + §VAL_STDDEV§ SD). This can be used for flagging potential outliers in dashboards.',
                domainType: 'AGGREGATE',
                id: '§DE_THRESHOLD§',
                name: 'DQ - §NAME§ outlier threshold (mean + §VAL_STDDEV§ SD)',
                shortName: '§SHORTNAME§ outl threshold',
                valueType: 'INTEGER_ZERO_OR_POSITIVE',
            },
        ],
        indicators: [
            {
                annualized: false,
                denominator: '#{§DE_SOURCE§}',
                denominatorDescription: '§NAME§',
                description:
                    '§NAME§ excluding values that are outliers as a percentage of all §NAME§ numbers. Outliers are defined as values more than §VAL_STDDEV§ standard deviations from the mean. This indicator gives an indication of the significance/impact of outliers for the data element; a value of 100% means that there are no outliers.',
                id: '§IN_NOUTLIER_PROP§',
                indicatorType: {
                    id: '§IN_TYPE§',
                },
                name: 'DQ - §NAME§ excluding outliers (%)',
                numerator: '#{§DE_NOUTLIER_VAL§}',
                numeratorDescription: '§NAME§ excluding outliers',
                shortName: '§SHORTNAME§ excl outl (%)',
            },
            {
                denominator: '#{§DE_OUTLIER_COUNT§}+#{§DE_NOUTLIER_COUNT§}',
                denominatorDescription:
                    '§NAME§ outlier count + §NAME§ non-outlier count',
                description:
                    'The percentage of data values that are outliers, defined as 100 x (count of outliers)/(count of outliers + count of non-outliers)',
                id: '§IN_OUTLIER_PROP§',
                indicatorType: {
                    id: '§IN_TYPE§',
                },
                name: 'DQ - §NAME§ values that are outliers (%)',
                numerator:
                    'if( isNotNull( #{§DE_OUTLIER_COUNT§}), #{§DE_OUTLIER_COUNT§}, 0)',
                numeratorDescription: '§NAME§ outlier count',
                shortName: '§SHORTNAME§ outlier (%)',
            },
        ],
        predictors: [
            {
                annualSampleCount: 0,
                generator: {
                    description: '§NAME§ if <= outlier threshold, else 0',
                    displayDescription:
                        '§NAME§ if <= outlier threshold, else 0',
                    expression:
                        'if(#{§DE_SOURCE§}<=#{§DE_THRESHOLD§}, #{§DE_SOURCE§}, 0)',
                    missingValueStrategy: 'SKIP_IF_ALL_VALUES_MISSING',
                    slidingWindow: false,
                    translations: [],
                },
                id: '§PD_NOUTLIER_VAL§',
                name: 'DQ - §NAME§ excluding outliers',
                shortName: '§SHORTNAME§ excl outliers',
                organisationUnitLevels: [
                    {
                        id: '§OU_LEVEL§',
                    },
                ],
                output: {
                    id: '§DE_NOUTLIER_VAL§',
                },
                outputCombo: {
                    id: '§COC_DEFAULT§',
                },
                sequentialSkipCount: 0,
                sequentialSampleCount: 0,
                periodType: 'Monthly',
                organisationUnitDescendants: 'SELECTED',
            },
            {
                annualSampleCount: 0,
                generator: {
                    description: '1 if §NAME§ <= outlier threshold, else 0',
                    displayDescription:
                        '1 if §NAME§ <= outlier threshold, else 0',
                    expression: 'if(#{§DE_SOURCE§}<=#{§DE_THRESHOLD§}, 1, 0)',
                    missingValueStrategy: 'SKIP_IF_ALL_VALUES_MISSING',
                    slidingWindow: false,
                    translations: [],
                },
                id: '§PD_NOUTLIER_COUNT§',
                name: 'DQ - §NAME§ non-outlier count',
                shortName: '§SHORTNAME§ non-outl count',
                organisationUnitLevels: [
                    {
                        id: '§OU_LEVEL§',
                    },
                ],
                output: {
                    id: '§DE_NOUTLIER_COUNT§',
                },
                outputCombo: {
                    id: '§COC_DEFAULT§',
                },
                sequentialSkipCount: 0,
                sequentialSampleCount: 0,
                periodType: 'Monthly',
                organisationUnitDescendants: 'SELECTED',
            },
            {
                annualSampleCount: 0,
                generator: {
                    description: '1 if §NAME§ > outlier threshold, else 0',
                    displayDescription:
                        '1 if §NAME§ > outlier threshold, else 0',
                    expression: 'if(#{§DE_SOURCE§}>#{§DE_THRESHOLD§},1, 0)',
                    missingValueStrategy: 'SKIP_IF_ALL_VALUES_MISSING',
                    slidingWindow: false,
                    translations: [],
                },
                id: '§PD_OUTLIER_COUNT§',
                name: 'DQ - §NAME§ outlier count',
                shortName: '§SHORTNAME§ outlier count',
                organisationUnitLevels: [
                    {
                        id: '§OU_LEVEL§',
                    },
                ],
                output: {
                    id: '§DE_OUTLIER_COUNT§',
                },
                outputCombo: {
                    id: '§COC_DEFAULT§',
                },
                sequentialSkipCount: 0,
                sequentialSampleCount: 0,
                periodType: 'Monthly',
                organisationUnitDescendants: 'SELECTED',
            },
            {
                annualSampleCount: 0,
                generator: {
                    description: '§NAME§ if > outlier threshold, else 0',
                    displayDescription: '§NAME§ if > outlier threshold, else 0',
                    expression:
                        'if(#{§DE_SOURCE§}>#{§DE_THRESHOLD§}, #{§DE_SOURCE§}, 0)',
                    missingValueStrategy: 'SKIP_IF_ALL_VALUES_MISSING',
                    slidingWindow: false,
                    translations: [],
                },
                id: '§PD_OUTLIER_VAL§',
                name: 'DQ - §NAME§ outliers',
                shortName: '§SHORTNAME§ outliers',
                organisationUnitLevels: [
                    {
                        id: '§OU_LEVEL§',
                    },
                ],
                output: {
                    id: '§DE_OUTLIER_VAL§',
                },
                outputCombo: {
                    id: '§COC_DEFAULT§',
                },
                sequentialSkipCount: 0,
                sequentialSampleCount: 0,
                periodType: 'Monthly',
                organisationUnitDescendants: 'SELECTED',
            },
            {
                annualSampleCount: 0,
                generator: {
                    description: 'Mean of §NAME§ + §VAL_STDDEV§ SD',
                    displayDescription: 'Mean of §NAME§ + §VAL_STDDEV§ SD',
                    expression:
                        'avg(#{§DE_SOURCE§}) + (§VAL_STDDEV§ * stddevPop(#{§DE_SOURCE§}))',
                    missingValueStrategy: 'SKIP_IF_ALL_VALUES_MISSING',
                    slidingWindow: false,
                    translations: [],
                },
                id: '§PD_THRESHOLD§',
                name: 'DQ - §NAME§ outlier threshold (mean + §VAL_STDDEV§ SD)',
                shortName: '§SHORTNAME§ outl threshold',
                organisationUnitLevels: [
                    {
                        id: '§OU_LEVEL§',
                    },
                ],
                output: {
                    id: '§DE_THRESHOLD§',
                },
                outputCombo: {
                    id: '§COC_DEFAULT§',
                },
                sequentialSkipCount: 0,
                sequentialSampleCount: 12,
                periodType: 'Monthly',
                organisationUnitDescendants: 'DESCENDANTS',
            },
        ],
    }
}

// ---------------------------------------------------------------------------
// V2 "hybrid" templates (2026): one threshold predictor + one threshold data
// element per configuration; every metric is a subExpression indicator that
// needs no predictor. Requires DHIS2 2.40.2+ (multi-item subExpressions and
// periodOffset inside subExpression — see
// docs/explorations/subexpression-metadata-simplification.md).
//
// The legacy templates above are kept verbatim: the deletion safety gates
// still match configurations created by earlier versions against them.
// V2 placeholder keys end in _V2 so stored configurations self-identify.

/** The 12-month window of periodOffset references for a source item. */
const OFFSETS = Array.from(
    { length: 12 },
    (_, i) => `#{§DE_SOURCE§}.periodOffset(-${i + 1})`
)

/** Count of non-missing months in the 12-month window (0..12). */
const REPORTED_IN_WINDOW = OFFSETS.map(
    (offset) => `if(isNotNull(${offset}),1,0)`
).join('+')

/**
 * History probe: reports 12-24 months back. A facility is only assessable
 * for "consistently reporting the last 12 months" if it was already
 * reporting 12+ months ago — otherwise the metric is not computable
 * (blank), rather than 0%, so facilities in their first year don't drag
 * down aggregated consistency.
 */
const REPORTED_BEFORE_WINDOW = Array.from(
    { length: 13 },
    (_, i) => `#{§DE_SOURCE§}.periodOffset(-${i + 12})`
)
    .map((offset) => `if(isNotNull(${offset}),1,0)`)
    .join('+')

export const templateHybridOutlier = (): MetadataBundle => {
    return {
        dataElements: [
            {
                aggregationType: 'SUM',
                description:
                    'Auto-generated by the DQ tool. The outlier threshold for §NAME§ (§THRESHOLD_DESC§), computed monthly per organisation unit from the previous 12 months. Values greater than this are considered outliers, and should be investigated.',
                domainType: 'AGGREGATE',
                id: '§DE_THRESHOLD_V2§',
                name: 'DQ - §NAME§ outlier threshold (§THRESHOLD_DESC§)',
                shortName: '§SHORTNAME§ outl threshold',
                valueType: 'INTEGER_ZERO_OR_POSITIVE',
                zeroIsSignificant: false,
            },
        ],
        indicators: [
            {
                annualized: false,
                // Guarded on the threshold too: a value without a threshold
                // (e.g. a facility's first months) is unassessable, not an
                // outlier — inside subExpressions DHIS2 replaces null items
                // with 0 except within isNull/isNotNull, so an unguarded
                // comparison would flag every thresholdless value.
                denominator:
                    'subExpression(if(isNotNull(#{§DE_SOURCE§}) && isNotNull(#{§DE_THRESHOLD_V2§}), 1, 0))',
                denominatorDescription:
                    'Orgunits reporting §NAME§ this month with an outlier threshold',
                description:
                    'The percentage of orgunits (facilities) reporting a §NAME§ value this month whose value is an outlier, i.e. above the outlier threshold (§THRESHOLD_DESC§).',
                id: '§IN_OUTLIER_PROP_V2§',
                indicatorType: {
                    id: '§IN_TYPE§',
                },
                name: 'DQ - §NAME§ values that are outliers (%)',
                numerator:
                    'subExpression(if(isNotNull(#{§DE_SOURCE§}) && isNotNull(#{§DE_THRESHOLD_V2§}), if(#{§DE_SOURCE§} > #{§DE_THRESHOLD_V2§}, 1, 0), 0))',
                numeratorDescription: '§NAME§ outlier count',
                shortName: '§SHORTNAME§ outlier (%)',
            },
            {
                annualized: false,
                decimals: 0,
                // The reported value itself, for dashboards and pivot
                // tables that list the outlying values. Blank unless the
                // value is an outlier: the guarded denominator is 0 both
                // for non-outliers and for unassessable facility-months,
                // and DHIS2 renders a zero denominator as no value — the
                // same "only outliers are visible" behaviour the retired
                // outlier-values data element had (it stored no zeros).
                // aggregationType(MAX) instead of the default SUM keeps
                // the denominator at 1 when aggregating, so higher levels
                // show the SUM of the outlying values, not their average.
                denominator:
                    'subExpression(if(isNotNull(#{§DE_SOURCE§}) && isNotNull(#{§DE_THRESHOLD_V2§}), if(#{§DE_SOURCE§} > #{§DE_THRESHOLD_V2§}, 1, 0), 0)).aggregationType(MAX)',
                denominatorDescription:
                    'Orgunits reporting a §NAME§ value above the outlier threshold',
                description:
                    'The §NAME§ values that are outliers, i.e. above the outlier threshold (§THRESHOLD_DESC§), aggregated as the sum of those values. Blank when the value is not an outlier, and when the facility-month cannot be assessed (no value or no threshold).',
                id: '§IN_OUTLIER_VAL_V2§',
                indicatorType: {
                    // Factor 1: this indicator reports the value itself,
                    // so the percentage indicator type used by the other
                    // three metrics would multiply it by 100.
                    id: '§IN_TYPE_NUM§',
                },
                name: 'DQ - §NAME§ outlier values',
                numerator:
                    'subExpression(if(isNotNull(#{§DE_SOURCE§}) && isNotNull(#{§DE_THRESHOLD_V2§}), if(#{§DE_SOURCE§} > #{§DE_THRESHOLD_V2§}, #{§DE_SOURCE§}, 0), 0))',
                numeratorDescription:
                    '§NAME§ values above the outlier threshold',
                shortName: '§SHORTNAME§ outlier values',
            },
            {
                annualized: false,
                denominator:
                    'subExpression(if(isNotNull(#{§DE_SOURCE§}) && isNotNull(#{§DE_THRESHOLD_V2§}), #{§DE_SOURCE§}, 0))',
                denominatorDescription:
                    '§NAME§ (values with an outlier threshold)',
                description:
                    '§NAME§ excluding values that are outliers, as a percentage of all §NAME§ values. Outliers are values above the outlier threshold (§THRESHOLD_DESC§). This indicator gives an indication of the significance/impact of outliers for the data element; a value of 100% means that there are no outliers.',
                id: '§IN_NOUTLIER_PROP_V2§',
                indicatorType: {
                    id: '§IN_TYPE§',
                },
                name: 'DQ - §NAME§ excluding outliers (%)',
                numerator:
                    'subExpression(if(isNotNull(#{§DE_SOURCE§}) && isNotNull(#{§DE_THRESHOLD_V2§}), if(#{§DE_SOURCE§} <= #{§DE_THRESHOLD_V2§}, #{§DE_SOURCE§}, 0), 0))',
                numeratorDescription: '§NAME§ excluding outliers',
                shortName: '§SHORTNAME§ excl outl (%)',
            },
        ],
        predictors: [
            {
                annualSampleCount: 0,
                generator: {
                    description: 'Outlier threshold for §NAME§',
                    expression: '§GEN_THRESHOLD§',
                    missingValueStrategy: '§MISSING_STRATEGY§',
                    slidingWindow: false,
                },
                id: '§PD_THRESHOLD_V2§',
                name: 'DQ - §NAME§ outlier threshold (§THRESHOLD_DESC§)',
                shortName: '§SHORTNAME§ outl threshold',
                organisationUnitLevels: [
                    {
                        id: '§OU_LEVEL§',
                    },
                ],
                // DESCENDANTS: equivalent to SELECTED when the level is the
                // data-registration level, and SELECTED predictors generate
                // nothing on 2.43 (docs/bugs/01-predictor-selected-no-predictions)
                organisationUnitDescendants: 'DESCENDANTS',
                output: {
                    id: '§DE_THRESHOLD_V2§',
                },
                outputCombo: {
                    id: '§COC_DEFAULT§',
                },
                periodType: 'Monthly',
                sequentialSampleCount: 12,
                sequentialSkipCount: 0,
            },
        ],
    }
}

export const templateHybridConsistency = (): MetadataBundle => {
    return {
        indicators: [
            {
                annualized: false,
                decimals: 1,
                denominator: `subExpression(if(${REPORTED_BEFORE_WINDOW} > 0 && ${REPORTED_IN_WINDOW} > 0, 1, 0))`,
                denominatorDescription:
                    'Orgunits reporting §NAME§ in any of the last 12 months, with 12+ months of reporting history',
                description:
                    'The percentage of facilities that reported §NAME§ in all the previous 12 months, out of those facilities that reported §NAME§ in any of the previous 12 months.',
                id: '§IN_CONS_PROP_V2§',
                indicatorType: {
                    id: '§IN_TYPE§',
                },
                name: 'DQ - §NAME§ facilities consistently reporting last 12 months (%)',
                numerator: `subExpression(if(${REPORTED_IN_WINDOW} == 12, 1, 0))`,
                numeratorDescription:
                    'Orgunits reporting §NAME§ in all the last 12 months',
                shortName: '§SHORTNAME§ reported 12 mnths (%)',
            },
        ],
    }
}

export const templateHybridCompleteness = (): MetadataBundle => {
    return {
        indicators: [
            {
                annualized: false,
                denominator: 'R{§DS_SOURCE§.EXPECTED_REPORTS}',
                denominatorDescription: '§NAME_DS§ - Expected reports',
                description:
                    '§NAME§ data element completeness, defined as 100 x (count of orgunits reporting)/(expected reports). An orgunit counts as reporting if it has a value for any disaggregation.',
                id: '§IN_COMPL_V2§',
                indicatorType: {
                    id: '§IN_TYPE§',
                },
                name: 'DQ - §NAME§ data element completeness (%)',
                numerator: 'subExpression(if(isNotNull(#{§DE_SOURCE§}), 1, 0))',
                numeratorDescription: '§NAME§ count of reporting orgunits',
                shortName: '§SHORTNAME§ completeness (%)',
            },
        ],
    }
}

/** Threshold generator expressions per outlier method (k substituted in). */
export const thresholdGenerator = (
    method: 'modZ' | 'sd',
    k: string
): { expression: string; description: string; strategy: string } => {
    if (method === 'modZ') {
        return {
            // median + k * MAD / 0.6745 — MAD computed with nested median();
            // SKIP_IF_ANY_VALUE_MISSING is required for a correct MAD when
            // months are missing (composite expressions inside vector
            // functions otherwise zero-fill missing samples).
            expression: `median(#{§DE_SOURCE§}) + ${k} * (median(greatest(#{§DE_SOURCE§} - median(#{§DE_SOURCE§}), median(#{§DE_SOURCE§}) - #{§DE_SOURCE§})) / 0.6745)`,
            description: `modified-Z ${k}`,
            strategy: 'SKIP_IF_ANY_VALUE_MISSING',
        }
    }
    return {
        expression: `avg(#{§DE_SOURCE§}) + (${k} * stddevPop(#{§DE_SOURCE§}))`,
        description: `mean + ${k} SD`,
        strategy: 'SKIP_IF_ALL_VALUES_MISSING',
    }
}
