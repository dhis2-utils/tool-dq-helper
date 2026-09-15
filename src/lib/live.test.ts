/**
 * @jest-environment node
 *
 * Live end-to-end test of the app's domain layer against a real DHIS2
 * instance. Skipped unless LIVE_DHIS2 is set, e.g.:
 *
 *   LIVE_DHIS2=http://dhis2-agent-hybrid:8080 LIVE_AUTH=local_admin:district \
 *     pnpm run test -- --testPathPattern live
 *
 * Expects the fixture from docs/explorations/subexpression-tests/fixture.py
 * (data element "XP cases", data set "Test Monthly", data for 2025-06..2026-06).
 */
import * as http from 'node:http'
import { D2Api } from './api'
import { buildPendingImport } from './configure'
import { deleteConfiguration } from './deletion'
import { runImport } from './importer'
import { initialiseDataStore } from './initialise'
import { updateOutlierThreshold } from './threshold'
import { BaseConfig, StoreEntry } from './types'

const BASE = process.env.LIVE_DHIS2
const maybe = BASE ? describe : describe.skip

// jest's node environment has no global fetch — minimal replacement
const httpRequest = (options: {
    method: string
    url: string
    headers: Record<string, string>
    body?: string
}): Promise<{ status: number; text: string }> =>
    new Promise((resolve, reject) => {
        const request = http.request(
            options.url,
            { method: options.method, headers: options.headers },
            (response) => {
                let text = ''
                response.on('data', (chunk) => (text += chunk))
                response.on('end', () =>
                    resolve({ status: response.statusCode || 0, text })
                )
            }
        )
        request.on('error', reject)
        if (options.body !== undefined) {
            request.write(options.body)
        }
        request.end()
    })

const liveApi = (base: string, auth: string): D2Api => {
    const headers = {
        Authorization: 'Basic ' + Buffer.from(auth).toString('base64'),
        'Content-Type': 'application/json',
    }
    const request = async <T>(
        method: string,
        url: string,
        data?: unknown
    ): Promise<T> => {
        const response = await httpRequest({
            method,
            url,
            headers,
            body: data === undefined ? undefined : JSON.stringify(data),
        })
        const body = response.text ? JSON.parse(response.text) : {}
        if (response.status >= 400) {
            const error = new Error(
                `${method} ${url} -> ${response.status}`
            ) as Error & { details?: unknown }
            error.details = body
            throw error
        }
        return body as T
    }
    const query = (params?: Record<string, unknown>): string => {
        if (!params) {
            return ''
        }
        const parts: string[] = []
        for (const [key, value] of Object.entries(params)) {
            for (const item of Array.isArray(value) ? value : [value]) {
                parts.push(`${key}=${encodeURIComponent(String(item))}`)
            }
        }
        return parts.length ? '?' + parts.join('&') : ''
    }
    return {
        get: (resource, params) =>
            request('GET', `${base}/api/${resource}${query(params)}`),
        post: (resource, data, params) =>
            request('POST', `${base}/api/${resource}${query(params)}`, data),
        put: (resource, id, data) =>
            request('PUT', `${base}/api/${resource}/${id}`, data),
    }
}

const FIXTURE = {
    dataElement: 'DEplain0001', // "XP cases"
    dataSet: 'DSmonthly01', // "Test Monthly"
    ouLevel3: 'OULEVEL0003',
    root: 'OUroot00001',
}

maybe('live: hybrid configuration lifecycle', () => {
    jest.setTimeout(300_000)
    const api = liveApi(
        BASE as string,
        process.env.LIVE_AUTH || 'local_admin:district'
    )
    let baseConfig: BaseConfig

    it('initialises groups and dataStore', async () => {
        try {
            baseConfig = await api.get<BaseConfig>(
                'dataStore/dqConfig/baseConfig'
            )
        } catch {
            await initialiseDataStore(api)
            baseConfig = await api.get<BaseConfig>(
                'dataStore/dqConfig/baseConfig'
            )
        }
        expect(baseConfig.userGroup).toHaveLength(11)
        expect(baseConfig.predictorGroupThreshold).toHaveLength(11)
    })

    it('previews and imports a modified-Z configuration', async () => {
        const warnings: string[] = []
        const pending = await buildPendingImport(
            api,
            {
                deSourceId: FIXTURE.dataElement,
                dataSetId: FIXTURE.dataSet,
                ouLevelId: FIXTURE.ouLevel3,
                outlierMethod: 'modZ',
                threshold: '3.5',
                completenessApproach: 'standard',
                userGroupId: baseConfig.userGroup,
            },
            (message) => warnings.push(message)
        )
        expect(pending.conflicts.size).toBe(0)

        const results = await runImport(api, pending, baseConfig)
        const failed = results.filter((row) => !row.success)
        expect(failed).toEqual([])
    })

    it('generated a working threshold predictor (runs on 2.43)', async () => {
        const store = await api.get<StoreEntry[]>('dataStore/dqConfig/outliers')
        const config = store[0][FIXTURE.dataElement]
        const predictorId = config['§PD_THRESHOLD_V2§'] as string
        const report = await api.post<{ message?: string }>(
            `predictors/${predictorId}/run`,
            {},
            { startDate: '2026-06-01', endDate: '2026-07-01' }
        )
        // 4 facilities have window data in the fixture
        expect(report.message).toContain('Generated 4 predictions')
    })

    it('server-side validates every generated indicator expression', async () => {
        const store = await api.get<StoreEntry[]>('dataStore/dqConfig/outliers')
        const config = store[0][FIXTURE.dataElement]
        const indicatorIds = [
            config['§IN_OUTLIER_PROP_V2§'],
            config['§IN_NOUTLIER_PROP_V2§'],
            config['§IN_OUTLIER_VAL_V2§'],
        ] as string[]
        for (const id of indicatorIds) {
            const indicator = await api.get<{
                numerator: string
                denominator: string
            }>(`indicators/${id}`, { fields: 'numerator,denominator' })
            for (const expression of [
                indicator.numerator,
                indicator.denominator,
            ]) {
                const response = await httpRequest({
                    method: 'POST',
                    url: `${BASE}/api/indicators/expression/description`,
                    headers: {
                        Authorization:
                            'Basic ' +
                            Buffer.from(
                                process.env.LIVE_AUTH || 'local_admin:district'
                            ).toString('base64'),
                        'Content-Type': 'text/plain',
                    },
                    body: expression,
                })
                const result = JSON.parse(response.text) as {
                    status: string
                    message?: string
                }
                // The outlier-values denominator carries an
                // .aggregationType() modifier, which makes this endpoint
                // throw (NPE on translationCache, seen on 2.44-SNAPSHOT)
                // even though the expression is valid — the metadata
                // import above accepts it and analytics evaluates it.
                // Accept that specific failure, nothing else.
                const modifierNotDescribable =
                    expression.includes('.aggregationType(') &&
                    (result.message || '').includes('translationCache')
                if (!modifierNotDescribable) {
                    expect(result.status).toBe('OK')
                }
            }
        }
    })

    it('edits the threshold and stamps editedAt from the server', async () => {
        await updateOutlierThreshold(api, FIXTURE.dataElement, '4.0')
        const store = await api.get<StoreEntry[]>('dataStore/dqConfig/outliers')
        const config = store[0][FIXTURE.dataElement]
        expect(config['§VAL_MODZ§']).toBe('4.0')
        expect(config['§THRESHOLD_DESC§']).toBe('modified-Z 4.0')
        expect(config.editedAt).toBeTruthy()
        const predictor = await api.get<{
            name: string
            generator: { expression: string }
        }>(`predictors/${config['§PD_THRESHOLD_V2§']}`, {
            fields: 'name,generator[expression]',
        })
        expect(predictor.name).toContain('modified-Z 4.0')
        expect(predictor.generator.expression).toContain('4.0 * (median(')
    })

    // Set LIVE_KEEP=1 to leave the imported configuration on the instance
    // (e.g. for manual inspection through the app) instead of deleting it.
    const itUnlessKeep = process.env.LIVE_KEEP ? it.skip : it
    itUnlessKeep(
        'deletes the configuration and its metadata (gates pass)',
        async () => {
            // The threshold predictor wrote data values; a data element with
            // values cannot be deleted, so clear them first (the app leaves
            // this to the administrator — candidate future improvement).
            const store = await api.get<StoreEntry[]>(
                'dataStore/dqConfig/outliers'
            )
            const config = store[0][FIXTURE.dataElement]
            const values = await api.get<{
                dataValues?: Record<string, string>[]
            }>('dataValueSets', {
                dataElement: config['§DE_THRESHOLD_V2§'] as string,
                orgUnit: FIXTURE.root,
                children: 'true',
                startDate: '2026-01-01',
                endDate: '2026-12-31',
            })
            if (values.dataValues?.length) {
                // 2.43 requires the DE to be in a data set assigned to each
                // org unit before its values can be written or deleted, and
                // soft-deleted rows still block data element deletion until
                // the maintenance purge runs.
                const facilityIds = [
                    ...new Set(values.dataValues.map((value) => value.orgUnit)),
                ]
                await api.post('metadata', {
                    dataSets: [
                        {
                            id: 'zzLiveDs001',
                            name: 'ZZZ live test cleanup',
                            shortName: 'ZZZ live cleanup',
                            periodType: 'Monthly',
                            dataSetElements: [
                                {
                                    dataSet: { id: 'zzLiveDs001' },
                                    dataElement: {
                                        id: config[
                                            '§DE_THRESHOLD_V2§'
                                        ] as string,
                                    },
                                },
                            ],
                            organisationUnits: facilityIds.map((id) => ({
                                id,
                            })),
                        },
                    ],
                })
                await api.post('dataValueSets', {
                    dataValues: values.dataValues.map((value) => ({
                        ...value,
                        deleted: true,
                    })),
                })
                await api.post(
                    'metadata',
                    { dataSets: [{ id: 'zzLiveDs001' }] },
                    { importStrategy: 'DELETE' }
                )
                await api.post(
                    'maintenance',
                    {},
                    { softDeletedDataValueRemoval: 'true' }
                )
            }
            const outcome = await deleteConfiguration(api, {
                baseConfig,
                deId: FIXTURE.dataElement,
                deName: 'XP cases',
                alsoDeleteMetadata: true,
            })
            expect(outcome.message).toContain('Consistency metadata: deleted.')
            expect(outcome.message).toContain('Completeness metadata: deleted.')
            // The threshold DE is deleted when the platform allows it; on 2.43
            // the data value changelog of predictor runs can block DE deletion
            // (reported gracefully) — accept both outcomes.
            expect(outcome.message).toMatch(
                /Outliers metadata: (deleted\.|delete failed \(dataElements)/
            )
        }
    )
})
