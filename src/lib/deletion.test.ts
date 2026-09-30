import { deleteConfiguration } from './deletion'
import { collectTemplateEntries } from './labels'
import { fakeApi, FakeApi, RecordedCall } from './testUtils'
import { BaseConfig, PlaceholderConfig } from './types'

const DE_SOURCE = 'SrcDe000001'
const GEN_DE = 'GenDe000001'
const GEN_PD = 'GenPd000001'
const GEN_IN = 'GenIn000001'

// Zone-less timestamps, exactly as DHIS2 returns them
const CREATED = '2026-07-16T05:00:00.000'
const TEN_MINUTES_LATER = '2026-07-16T05:10:00.000'

const baseConfig: BaseConfig = {
    userGroup: 'UserGrp0001',
    dataElementGroup: 'DeGrp000001',
    indicatorGroup: 'InGrp000001',
    predictorGroup: 'PdGrp000001',
    predictorGroupThreshold: 'PdGrpThr001',
    predictorGroupAnalysis: 'PdGrpAna001',
    predictorGroupConsistency: 'PdGrpCon001',
}

// Names/descriptions exactly as the templates would have generated them
const templates = collectTemplateEntries()
const substitute = (template: string | null): string =>
    (template || '').replace(/§NAME§/g, 'Foo').replace(/§VAL_STDDEV§/g, '3.0')

interface Scenario {
    lastUpdated?: string
    editedAt?: string
    owned?: boolean
    renamedDataElement?: boolean
}

const makeApi = (scenario: Scenario = {}): FakeApi => {
    const {
        lastUpdated = CREATED,
        editedAt,
        owned = true,
        renamedDataElement = false,
    } = scenario

    const storedConfig: PlaceholderConfig = {
        '§NAME§': 'Foo',
        '§VAL_STDDEV§': '3.0',
        '§DE_OUTLIER_COUNT§': GEN_DE,
        '§PD_OUTLIER_COUNT§': GEN_PD,
        '§IN_OUTLIER_PROP§': GEN_IN,
    }
    if (editedAt) {
        storedConfig.editedAt = editedAt
    }

    const dataElement = {
        id: GEN_DE,
        name: renamedDataElement
            ? 'Renamed by hand'
            : substitute(templates['§DE_OUTLIER_COUNT§'].name),
        description: substitute(templates['§DE_OUTLIER_COUNT§'].description),
        created: CREATED,
        lastUpdated,
    }
    const predictor = {
        id: GEN_PD,
        name: substitute(templates['§PD_OUTLIER_COUNT§'].name),
        generator: {
            description: substitute(
                templates['§PD_OUTLIER_COUNT§'].description
            ),
        },
        created: CREATED,
        lastUpdated,
    }
    const indicator = {
        id: GEN_IN,
        name: substitute(templates['§IN_OUTLIER_PROP§'].name),
        description: substitute(templates['§IN_OUTLIER_PROP§'].description),
        created: CREATED,
        lastUpdated,
    }

    return fakeApi({
        onGet: (resource, params) => {
            if (resource === 'dataStore/dqConfig/outliers') {
                return [{ [DE_SOURCE]: storedConfig }]
            }
            if (
                resource === 'dataStore/dqConfig/consistency' ||
                resource === 'dataStore/dqConfig/completeness'
            ) {
                return []
            }
            // Group fetches: ownership check asks for members only,
            // removeFromGroup asks for :owner
            if (resource.startsWith('dataElementGroups/')) {
                return { dataElements: owned ? [{ id: GEN_DE }] : [] }
            }
            if (resource.startsWith('indicatorGroups/')) {
                return { indicators: owned ? [{ id: GEN_IN }] : [] }
            }
            if (resource.startsWith('predictorGroups/')) {
                return { predictors: owned ? [{ id: GEN_PD }] : [] }
            }
            // Gate 2/3 metadata fetches
            if (resource === 'dataElements') {
                return { dataElements: [dataElement] }
            }
            if (resource === 'predictors') {
                return { predictors: [predictor] }
            }
            if (resource === 'indicators') {
                return { indicators: [indicator] }
            }
            throw new Error(`Unexpected GET ${resource} ${params}`)
        },
    })
}

const run = (fake: FakeApi, alsoDeleteMetadata: boolean) =>
    deleteConfiguration(fake.api, {
        baseConfig,
        deId: DE_SOURCE,
        deName: 'Foo',
        alsoDeleteMetadata,
    })

const deletePosts = (fake: FakeApi): RecordedCall[] =>
    fake
        .find('post', 'metadata')
        .filter((call) => call.params?.importStrategy === 'DELETE')

describe('deleteConfiguration', () => {
    it('removes only the dataStore entry and group memberships by default', async () => {
        const fake = makeApi()
        const outcome = await run(fake, false)

        expect(outcome.hasWarnings).toBe(false)
        expect(deletePosts(fake)).toHaveLength(0)
        // dataStore arrays rewritten without the entry
        const storePut = fake
            .find('put', 'dataStore/dqConfig')
            .find((call) => call.id === 'outliers')
        expect(storePut?.data).toEqual([])
    })

    it('deletes metadata in dependency order when all gates pass', async () => {
        const fake = makeApi()
        const outcome = await run(fake, true)

        expect(outcome.hasWarnings).toBe(false)
        expect(outcome.message).toContain('Outliers metadata: deleted.')

        const posts = deletePosts(fake)
        expect(
            posts.map((post) => Object.keys(post.data as object)[0])
        ).toEqual(['indicators', 'predictors', 'dataElements'])
        for (const post of posts) {
            expect(post.params?.atomicMode).toBe('ALL')
        }
    })

    it('skips deletion when an object was modified after creation', async () => {
        const fake = makeApi({ lastUpdated: TEN_MINUTES_LATER })
        const outcome = await run(fake, true)

        expect(outcome.hasWarnings).toBe(true)
        expect(outcome.message).toContain('modified after creation')
        expect(deletePosts(fake)).toHaveLength(0)
    })

    it('allows deletion when the modification was an app edit (server-format editedAt)', async () => {
        // editedAt is stored from the server's lastUpdated, so both sides
        // of the gate comparison are zone-less server timestamps
        const fake = makeApi({
            lastUpdated: TEN_MINUTES_LATER,
            editedAt: TEN_MINUTES_LATER,
        })
        const outcome = await run(fake, true)

        expect(outcome.hasWarnings).toBe(false)
        expect(deletePosts(fake)).toHaveLength(3)
    })

    it('rejects an editedAt more than a minute away from lastUpdated', async () => {
        const fake = makeApi({
            lastUpdated: TEN_MINUTES_LATER,
            editedAt: '2026-07-16T05:20:00.000',
        })
        const outcome = await run(fake, true)

        expect(outcome.hasWarnings).toBe(true)
        expect(deletePosts(fake)).toHaveLength(0)
    })

    it('skips deletion when objects are not in the app-managed groups', async () => {
        const fake = makeApi({ owned: false })
        const outcome = await run(fake, true)

        expect(outcome.hasWarnings).toBe(true)
        expect(outcome.message).toContain('not owned by app')
        expect(deletePosts(fake)).toHaveLength(0)
    })

    it('skips deletion when an object was renamed outside the app', async () => {
        const fake = makeApi({ renamedDataElement: true })
        const outcome = await run(fake, true)

        expect(outcome.hasWarnings).toBe(true)
        expect(outcome.message).toContain('name no longer matches template')
        expect(deletePosts(fake)).toHaveLength(0)
    })

    it('still removes the dataStore entry when metadata deletion is skipped', async () => {
        const fake = makeApi({ owned: false })
        await run(fake, true)

        const storePut = fake
            .find('put', 'dataStore/dqConfig')
            .find((call) => call.id === 'outliers')
        expect(storePut?.data).toEqual([])
    })
})

// ---------------------------------------------------------------------------
// V2 hybrid configurations: 1 threshold DE + 1 threshold predictor + the
// metric indicators; candidates and gates driven by the _V2 placeholders.

describe('deleteConfiguration (V2 hybrid)', () => {
    const substituteV2 = (template: string | null): string =>
        (template || '')
            .replace(/§NAME§/g, 'Foo')
            .replace(/§THRESHOLD_DESC§/g, 'modified-Z 3.5')

    const makeV2Api = (): FakeApi => {
        const storedConfig: PlaceholderConfig = {
            '§NAME§': 'Foo',
            '§VAL_MODZ§': '3.5',
            '§THRESHOLD_DESC§': 'modified-Z 3.5',
            '§DE_THRESHOLD_V2§': GEN_DE,
            '§PD_THRESHOLD_V2§': GEN_PD,
            '§IN_OUTLIER_PROP_V2§': GEN_IN,
        }
        const dataElement = {
            id: GEN_DE,
            name: substituteV2(templates['§DE_THRESHOLD_V2§'].name),
            description: substituteV2(
                templates['§DE_THRESHOLD_V2§'].description
            ),
            created: CREATED,
            lastUpdated: CREATED,
        }
        const predictor = {
            id: GEN_PD,
            name: substituteV2(templates['§PD_THRESHOLD_V2§'].name),
            generator: {
                description: substituteV2(
                    templates['§PD_THRESHOLD_V2§'].description
                ),
            },
            created: CREATED,
            lastUpdated: CREATED,
        }
        const indicator = {
            id: GEN_IN,
            name: substituteV2(templates['§IN_OUTLIER_PROP_V2§'].name),
            description: substituteV2(
                templates['§IN_OUTLIER_PROP_V2§'].description
            ),
            created: CREATED,
            lastUpdated: CREATED,
        }
        return fakeApi({
            onGet: (resource) => {
                if (resource === 'dataStore/dqConfig/outliers') {
                    return [{ [DE_SOURCE]: storedConfig }]
                }
                if (
                    resource === 'dataStore/dqConfig/consistency' ||
                    resource === 'dataStore/dqConfig/completeness'
                ) {
                    return []
                }
                if (resource.startsWith('dataElementGroups/')) {
                    return { dataElements: [{ id: GEN_DE }] }
                }
                if (resource.startsWith('indicatorGroups/')) {
                    return { indicators: [{ id: GEN_IN }] }
                }
                if (resource.startsWith('predictorGroups/')) {
                    return { predictors: [{ id: GEN_PD }] }
                }
                if (resource === 'dataElements') {
                    return { dataElements: [dataElement] }
                }
                if (resource === 'predictors') {
                    return { predictors: [predictor] }
                }
                if (resource === 'indicators') {
                    return { indicators: [indicator] }
                }
                throw new Error(`Unexpected GET ${resource}`)
            },
        })
    }

    it('passes all gates and deletes in dependency order', async () => {
        const fake = makeV2Api()
        const outcome = await run(fake, true)

        expect(outcome.hasWarnings).toBe(false)
        const posts = deletePosts(fake)
        const kinds = posts.map((call) => Object.keys(call.data as object)[0])
        expect(kinds).toEqual(['indicators', 'predictors', 'dataElements'])
        expect(outcome.message).toContain('Outliers metadata: deleted.')
    })
})
