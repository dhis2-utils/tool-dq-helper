# Fresh 2.43 install: analytics output period types are opt-in — NOT a bug, but two smaller issues remain

**Status: largely intended behaviour** — `dataOutputPeriodTypes` is a designed 2.43
feature ([DHIS2-20379](https://dhis2.atlassian.net/browse/DHIS2-20379) "Configurable
data output period types", with app support in
[DHIS2-21001](https://dhis2.atlassian.net/browse/DHIS2-21001) (Data Visualizer),
[DHIS2-21127](https://dhis2.atlassian.net/browse/DHIS2-21127) (Line Listing),
[DHIS2-21128](https://dhis2.atlassian.net/browse/DHIS2-21128) (Dashboard)). On a fresh
empty install the setting is empty, and Data Visualizer correctly tells the user:
*"No period types available — No period types are enabled in the system. Please contact
your system administrator."*

We initially chased this as an "analytics silently empty" bug; the investigation
notes and reproduction assets are kept below because they document two things that
still seem worth reporting.

## Issue A (improvement suggestion): the analytics *API* fails silently where the apps do not

The web apps display an actionable message. The raw API does not: with no period types
enabled, `GET /api/analytics?dimension=dx:...&dimension=pe:202601&dimension=ou:...`
returns **HTTP 200 with `rows: []`** — no error, no warning. Internally the query
planner still generates SQL against the non-existent period-type column
(`… where ax."monthly" in (…)`), and the SQL exception is swallowed and surfaced as an
empty result.

API consumers (integrations, scripts, other clients) therefore see "no data" instead
of "period type Monthly is not enabled" — very hard to diagnose. **Expected:** the API
should reject the query with a clear error (parity with the app message), rather than
executing SQL that cannot succeed and swallowing the failure.

Reproduction (verified as-written on blank 2.43.0.1 and 2.43.1 instances,
2026-07-17): steps below with the attached [`metadata.json`](metadata.json) (org unit
levels, 2-level org unit tree, data element, Monthly data set, and a sample
visualization favorite `zzBUGviz001` using a fixed org unit — the reproducing user
needs no org unit assignment for it) and [`dataValues.json`](dataValues.json).

1. Start DHIS2 2.43 on an empty database.
2. `curl -u admin:district -X POST -H "Content-Type: application/json" "<base>/api/metadata?importStrategy=CREATE_AND_UPDATE&atomicMode=ALL" -d @metadata.json`
3. `curl -u admin:district -X POST -H "Content-Type: application/json" "<base>/api/dataValueSets" -d @dataValues.json`
4. `curl -u admin:district -X POST "<base>/api/resourceTables/analytics"` → completes OK.
5. `curl -u admin:district "<base>/api/analytics?dimension=dx:zzBUGde0001&dimension=pe:202601;202602;202603&dimension=ou:zzBUGroot01"`
   → **actual:** `200 OK`, `rows: []`; **expected:** an error explaining that the
   Monthly period type is not enabled for data output.
6. Enable period types and re-run analytics — values (30/34/32) appear, confirming the
   mechanism:
   `curl -u admin:district -X POST -H "Content-Type: application/json" "<base>/api/configuration/dataOutputPeriodTypes" -d @dataOutputPeriodTypes.json`
   (attached [`dataOutputPeriodTypes.json`](dataOutputPeriodTypes.json); note the
   payload must be objects with `name` — plain strings are rejected with a Jackson
   400, which may itself deserve a friendlier error). Opening the attached favorite
   `zzBUGviz001` in Data Visualizer before/after step 6 shows the app-side behaviour.

## Issue B — WITHDRAWN (not reproducible)

An earlier draft reported that dataSet metadata imports fail on the first boot of an
empty database with
`"not-null property references a null or transient value : DataSet.periodType"`
until the instance is restarted. On re-testing, a fresh blank **2.43.1** accepts the
identical import on the very first boot with no restart (verified 2026-07-17, and
independently confirmed by a second tester). The failure was observed exactly once, on
one blank 2.40.12 instance (where it persisted across retries within that boot and was
cleared by a restart) — most likely a timing/second-level-cache artifact of that
specific deployment flow (WAR deployed into an already-running Tomcat). Not filed;
kept here only so nobody re-reports it from our earlier notes.
