# Configuration change: hybrid subExpression templates (V2)

**Applies from:** tool version 1.0 (the App Platform migration), August 2026.
**Affects:** metadata generated for _new_ configurations. Configurations
created with earlier versions keep working and remain viewable, editable
and removable in the app.

## Why the change

The tool previously generated a chain of **predictors** and intermediate
**output data elements** for each configured data element — up to 8
predictors, 8 data elements and 4 indicators per configuration. Predictors
carry real operational cost:

- they only produce values when a **scheduled predictor job** runs, and the
  results only become visible after the _next_ analytics run — two moving
  parts that must both be scheduled, in the right order;
- the outlier predictors must run **in sequence** (threshold first, then the
  four comparison predictors that read it);
- the intermediate data elements accumulate **stored values that go stale**:
  if source data is edited later, old predictions stay wrong until the next
  run, and facilities that stop reporting keep their last predictions
  forever (we found internally impossible values — "reported all 12 months"
  exceeding "reported any of 12 months" — in a real demo database for
  exactly this reason);
- on **DHIS2 2.43.0–2.43.1** six of the seven generated predictors silently
  produce nothing at all (`organisationUnitDescendants: SELECTED` regression,
  see `bugs/01-predictor-selected-no-predictions/`).

Since DHIS2 **2.40.2** (backported from 2.41.0), indicator `subExpression()`
supports multiple data elements and `periodOffset()` inside the expression.
This lets plain indicators do per-facility logic ("how many facilities
reported?") and 12-month-window logic ("reported in all of the last 12
months?") directly at analytics query time — no predictor, no intermediate
data element, no staleness.

The one thing indicators cannot do well is **order statistics** (median /
MAD), which is the outlier method we prefer. So the new layout is a
_hybrid_: one predictor computes the outlier threshold; everything else is
an indicator.

## What is generated now

Per configured data element:

|                   | Old (pre-platform)                                                                                                        | New (V2 hybrid)                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Predictors        | 7–8 (threshold, 4 outlier comparisons, 2 consistency, 1 completeness for disaggregated)                                   | **1** (outlier threshold only)              |
| Data elements     | 7–8 (threshold, excluding-outliers mirror, outlier/non-outlier counts, outlier values, all-12/any-12, any-disaggregation) | **1** (outlier threshold)                   |
| Indicators        | 4                                                                                                                         | **5** (the four metrics + outlier values)   |
| **Total objects** | **up to 20**                                                                                                              | **7**                                       |
| Scheduled job     | predictor job, ordered chain                                                                                              | predictor job, single independent predictor |

The four metrics are unchanged in name and intent:

1. **Data element completeness (%)** — now
   `subExpression(if(isNotNull(#{DE}), 1, 0)) / EXPECTED_REPORTS`. Because a
   data element referenced inside a subExpression is the facility total
   across disaggregations, this counts _facilities reporting any value_
   directly — the separate "reported for any disaggregation" predictor and
   data element are no longer needed; plain and disaggregated data elements
   use the same template.
2. **Facilities consistently reporting last 12 months (%)** — numerator
   counts facilities with a value in **all** of `periodOffset(-1)` …
   `periodOffset(-12)`, denominator those with a value in **any** of them.
   One indicator; the two consistency predictors and their data elements are
   gone.
3. **Values that are outliers (%)** — numerator counts facilities whose
   value exceeds their threshold, denominator counts facilities that are
   _assessable_ (have both a value and a threshold this month). Compares
   directly against the threshold data element inside a subExpression.
4. **Excluding outliers (%)** — sum of non-outlier values over the sum of
   assessable values.

A fifth indicator replaces the retired outlier-values data element:

5. **Outlier values** — the reported value itself whenever it exceeds the
   threshold, for dashboards and pivot tables that list the outlying
   values. It is blank unless the value is an outlier, so a facility ×
   month pivot shows only outliers, and it aggregates to the **sum** of
   the outlying values.

    Two details in this indicator are load-bearing, and both were verified
    against live analytics (see "Validation trail"):
    - Its indicator type must have **factor 1**. The other four metrics are
      percentages (factor 100); reusing that type here multiplies every
      value by 100 — a raw 8 is reported as 800. The app looks up a
      factor-1 type (`filter=factor:eq:1`, preferring `number: true`) and
      refuses to build the configuration if the instance has none.
    - Its denominator ends in **`.aggregationType(MAX)`**. The denominator
      is a guarded 1-or-0 per facility-month, which makes DHIS2 render
      non-outliers and unassessable months as no value (a zero denominator
      yields no value). Left to aggregate with the default SUM, the
      denominator would become "number of outliers" and higher levels
      would show the _average_ outlying value instead of the total; MAX
      keeps it at 1, so levels above the facility sum the values.

    Known wart, but not on a supported version: on **2.44-SNAPSHOT** an
    `.aggregationType()` modifier makes
    `POST /api/indicators/expression/description` fail with an internal
    error (`translationCache` NPE) instead of returning the description.
    **2.42.6 returns it normally**, so supported versions are unaffected
    (2.43 not retested); analytics and metadata import accept the
    expression on both. The app's live test tolerates that one failure
    explicitly so it keeps passing on 2.44, and the Maintenance app would
    surface the same error there when the indicator is opened for editing.
    Worth reporting upstream before 2.44 is released.

### The outlier threshold predictor

The threshold is still a stored, dashboard-visible data element, computed
monthly per organisation unit from the previous 12 months. Two methods are
offered at configuration time:

- **Modified Z-score (default, k = 3.5)** — `median + k·MAD/0.6745`, the
  method generally recommended for health data. MAD is computed with nested
  `median()` and requires `missingValueStrategy: SKIP_IF_ANY_VALUE_MISSING`
  (with the old default strategy, missing months are zero-filled inside
  composite vector expressions and corrupt the MAD).
- **Mean + k·SD (k = 2.0–4.0)** — the previous method, unchanged:
  `avg + k·stddevPop`. Population SD is deliberate: it matches both the old
  tool verbatim and DHIS2's built-in outlier statistics (`stddev_pop` in the
  analytics outlier columns). Sample SD (`stddevSamp`) is a one-token change
  if ever preferred.

Because the metrics only ever compare against the threshold data element,
the method is defined in exactly one place and can be changed without
touching the indicators. The predictor uses
`organisationUnitDescendants: DESCENDANTS`, which is equivalent to
`SELECTED` at the data-registration level and — unlike `SELECTED` — works
on DHIS2 2.43. Since the only stored (data element) value is the threshold, it also
becomes manageable to calculate this treshold with an external tool and import into
DHIS2. This means other ways of calculating tresholds can be supported as well.

### Other configuration-level changes

- **dataStore format is unchanged** (same `dqConfig` namespace and per-check
  arrays). New configurations self-identify through placeholder keys ending
  in `_V2`; no migration of existing entries is performed or required.
- The app's **threshold edit** now rewrites only the threshold predictor and
  data element (names + generator); the indicators are untouched.
- **Removal** of a V2 configuration deletes 5 indicators, 1 predictor and
  1 data element (the same safety gates apply). Note: on 2.43 the threshold
  data element can be blocked from deletion by the data value changelog of
  past predictor runs — the app reports this cleanly.
- Requirements: DHIS2 **2.40.2 or later** (the app's `minDHIS2Version`
  remains 2.41). A predictor job must still be scheduled, but it only needs
  the threshold predictor group and has no ordering constraints.

## Expected differences in output

Values are **numerically identical** to the old configuration wherever both
produce a value. Validated on a controlled instance (2 facilities × 24
months × plain + disaggregated data elements, both methods set to
mean + 3 SD for comparability): thresholds matched raw-value-for-raw-value,
and all four metrics matched in every comparable cell at facility, district
and national level (see `explorations/subexpression-metadata-simplification.md`
and `explorations/validation-old-vs-new.xlsx`). The differences are
confined to when a value exists at all, governed by one rule:

> **Blank when the metric's required inputs are missing; 0 only when the
> metric is computed and genuinely zero.**

Concretely:

1. **Explicit zeros instead of missing rows.** The old predictors never
   stored zero results (`zeroIsSignificant: false`), so facility-level
   tables silently omitted "not consistent" (0%) and "everything was an
   outlier" (0% excluding outliers). The new indicators show these as
   explicit 0% rows. Aggregated values are unchanged — the old zeros were
   invisible, not absent from the maths.
2. **Outlier percentages only count assessable values.** The old
   configuration counted a facility that reported _nothing_ as a
   "non-outlier" that month (a missing value compared as 0 ≤ threshold),
   diluting outlier rates at aggregated levels. The new denominator counts
   only facility-months with both a value and a threshold. Expect slightly
   _higher_ (more honest) outlier percentages in months where some
   facilities are silent.
3. **A facility's first months are blank, not 100% outlier.** The old
   configuration flagged any value without a threshold (e.g. the first
   month a facility ever reports) as an outlier — a missing threshold was
   compared as 0. The new indicators treat "no threshold" as _unassessable_
   and show nothing. (This fixes a genuine defect that the old and new
   engines otherwise shared: inside subExpressions, DHIS2 replaces missing
   values with 0 except within `isNull`/`isNotNull`, so the guard must be
   explicit.)
4. **Consistency is blank (not 0%) for facilities without 12 months of
   history.** The denominator carries a history probe: a facility only
   counts as assessable if it has at least one report 12-24 months back.
   Facilities in their first year are blank and do not drag down
   aggregated consistency (the old configuration counted them in the
   denominator). A facility _with_ history that reported only some of the
   last 12 months reads a computed 0%. Note the probe's horizon: a
   facility that last reported more than 24 months ago is treated as new
   again if it resumes.

### Caveats to keep in mind

- **Monthly grain only.** `periodOffset` windows follow the _query's_
  period type: a quarterly chart of the consistency indicator silently
  means "last 12 quarters". Don't place these indicators in
  quarterly/yearly layouts. (The old configuration was also not meaningful
  quarterly — it returned facility-month ratios — but it failed less
  visibly.)
- **Doris analytics backend is not yet supported** for any subExpression
  indicator ([DHIS2-21793](https://dhis2.atlassian.net/browse/DHIS2-21793)
  — the generated SQL is PostgreSQL-specific). Work to address this is already
  ongoing. Note the _old_ templates were already partially affected: plain completeness
  has used a subExpression since the pre-platform tool.
- **Modified-Z degeneracy:** a facility whose 12 window values are all
  identical has MAD = 0, so any increase is flagged. This is inherent to
  the method (the built-in DHIS2 outlier tools share it); the mean+SD
  method is the fallback for such series.
- Query cost moves from a nightly job to analytics query time. For the
  dashboard patterns this tool targets (monthly values, aggregate trends)
  this is negligible; very large facility-level multi-month pivots of the
  outlier indicators are the one pattern to watch (~seconds, not
  sub-second, at 1,000+ facilities).

## Validation trail

- Controlled equivalence: `explorations/subexpression-metadata-simplification.md`
  (§7b real-data validation on the Laos HMIS demo; §4 version matrix
  2.40.12–2.43.1), `explorations/validation-old-vs-new.xlsx` and
  `explorations/validation-pivot-old-vs-new.png` (24-month side-by-side).
- Platform issues found on the way: `bugs/` (predictor SELECTED regression
  on 2.43; predictor-written values immutable via data APIs on 2.43; the
  ≤2.42 first-boot import quirk).
- Outlier-values indicator (2026-09-15, DHIS2 2.44-SNAPSHOT on
  play.im.dhis2.org/dev, Sierra Leone demo): four candidate designs were
  built as real indicators over two existing data elements (one standing in
  for the value, one for the threshold) and compared against the raw
  analytics values of 1,216 facility-months in Bo district, which covered
  all four cases (690 above / 475 below / 47 value-without-threshold / 4
  threshold-without-value). Results: the chosen design (factor 1,
  `.aggregationType(MAX)`) returned the exact value in all 690 outlier
  cells, blank in the other 526, and the district total matched the sum of
  the outlying values in all 12 months. A percentage indicator type
  returned every value ×100; a default-SUM guarded denominator returned the
  average instead of the sum (43 where 2,569 was expected); and producing
  blanks by dividing by zero inside the subexpression aborted the whole
  analytics request with `E7132`.
- Outlier-values indicator on a supported version (2026-09-15, DHIS2
  **2.42.6**, blank instance + the `subexpression-tests/fixture.py`
  fixture): the app's own import created the indicator, the threshold
  predictor wrote real thresholds, and analytics then returned the value
  itself for the one outlying facility-month (100 against a threshold of
  14 — not 10,000), blank for the two facilities below their threshold and
  for the facility with a threshold but no value, and the root aggregate
  equalled the sum of the outlying values. The full live suite (47 tests,
  including gated deletion of the 5 indicators) passes against that
  instance.
- Automated: 41 unit tests plus an env-gated live end-to-end test
  (`LIVE_DHIS2=… pnpm run test`) that runs initialise → preview → import →
  predictor run → server-side expression validation → threshold edit →
  gated deletion against a real instance.
