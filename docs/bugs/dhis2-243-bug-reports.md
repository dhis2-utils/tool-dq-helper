# DHIS2 2.43 bugs found during the subExpression exploration — reproduction steps

**Date:** 2026-07-17. All findings verified on DHIS2 **2.43.0.1** (revision 58a531e).
Two environments: a **blank instance** (fresh empty database, self-initialised by
2.43.0.1) and **https://implement.im.dhis2.org/dqtest** (Laos HMIS database
migrated to 2.43.0.1, ~29.8 M data values, production-style DQ config generated
by the pre-migration version of this tool).

---

## Bug 1 — Predictors with `organisationUnitDescendants: SELECTED` generate 0 predictions

**Status of evidence: fully root-caused; reproduced on blank AND migrated instances. Unfixed on 2.43 branch head and master as of 2026-07-17. No existing Jira issue found.**

Any predictor with `organisationUnitDescendants: "SELECTED"` silently generates
zero predictions on 2.43. The same predictor generates correctly on 2.40.12 and
2.41.9, and generates correctly on 2.43 when switched to `DESCENDANTS`.

**Reproduction (on dqtest, using its existing production config):**

```bash
# SELECTED predictor (ANC 1 non-outlier count) - same data, same month:
POST /api/predictors/xAT8APFMzQU/run?startDate=2026-03-01&endDate=2026-04-01
  -> "Generated 0 predictions"

# DESCENDANTS predictor (ANC 1 outlier threshold):
POST /api/predictors/ty5Rgpum8W5/run?startDate=2026-03-01&endDate=2026-04-01
  -> "Generated 1199 predictions"
```

On a blank instance: create a monthly data element with facility data, a
predictor at facility level with `SELECTED` referencing it → run → 0
predictions; flip only `organisationUnitDescendants` to `DESCENDANTS` → run →
predictions for every facility.

**Root cause (source):** 2.43 refactored `PredictionDataValueFetcher` from
`DataExportParams` (which always set `ouMode=DESCENDANTS` for scoping) to
`DeflatedDataValueParams`. In `HibernateDataValueStore.getDdvOrgUnits`, a
SELECTED predictor now renders

```sql
ou.hierarchylevel = <predictor level>  AND  dv.sourceid IN (<current user's root org units>)
```

— mutually exclusive conditions whenever the user's org unit is above the
predictor level (i.e. always in practice), so the data fetch returns nothing.
The predictor's descendants flag (which should only control whether
lower-level data rolls up) now also controls user-orgunit scoping.

**Real-world impact observed on dqtest:** the nightly "DQ - Data quality
metrics" PREDICTOR job reports **COMPLETED** every night while producing
nothing — production DQ output DEs silently stopped updating at the 2.43
upgrade (e.g. ANC 1 "reported in all of last 12 months" has values up to
2026-01 and none after; the DESCENDANTS threshold predictors continue).
6 of the 7 predictors generated per data element by this tool use SELECTED.

**Workaround:** set `organisationUnitDescendants: "DESCENDANTS"` (semantically
equivalent when the predictor level is the data-registration level).

---

## Bug 2 — Blank 2.43 install: all aggregate analytics silently empty until `dataOutputPeriodTypes` is configured

**REVISED ASSESSMENT (2026-07-17): largely intended behaviour** — this is the 2.43
feature DHIS2-20379 "Configurable data output period types"; Data Visualizer, Line
Listing and Dashboard show "No period types are enabled in the system" and guide the
admin. What remains reportable: the raw analytics **API** returns 200 + empty rows
with no indication (swallowed SQL error), and the first-boot dataSet-import failure.
See `../bugs/03-blank-instance-analytics-empty/` for the reframed report.

**Status of evidence: fully root-caused on a blank instance. Does not affect migrated databases (the setting arrives populated).**

On a fresh empty 2.43 database, every `/api/analytics` aggregate query returns
an empty grid even after a successful analytics run, with no error anywhere.

**Reproduction:** fresh empty 2.43.0.1 → create minimal metadata (org units,
data element, dataset, a few data values) → run analytics → query
`/api/analytics?dimension=dx:<de>&dimension=pe:<month>&dimension=ou:<root>` →
`rows: []` despite data being present in `analytics_yyyy` tables.

**Root cause:** the 2.43 analytics tables build one column per period type from
`configuration.dataOutputPeriodTypes`
(`AbstractJdbcTableManager.getPeriodTypeColumns`), which is **empty by default
on a blank install** → no `monthly`/`quarterly`/... columns are created; the
query planner still emits `ax."monthly" in (...)`
(`DefaultQueryPlanner.groupByPeriodType`), the SQL error is swallowed and an
empty result returned.

**Fix/workaround:**

```
POST /api/configuration/dataOutputPeriodTypes
[{"name":"Daily"},{"name":"Weekly"},{"name":"Monthly"},{"name":"BiMonthly"},
 {"name":"Quarterly"},{"name":"SixMonthly"},{"name":"Yearly"},{"name":"FinancialJuly"}]
```

(objects with `name`, not plain strings — strings give a Jackson 400), then
rebuild analytics.

---

## Bug 3 — dqtest instance: analytics export and analytics query operate on different storage; all dashboards empty

**Status of evidence: extensively evidenced via API + SQL views; final root cause needs `dhis.conf` and server logs (instance admins).**

On dqtest, ALL aggregate analytics queries return empty for ALL data (source
data elements, indicators, reporting rates), although raw data exists
(29.8 M rows) and ANALYTICS_TABLE runs report success.

Evidence chain (all via API / SQL Views as a superuser):

1. `datavalue` count: 29 834 531; `/api/analytics?dimension=dx:qqc4NnWVFL9...`
   for months with thousands of raw values: 0 rows.
2. All `analytics_rs_*` resource tables in the main database were **empty**
   (0 rows) until a manually triggered run repopulated them.
3. A manually triggered minimal run (`POST /api/resourceTables/analytics?lastYears=1&skipTrackedEntities=true...`)
   completes "successfully" (all stages "N successful and 0 failed", including
   "Swapping analytics tables"), **but the year partitions it builds
   (`analytics_2024/25/26`) never exist in the main database afterwards** —
   neither final nor `_temp` — while old empty partitions `analytics_2013..2023`
   remain. `select count(*) from analytics` = 0.
4. `pg_stat_activity` capture during live queries shows the **query engine
   reads the main database**:
   `select ax."dx",ax."monthly",... from analytics_2016 as ax where ...`.
5. The cluster contains only the `dhis2` database → the export presumably
   writes to a **separately configured analytics database**
   (2.42+ `analytics.database` feature) on another server, while aggregate
   queries read the main DB (or the reverse). Split-brain either way.
6. The nightly full "Analytics" job (02:00, tracker + outliers, all years)
   **fails after ~80 seconds every night** (`lastExecutedStatus: FAILED`),
   while the manual minimal run (skip tracker, skip outliers, lastYears≤3)
   succeeds — a second problem for the admins to look at (fast fail suggests
   an early-stage error, not resource exhaustion).

**For the instance admins:** check `dhis.conf` for `analytics.database` /
`analytics.connection.*`, and the catalina log for the nightly job's
exception. Every dashboard on this instance is currently empty because of
this.

---

## Bug 4 — 2.43 data-entry pipeline on the migrated instance: bulk imports silently no-op, predictor writes hard-fail

**Status of evidence: reproduced repeatedly on dqtest; NOT reproducible on our blank 2.43.0.1 (writes worked there), so likely interacts with migrated data or instance config. Needs server logs for the underlying SQLException.**

On dqtest (2.43.0.1, migrated DB):

1. **Flat bulk imports are silently ignored.** `POST /api/dataValueSets` with
   the standard flat payload (`{"dataValues": [{dataElement, period, orgUnit,
   categoryOptionCombo, value}, ...]}`) returns `SUCCESS` with
   `ignored: <all>` and **zero conflicts** even in `importReportMode=FULL`;
   nothing is stored. Sync and async, `force=true`, `skipAudit=true`,
   `preheatCache=false` — all identical. The complete-data-set payload form
   (`{"dataSet": ..., "period": ..., "orgUnit": ..., "dataValues": [...]}`)
   **works**. Source: `DefaultDataEntryService.upsertGroup` counts
   `store.upsertValues()` results; the store (`HibernateDataEntryStore
   .upsertValues`, a raw JDBC `INSERT ... ON CONFLICT` inside
   `session.doWork`) evidently fails or returns 0, which is reported as
   "ignored" with no conflict.
2. **Predictor writes fail hard.** Any predictor needing to INSERT new values
   fails with `409 "Unable to predict <name>"` / devMessage `"error executing
   work"` (the `doWork` wrapper). Predictors whose predictions are all
   *unchanged* "succeed" (nothing is written) — which masks the problem for
   existing configs until source data changes.
3. **Single-value endpoints are inconsistent.** `POST /api/dataValues` works
   for some period/orgunit combinations and returns
   `409 E1004 "Failed to upsert data value: "` (empty detail) for others;
   `DELETE /api/dataValues` returned 500 or E8003 in our tests (one test
   value on `DQXthrANC01` could not be deleted at all, which in turn blocks
   deleting that data element — cleanup left for admins).
4. **New 2.43 write requirements** discovered on the way (arguably intended
   behaviour, but breaking for this tool): data values can only be written
   for data elements that **belong to a dataset** (`E8003`), and the dataset
   must be **assigned to each target org unit** (`E8022`). Predictor output
   DEs generated by this tool satisfy neither by default. On dqtest the
   admins had already created a "DQ - Data quality metrics monthly" dataset
   for the legacy output DEs (assigned to the root only — which passes some
   write paths and not others).

**Combined impact:** on this 2.43 instance the current predictor-based DQ
tooling cannot be set up fresh at all (comparison predictors are killed by
Bug 1, and even DESCENDANTS threshold predictors cannot write NEW values due
to Bug 4), and bulk data imports from integrations may be silently lost.

---

## Side note — analytics run stats observed on dqtest

Minimal analytics runs on 2.43 accept
`lastYears=<n>&skipTrackedEntities=true&skipEnrollment=true&skipEvents=true&skipOutliers=true`
and completed in 50 s (lastYears=1) / 10 min 47 s (lastYears=3) on this
~30 M-value database, vs the failing full nightly run. `skipOutliers=true`
also skips the per-row outlier-stats columns (`avg_middle_value`,
`percentile_middle_value`, `mad`, `std_dev`) introduced in the 2.42+ analytics
table format.

## Objects left on dqtest for the side-by-side demo (all named `DQX`, safe to delete)

- 12 indicators `DQX - <ANC 1|DPT 3|Malaria confirmed cases> <completeness|consistency|outliers|excluding outliers>` — fully inline subExpression versions (no predictors, no output DEs; outlier threshold mean+3SD computed inline)
- indicator group `DQX - subExpression validation (test)`
- 12 visualizations `DQX vs DQ - ...` + dashboard **`DQX - subExpression DQ metrics validation (old vs new)`** (`/dhis-web-dashboard/#/DQXdash0001`) — each chart plots the legacy indicator and the DQX equivalent for the last 12 months at national level. **They will populate as soon as Bug 3 is fixed and analytics re-run** (the legacy indicators are equally empty today).
- 1 leftover data element `DQXthrANC01` (deletion blocked by Bug 4's broken value deletion; contains one soft test value)
