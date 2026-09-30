import { fakeApi, FakeApi } from './testUtils'
import { updateOutlierThreshold } from './threshold'
import { PlaceholderConfig } from './types'

const DE_SOURCE = 'SrcDe000001'
const THRESHOLD_DE = 'ThrDe000001'
const THRESHOLD_PD = 'ThrPd000001'
const OUTLIER_IN = 'OutIn000001'

// Zone-less, as DHIS2 returns it
const SERVER_STAMP = '2026-07-16T06:00:00.000'

const storedConfig: PlaceholderConfig = {
    '§NAME§': 'Foo',
    '§VAL_STDDEV§': '3.0',
    '§DE_THRESHOLD§': THRESHOLD_DE,
    '§PD_THRESHOLD§': THRESHOLD_PD,
    '§IN_OUTLIER_PROP§': OUTLIER_IN,
}

const makeApi = (): FakeApi =>
    fakeApi({
        onGet: (resource) => {
            if (resource === 'dataStore/dqConfig/outliers') {
                return [{ [DE_SOURCE]: { ...storedConfig } }]
            }
            if (resource === 'dataElements') {
                return {
                    dataElements: [
                        {
                            id: THRESHOLD_DE,
                            name: 'DQ - Foo outlier threshold (mean + 3.0 SD)',
                            shortName: 'Foo outl threshold',
                            description:
                                'The outlier threshold for Foo, defined as mean + 3.0 standard deviations.',
                        },
                    ],
                }
            }
            if (resource === 'predictors') {
                return {
                    predictors: [
                        {
                            id: THRESHOLD_PD,
                            name: 'DQ - Foo outlier threshold (mean + 3.0 SD)',
                            shortName: 'Foo outl threshold',
                            description: '',
                            generator: {
                                expression:
                                    'avg(#{SrcDe000001}) + (3.0 * stddevPop(#{SrcDe000001}))',
                                description: 'Mean of Foo + 3.0 SD',
                            },
                        },
                    ],
                }
            }
            if (resource === 'indicators') {
                return {
                    indicators: [
                        {
                            id: OUTLIER_IN,
                            name: 'DQ - Foo values that are outliers (%)',
                            shortName: 'Foo outlier (%)',
                            description:
                                'Outliers are defined as values more than 3.0 standard deviations from the mean.',
                        },
                    ],
                }
            }
            // Server timestamp read-back after the edit
            if (resource === `predictors/${THRESHOLD_PD}`) {
                return { lastUpdated: SERVER_STAMP }
            }
            throw new Error(`Unexpected GET ${resource}`)
        },
    })

describe('updateOutlierThreshold', () => {
    it('rewrites the SD value in names, descriptions and expressions', async () => {
        const fake = makeApi()
        await updateOutlierThreshold(fake.api, DE_SOURCE, '2.5')

        const posts = fake.find('post', 'metadata')
        const posted = Object.assign({}, ...posts.map((post) => post.data))

        expect(posted.dataElements[0].name).toBe(
            'DQ - Foo outlier threshold (mean + 2.5 SD)'
        )
        expect(posted.dataElements[0].description).toContain(
            '2.5 standard deviations'
        )
        expect(posted.predictors[0].generator.expression).toBe(
            'avg(#{SrcDe000001}) + (2.5 * stddevPop(#{SrcDe000001}))'
        )
        expect(posted.indicators[0].description).toContain(
            '2.5 standard deviations'
        )
    })

    it('stores the new SD and the SERVER timestamp in the dataStore', async () => {
        const fake = makeApi()
        await updateOutlierThreshold(fake.api, DE_SOURCE, '2.5')

        const storePut = fake
            .find('put', 'dataStore/dqConfig')
            .find((call) => call.id === 'outliers')
        const savedEntry = (
            storePut?.data as Record<string, PlaceholderConfig>[]
        )[0]
        const saved = savedEntry[DE_SOURCE]

        expect(saved['§VAL_STDDEV§']).toBe('2.5')
        // Must be the server's lastUpdated (zone-less), NOT a client
        // new Date().toISOString() — see the timezone bug in the review
        expect(saved.editedAt).toBe(SERVER_STAMP)
    })

    it('throws when no outlier configuration exists for the id', async () => {
        const fake = fakeApi({
            onGet: () => [],
        })
        await expect(
            updateOutlierThreshold(fake.api, 'MissingDe01', '2.5')
        ).rejects.toThrow('Outlier configuration not found.')
    })
})

describe('updateOutlierThreshold (V2 hybrid, modified-Z)', () => {
    const v2Config: PlaceholderConfig = {
        '§NAME§': 'Foo',
        '§DE_SOURCE§': DE_SOURCE,
        '§VAL_MODZ§': '3.5',
        '§THRESHOLD_DESC§': 'modified-Z 3.5',
        '§DE_THRESHOLD_V2§': THRESHOLD_DE,
        '§PD_THRESHOLD_V2§': THRESHOLD_PD,
        '§IN_OUTLIER_PROP_V2§': OUTLIER_IN,
    }

    const makeV2Api = (): FakeApi =>
        fakeApi({
            onGet: (resource) => {
                if (resource === 'dataStore/dqConfig/outliers') {
                    return [{ [DE_SOURCE]: { ...v2Config } }]
                }
                if (resource === 'dataElements') {
                    return {
                        dataElements: [
                            {
                                id: THRESHOLD_DE,
                                name: 'DQ - Foo outlier threshold (modified-Z 3.5)',
                                description:
                                    'Outlier threshold for Foo (modified-Z 3.5).',
                            },
                        ],
                    }
                }
                if (resource === 'predictors') {
                    return {
                        predictors: [
                            {
                                id: THRESHOLD_PD,
                                name: 'DQ - Foo outlier threshold (modified-Z 3.5)',
                                generator: { expression: 'old expression' },
                            },
                        ],
                    }
                }
                if (resource === `predictors/${THRESHOLD_PD}`) {
                    return { lastUpdated: SERVER_STAMP }
                }
                if (resource === 'indicators') {
                    return {
                        indicators: [
                            {
                                id: OUTLIER_IN,
                                name: 'DQ - Foo values that are outliers (%)',
                                description:
                                    'outliers above the outlier threshold (modified-Z 3.5)',
                            },
                        ],
                    }
                }
                throw new Error(`Unexpected GET ${resource}`)
            },
        })

    it('rebuilds the generator and renames threshold objects', async () => {
        const fake = makeV2Api()
        await updateOutlierThreshold(fake.api, DE_SOURCE, '4.0')

        const posts = fake.find('post', 'metadata')
        const predictorPost = posts.find(
            (call) => (call.data as { predictors?: unknown[] }).predictors
        )
        const predictor = (
            predictorPost?.data as {
                predictors: {
                    name: string
                    generator: { expression: string }
                }[]
            }
        ).predictors[0]
        expect(predictor.name).toBe(
            'DQ - Foo outlier threshold (modified-Z 4.0)'
        )
        expect(predictor.generator.expression).toContain('median(')
        expect(predictor.generator.expression).toContain(`#{${DE_SOURCE}}`)
        expect(predictor.generator.expression).toContain('4.0 * (median(')
        expect(predictor.generator.expression).not.toContain('§')

        const puts = fake.find('put', 'dataStore/dqConfig')
        const stored = (puts[0].data as Record<string, PlaceholderConfig>[])[0][
            DE_SOURCE
        ]
        expect(stored['§VAL_MODZ§']).toBe('4.0')
        expect(stored['§THRESHOLD_DESC§']).toBe('modified-Z 4.0')
        expect(stored.editedAt).toBe(SERVER_STAMP)
    })
})
