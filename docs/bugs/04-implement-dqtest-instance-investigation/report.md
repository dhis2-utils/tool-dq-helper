# implement.im/dqtest: analytics export/query split-brain and failing data writes (instance investigation, not play-reproducible)

**Not a Jira-ready core bug report** — these symptoms were observed only on
https://implement.im.dhis2.org/dqtest (2.43.0.1, rev 58a531e, Laos HMIS database,
~29.8 M data values) and could **not** be reproduced on play 2.43.1 or on a blank
2.43.0.1. They need server-side access (`dhis.conf`, catalina logs) to root-cause —
most likely a mix of instance configuration and migration-state issues, possibly
hiding one or more core bugs. Handing this to the implement.im operators is the next
step. All evidence collected 2026-07-17 via the API and SQL views as `test_admin`.

## Symptom 1 — every aggregate analytics query returns empty, for all data

- `datavalue` table: 29,834,531 rows. `GET /api/analytics?dimension=dx:qqc4NnWVFL9...`
  (ANC 1st visit, months with ~1,150 raw values): 0 rows. Same for all data elements,
  indicators and reporting rates → every dashboard on the instance is empty.
- ANALYTICS_TABLE runs complete "successfully" (manual minimal run: 10 min 47 s, all
  stages "N successful and 0 failed", including the table swap) — yet the year tables
  the run builds (`analytics_2024/25/26`) do not exist in the main database afterwards
  (neither final nor `_temp`), while stale empty partitions `analytics_2013..2023`
  remain. `select count(*) from analytics` = 0.
- All `analytics_rs_*` resource tables in the main DB were empty (0 rows) until a
  manually triggered run repopulated them.
- Live capture via `pg_stat_activity` during a query shows the **query engine reads the
  main database**: `select ax."dx",ax."monthly",... from analytics_2016 as ax where ...`.
- The cluster contains only the `dhis2` database → the export presumably writes to a
  separately configured analytics database (2.42+ `analytics.database` feature) on
  another server, while queries read the main DB. **Check `dhis.conf` for
  `analytics.database` / `analytics.connection.*`.**
- The nightly full "Analytics" job (02:00, all years + tracker + outliers) has
  `lastExecutedStatus: FAILED`, failing ~80 seconds after start, every night. A manual
  run with `lastYears=3&skipTrackedEntities=true&skipEvents=true&skipOutliers=true`
  succeeds. The fast failure suggests an early-stage error — the exception will be in
  catalina.out around 02:01.

## Symptom 2 — data writes broken in ways play does not reproduce

On this instance (and not on play 2.43.1, where only the documented E8003/E8022
validation applies — see bug 02):

- Flat `POST /api/dataValueSets` payloads are **silently ignored**: response
  `SUCCESS`, `ignored: <all>`, zero conflicts even with `importReportMode=FULL`
  (sync and async, `force`/`skipAudit`/`preheatCache` make no difference). The
  complete-data-set payload form (`{"dataSet","period","orgUnit","dataValues":[...]}`)
  works. In `DefaultDataEntryService.upsertGroup` a store-level failure surfaces as
  "ignored" with no conflict, pointing at `HibernateDataEntryStore.upsertValues`
  (raw JDBC `INSERT ... ON CONFLICT` inside `session.doWork`).
- Predictors needing to insert **new** values fail with
  `409 "Unable to predict <name>"`, devMessage `"error executing work"` — even with
  output data elements in a data set assigned to all target facilities. Predictor runs
  whose predictions are all unchanged "succeed" (no writes attempted), which masks the
  problem until source data changes. (On play 2.43.1 and blank 2.43.0.1, predictor
  writes work.)
- `DELETE /api/dataValues` returns HTTP 500; `POST /api/dataValues` works for some
  period/org-unit combinations and returns `409 E1004 "Failed to upsert data value: "`
  (empty detail) for others.

The underlying SQLException is not exposed through the API; it will be in the server
log at the time of any failing predictor run (e.g.
`POST /api/predictors/{uid}/run?...` → "error executing work").

## Ask to the instance operators

1. `dhis.conf`: is `analytics.database` / a separate analytics connection configured?
2. catalina.out: nightly Analytics job exception (~02:01 daily), and the exception
   behind one manual failing predictor run / flat dataValueSets import.
3. After fixing analytics: re-run it — the staged comparison dashboard
   (`/dhis-web-dashboard/#/DQXdash0001`, DQX-prefixed test objects, safe to delete)
   will populate and can be used to verify.
