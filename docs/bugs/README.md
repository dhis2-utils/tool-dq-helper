# DHIS2 2.43 bug reports

Bug reports in Jira template format (Steps to Reproduce / Actual Result / Expected
Result), discovered during the subExpression metadata exploration
(see `../explorations/subexpression-metadata-simplification.md`). Reproduction steps
for 01 and 02 are **verified against the public play server**
(https://play.im.dhis2.org/stable-2-43-1, Sierra Leone demo, 2026-07-17) and include
ready-to-import `metadata.json` attachments.

| # | Folder | One-liner | Play-reproducible |
|---|---|---|---|
| 01 | [`01-predictor-selected-no-predictions`](01-predictor-selected-no-predictions/) | Predictors with `organisationUnitDescendants: SELECTED` silently generate 0 predictions on 2.43 | ✔ verified on 2.43.1 |
| 02 | [`02-predictor-writes-bypass-dataentry-validation`](02-predictor-writes-bypass-dataentry-validation/) | Predictors write values that the data value APIs then refuse to edit/delete (E8003/E8022) | ✔ verified on 2.43.1 |
| 03 | [`03-blank-instance-analytics-empty`](03-blank-instance-analytics-empty/) | Largely **intended behaviour** (DHIS2-20379 opt-in data output period types) — remaining: analytics *API* returns silent empty results where the apps show a clear "no period types enabled" message (improvement suggestion) | ✘ requires a fresh empty install |
| 04 | [`04-implement-dqtest-instance-investigation`](04-implement-dqtest-instance-investigation/) | implement.im/dqtest: analytics split-brain + failing writes — needs server-side investigation | ✘ instance-specific |
