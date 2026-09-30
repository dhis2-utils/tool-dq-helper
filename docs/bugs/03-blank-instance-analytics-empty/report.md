# Fresh 2.43 install: analytics output period types are opt-in — NOT a bug, but two smaller issues remain

**Status: largely intended behaviour** — `dataOutputPeriodTypes` is a designed 2.43
feature ([DHIS2-20379](https://dhis2.atlassian.net/browse/DHIS2-20379) "Configurable
data output period types", with app support in
[DHIS2-21001](https://dhis2.atlassian.net/browse/DHIS2-21001) (Data Visualizer),
[DHIS2-21127](https://dhis2.atlassian.net/browse/DHIS2-21127) (Line Listing),
[DHIS2-21128](https://dhis2.atlassian.net/browse/DHIS2-21128) (Dashboard)). On a fresh
empty install the setting is empty, and Data Visualizer correctly tells the user:
_"No period types available — No period types are enabled in the system. Please contact
your system administrator."_

We initially chased this as an "analytics silently empty" bug; the investigation
notes and reproduction assets are kept below because they document two things that
still seem worth reporting.

## Issue A (improvement suggestion): the analytics _API_ fails silently where the apps do not

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

## Issue B (bug, ≤2.42 only): first boot of an empty database — dataSet metadata import fails until restart

On the very first boot of an empty database, `POST /api/metadata` containing a
`dataSets` payload fails with
`"not-null property references a null or transient value : DataSet.periodType"`,
persisting across retries within that boot; one restart clears it permanently.

Version picture (all fresh empty databases, WAR deployed into a running Tomcat):

- **2.40.12: reproduced** (2026-07-17)
- **2.42.5.2: reproduced** (2026-08-13)
- **2.43.0.1 and 2.43.1: NOT reproducible** — first-boot imports succeed
  (verified 2026-07-17, independently confirmed by a second tester). The 2.43
  data-entry/periodtype rewrite appears to have fixed it.

Likely a stale periodtype cache: the `periodtype` table is populated during the
same first boot, and a Hibernate-level cache retains the pre-population state
until restart. Worth filing against supported 2.40/2.41/2.42 patch lines;
workaround is simply to restart once after initialising an empty database.
