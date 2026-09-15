import { QueryParams } from './api'
import { buildPendingImport, PreviewRequest } from './configure'
import { fakeApi, fakeUids, FakeApi } from './testUtils'

const DE_ID = 'SrcDe000001'
const DS_ID = 'SrcDs000001'
const USER_GROUP = 'UserGrp0001'

const baseRequest: PreviewRequest = {
    deSourceId: DE_ID,
    dataSetId: DS_ID,
    ouLevelId: 'OuLevel0001',
    outlierMethod: 'sd',
    threshold: '3.5',
    completenessApproach: 'standard',
    userGroupId: USER_GROUP,
}

/** Fake serving everything buildPendingImport needs; no existing conflicts. */
const makeApi = (overrides?: {
    deName?: string
    deShortName?: string
    existingNames?: string[]
}): FakeApi =>
    fakeApi({
        onGet: (resource: string, params?: QueryParams) => {
            if (resource === 'system/id') {
                return { codes: fakeUids(Number(params?.limit) || 1) }
            }
            if (resource === `dataElements/${DE_ID}`) {
                return {
                    id: DE_ID,
                    name: overrides?.deName || 'Measles new',
                    shortName: overrides?.deShortName || 'Measles new',
                }
            }
            if (resource === 'dataElementOperands') {
                return {
                    dataElementOperands: [
                        {
                            id: `${DE_ID}.Coc00000001`,
                            name: 'Measles new 0-11m',
                            shortName: 'Measles new 0-11m',
                        },
                    ],
                }
            }
            if (resource === `dataSets/${DS_ID}`) {
                return {
                    id: DS_ID,
                    name: 'Morbidity',
                    shortName: 'Morbidity',
                    periodType: 'Monthly',
                }
            }
            if (resource === 'indicatorTypes') {
                // The app looks up two types: percentage (factor 100) for
                // the three ratio metrics, and factor 1 for outlier values
                // "factor:eq:1" exactly — not the "factor:eq:100" of the
                // percentage lookup, which shares the prefix
                return /factor:eq:1(?!\d)/.test(String(params?.filter))
                    ? {
                          indicatorTypes: [{ id: 'IndTypeNum1', number: true }],
                      }
                    : { indicatorTypes: [{ id: 'IndType0001' }] }
            }
            if (resource === 'categoryOptionCombos') {
                return { categoryOptionCombos: [{ id: 'DefaultCoc1' }] }
            }
            // Conflict checks against dataElements/predictors/indicators:
            // report a conflict when a probed name is in existingNames
            const filter = String(params?.filter || '')
            const existing = (overrides?.existingNames || []).filter((name) =>
                filter.includes(name)
            )
            return { [resource]: existing.map((name) => ({ name })) }
        },
    })

describe('buildPendingImport', () => {
    it('substitutes every placeholder and applies sharing', async () => {
        const { api } = makeApi()
        const pending = await buildPendingImport(api, baseRequest, () => {})

        for (const check of [
            pending.outlier,
            pending.consistency,
            pending.completeness,
        ]) {
            expect(JSON.stringify(check.metadata)).not.toContain('§')
            for (const objects of Object.values(check.metadata)) {
                for (const object of objects) {
                    expect(object.sharing).toEqual({
                        public: 'r-------',
                        userGroups: {
                            [USER_GROUP]: {
                                access: 'rw------',
                                id: USER_GROUP,
                            },
                        },
                    })
                }
            }
        }
    })

    it('generates the expected object counts per check', async () => {
        const { api } = makeApi()
        const pending = await buildPendingImport(api, baseRequest, () => {})

        // V2 hybrid: one threshold DE + one threshold predictor, all
        // metrics are indicators
        expect(pending.outlier.metadata.dataElements).toHaveLength(1)
        expect(pending.outlier.metadata.predictors).toHaveLength(1)
        expect(pending.outlier.metadata.indicators).toHaveLength(3)
        expect(pending.consistency.metadata.dataElements).toBeUndefined()
        expect(pending.consistency.metadata.predictors).toBeUndefined()
        expect(pending.consistency.metadata.indicators).toHaveLength(1)
        expect(pending.completeness.metadata.dataElements).toBeUndefined()
        expect(pending.completeness.metadata.indicators).toHaveLength(1)
    })

    it('gives the outlier values indicator a factor-1 type and a non-summing denominator', async () => {
        const { api } = makeApi()
        const pending = await buildPendingImport(api, baseRequest, () => {})

        const values = (pending.outlier.metadata.indicators || []).find(
            (indicator) => indicator.name?.endsWith('outlier values')
        )
        expect(values).toBeDefined()
        // A percentage type (factor 100) would report the value x100
        expect(values?.indicatorType).toEqual({ id: 'IndTypeNum1' })
        // aggregationType(MAX) keeps the denominator at 1 when aggregating,
        // so higher levels sum the outlying values instead of averaging them
        expect(values?.denominator).toContain('.aggregationType(MAX)')
        expect(values?.numerator).toContain(`#{${DE_ID}}`)
        // The other two outlier indicators stay percentages
        for (const indicator of pending.outlier.metadata.indicators || []) {
            if (indicator.name?.endsWith('(%)')) {
                expect(indicator.indicatorType).toEqual({ id: 'IndType0001' })
            }
        }
    })

    it('embeds the threshold in generated names and expressions', async () => {
        const { api } = makeApi()
        const pending = await buildPendingImport(api, baseRequest, () => {})

        const names = (pending.outlier.metadata.dataElements || []).map(
            (dataElement) => dataElement.name
        )
        expect(names).toContain(
            'DQ - Measles new outlier threshold (mean + 3.5 SD)'
        )
        const thresholdPredictor = (
            pending.outlier.metadata.predictors || []
        ).find((predictor) => predictor.name.includes('threshold'))
        expect(thresholdPredictor?.generator?.expression).toContain(
            '(3.5 * stddevPop('
        )
    })

    it('preserves the legacy truncation quirks per check type', async () => {
        const longShortName = 'X'.repeat(50)
        const { api } = makeApi({ deShortName: longShortName })
        const pending = await buildPendingImport(api, baseRequest, () => {})

        // Outliers: >34 chars cut to 35 (NOT 34) — legacy compatibility
        expect(pending.outlier.config['§SHORTNAME§']).toHaveLength(35)
        expect(pending.consistency.config['§SHORTNAME§']).toHaveLength(28)
        expect(pending.completeness.config['§SHORTNAME§']).toHaveLength(30)
    })

    it('uses the proxy operand for completeness when requested', async () => {
        const { api } = makeApi()
        const pending = await buildPendingImport(
            api,
            {
                ...baseRequest,
                completenessApproach: 'proxy',
                proxyOperandId: `${DE_ID}.Coc00000001`,
            },
            () => {}
        )
        const indicator = (pending.completeness.metadata.indicators || [])[0]
        expect(indicator.numerator).toContain(`#{${DE_ID}.Coc00000001}`)
    })

    it('uses the plain subExpression indicator for the any-value approach', async () => {
        const { api } = makeApi()
        const pending = await buildPendingImport(
            api,
            { ...baseRequest, completenessApproach: 'anyValue' },
            () => {}
        )
        // #{DE} inside a subExpression is the facility total across
        // disaggregations, so no predictor/DE is needed any more
        expect(pending.completeness.metadata.dataElements).toBeUndefined()
        expect(pending.completeness.metadata.predictors).toBeUndefined()
        const indicator = (pending.completeness.metadata.indicators || [])[0]
        expect(indicator.numerator).toBe(
            `subExpression(if(isNotNull(#{${DE_ID}}), 1, 0))`
        )
    })

    it('builds the modified-Z threshold when requested', async () => {
        const { api } = makeApi()
        const pending = await buildPendingImport(
            api,
            { ...baseRequest, outlierMethod: 'modZ', threshold: '3.5' },
            () => {}
        )
        const dataElement = (pending.outlier.metadata.dataElements || [])[0]
        expect(dataElement.name).toBe(
            'DQ - Measles new outlier threshold (modified-Z 3.5)'
        )
        const predictor = (pending.outlier.metadata.predictors || [])[0]
        expect(predictor.generator?.expression).toContain('median(')
        expect(predictor.generator?.expression).toContain('/ 0.6745')
        expect(predictor.generator?.missingValueStrategy).toBe(
            'SKIP_IF_ANY_VALUE_MISSING'
        )
        expect(predictor.organisationUnitDescendants).toBe('DESCENDANTS')
        // Indicators compare against the generated threshold DE
        const thresholdDeId = pending.outlier.config[
            '§DE_THRESHOLD_V2§'
        ] as string
        for (const indicator of pending.outlier.metadata.indicators || []) {
            expect(indicator.numerator).toContain('subExpression(')
        }
        const outlierProp = (pending.outlier.metadata.indicators || []).find(
            (indicator) => indicator.name.includes('values that are outliers')
        )
        expect(outlierProp?.numerator).toContain(`#{${thresholdDeId}}`)
    })

    it('warns when the data set is not monthly', async () => {
        const warnings: string[] = []
        const monthly = makeApi()
        const api = fakeApi({
            onGet: (resource, params) =>
                resource === `dataSets/${DS_ID}`
                    ? {
                          id: DS_ID,
                          name: 'Yearly set',
                          shortName: 'Yearly set',
                          periodType: 'Yearly',
                      }
                    : monthly.api.get(resource, params),
        })
        await buildPendingImport(api.api, baseRequest, (message) =>
            warnings.push(message)
        )
        expect(warnings.join(' ')).toContain('Only monthly data sets')
    })

    describe('conflict detection', () => {
        it('flags names that already exist on the server', async () => {
            const { api } = makeApi({
                existingNames: [
                    'DQ - Measles new outlier threshold (mean + 3.5 SD)',
                ],
            })
            const pending = await buildPendingImport(api, baseRequest, () => {})
            expect(
                pending.conflicts.has(
                    'name:DQ - Measles new outlier threshold (mean + 3.5 SD)'
                )
            ).toBe(true)
        })

        it('checks comma-containing names with individual eq filters', async () => {
            const commaName = 'BCG doses given Fixed, <1y'
            const { api, calls } = makeApi({ deName: commaName })
            await buildPendingImport(api, baseRequest, () => {})

            const conflictFilters = calls
                .filter(
                    (call) =>
                        call.method === 'get' &&
                        String(call.params?.filter || '').startsWith('name:')
                )
                .map((call) => String(call.params?.filter))

            // Generated names embed the comma-containing DE name, so they
            // must be probed with eq: (in:[…] would split on the comma)
            const eqFilters = conflictFilters.filter((filter) =>
                filter.startsWith('name:eq:')
            )
            expect(eqFilters.length).toBeGreaterThan(0)
            for (const filter of eqFilters) {
                expect(filter).toContain(commaName)
            }
            // and no comma-containing name may appear inside an in:[…] filter
            for (const filter of conflictFilters) {
                if (filter.startsWith('name:in:[')) {
                    expect(filter).not.toContain(commaName)
                }
            }
        })
    })
})
