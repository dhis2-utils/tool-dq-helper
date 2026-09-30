# Simplifying the DQ metadata with indicator subExpressions

**Date:** 2026-07-17
**Question:** Can the metadata this app generates (predictors + output data
elements + indicators, per [the DQ implementation
guide](https://docs.dhis2.org/en/implement/data-quality/analysis.html)) be
simplified on DHIS2 2.40+ using the improved indicator `subExpression()`
functionality ([DHIS2-15083](https://dhis2.atlassian.net/browse/DHIS2-15083))
— in particular, can we reduce or remove predictors?

**Answer: yes — all three checks can be expressed as pure indicators with no
predictors, no output data elements and no scheduled job, from DHIS2
2.40.2 onwards.** Every candidate expression below was validated on real
instances (blank 2.40.12, 2.41.9 and 2.43.0.1) against both hand-computed
values and the app's current predictor-based configuration running on the
same data. Two significant DHIS2 2.43 platform bugs were discovered along the
way; one of them breaks the app's _current_ predictor-based output on 2.43.

---

## 1. What changed in the platform

The app's templates rely on predictors for anything that needs per-facility
logic (counting reporting facilities) or cross-period windows (12-month
mean/SD, consistency). Three core changes make indicators able to do this
directly:

| Change                                                                                    | Ticket      | Ships in                         |
| ----------------------------------------------------------------------------------------- | ----------- | -------------------------------- |
| subExpression may reference **multiple items**, including multiple distinct data elements | DHIS2-15083 | 2.41.0, **backported to 2.40.2** |
| **periodOffset** allowed _inside_ subExpression                                           | DHIS2-15874 | 2.41.0, **backported to 2.40.2** |
| Boolean aggregation fix in subExpression                                                  | DHIS2-15936 | 2.41.0                           |

The published docs (even for 2.43) still say a subExpression "may reference
only one data element" — that text is outdated. The only validation in the
code (`FunctionSubexpression.java`) is that items must be data elements or
data element operands.

Verified subExpression semantics (from `JdbcSubexpressionQueryGenerator` and
confirmed empirically):

- The expression inside `subExpression(...)` is evaluated **per registration
  orgunit per period** (an inner SQL subquery grouped by `ou, pe`), then the
  results are aggregated up the hierarchy (SUM by default; override with
  `.aggregationType(...)` after the closing parenthesis).
- `#{DE}` inside a subExpression is the **facility total across category
  option combos** — so `if(isNotNull(#{DE}),1,0)` counts _facilities_, not
  category combo values. This is exactly the "reported for any
  disaggregation" semantic the completeness predictor exists for.
- `#{DE}.periodOffset(-n)` refers to the facility's value n periods before
  the _reporting_ period. The same DE may be referenced any number of times
  with different offsets.
- Facilities with no data in the queried window produce no row (like a
  predictor with `SKIP_IF_ALL_VALUES_MISSING`). **But within a group that
  does exist, null item values are replaced with 0 — except inside
  `isNull()`/`isNotNull()`** (`DimItemDataElementAndOperand
.replaceDataElementNulls`). A comparison like `#{x} > #{threshold}` with a
  missing threshold therefore evaluates as `x > 0` = true, NOT as
  null→else. Any multi-item comparison must be explicitly guarded with
  `isNotNull(...)` on every item whose absence should mean "unassessable".
- `if()` compiles to SQL `CASE`, which short-circuits — nested `if()` is the
  safe way to guard divisions (never rely on `&&` evaluation order).
- The expression language has `^` (power) but no `sqrt()` — use `^0.5`.

## 2. The predictor-free metadata, per check

For a source data element `#{DE}` (what the templates call `§DE_SOURCE§`),
with `N` = number of period-offset references, i.e. the 12-month window
`OFFS(i) = #{DE}.periodOffset(-i)` for i = 1..12:

### Completeness — plain (already predictor-free in the current templates)

```
numerator:   subExpression(if(isNotNull(#{DE}), 1, 0))
denominator: R{DS.EXPECTED_REPORTS}
```

Works from 2.38/2.40.0 (single item, no offsets).

### Completeness — disaggregated ("reported for any disaggregation")

Currently 1 predictor + 1 output DE + 1 indicator. Replacement is the _same
expression as the plain case_ — because `#{DE}` inside subExpression is the
facility total across COCs, it already counts one per facility:

```
numerator:   subExpression(if(isNotNull(#{DE}), 1, 0))
denominator: R{DS.EXPECTED_REPORTS}
```

Validated: 40.0% == predictor-based 40.0% (facility counting confirmed to be
per facility, not per COC — a facility reporting two disaggregations counts
once). Works from 2.40.0.

### Consistency of reporting (currently 2 predictors + 2 DEs + 1 indicator)

One single indicator, nothing else:

```
numerator:   subExpression(if( Σ_{i=1..12} if(isNotNull(OFFS(i)),1,0) == 12, 1, 0))
denominator: subExpression(if( Σ_{i=1..12} if(isNotNull(OFFS(i)),1,0) > 0,  1, 0))
```

Validated: 50.0% == predictor-based 50.0% (June 2026, and per-month values
for other months correct against hand computation). Needs 2.40.2+.

### Outliers (currently 5 predictors + 5 DEs + 2 indicators)

The 12-month mean + k·SD threshold can be computed inline. With
`n    = Σ if(isNotNull(OFFS(i)),1,0)`,
`sumX = Σ if(isNotNull(OFFS(i)), OFFS(i), 0)`,
`sumX2= Σ if(isNotNull(OFFS(i)), OFFS(i)*OFFS(i), 0)`:

```
mean      = (sumX / n)
sd        = ((sumX2/n - mean*mean) ^ 0.5)          -- population SD, same as stddevPop()
threshold = (mean + k*sd)
```

**"Values that are outliers (%)"** — one indicator (hybrid form shown;
both numerator and denominator are guarded on value AND threshold
existence, so a facility's thresholdless first months are blank rather
than 100%-outlier — see the null-replacement bullet in §1):

```
numerator:   subExpression(if(isNotNull(#{DE}) && isNotNull(#{THR}), if(#{DE} > #{THR}, 1, 0), 0))
denominator: subExpression(if(isNotNull(#{DE}) && isNotNull(#{THR}), 1, 0))
```

**"Excluding outliers (%)"** — one indicator:

```
numerator:   subExpression(if(n > 0, if(#{DE} <= threshold, if(isNotNull(#{DE}),#{DE},0), 0), 0))
denominator: #{DE}
```

(The outer `if(n > 0, ..., 0)` guard is required: `CASE` short-circuiting
prevents division by zero for facilities that report in the current month but
have no history.)

Validated: "excluding outliers" 23.077% == predictor-based 23.077% ==
hand-computed 30/130. Numerator expression is ~7.5 kB of text — imports,
validates and evaluates fine. Needs 2.40.2+.

**Hybrid variant** (validated as well): keep only the _threshold_ predictor +
its DE, and replace the four comparison predictors with two-data-element
subExpressions such as `subExpression(if(#{DE} > #{DE_THRESHOLD}, 1, 0))`.
Identical results, much cheaper to query (see §5), and it keeps a visible
threshold/mirror DE for dashboards — at the cost of still needing the
predictor job.

**MAD-hybrid variant (recommended — validated exactly):** the hybrid layout
decouples the _method_ from the _metrics_: the indicators only ever compare
against `#{DE_THRESHOLD}`, so the outlier method is defined in exactly one
place — the threshold predictor's generator. Replacing mean+SD with a
modified-Z threshold:

```
generator:  median(#{DE}) + 3.5 * (median(greatest(#{DE} - median(#{DE}),
                                        median(#{DE}) - #{DE})) / 0.6745)
strategy:   SKIP_IF_ANY_VALUE_MISSING          <-- required for correct MAD (§5b)
descendants: DESCENDANTS                        <-- required on 2.43 (§6)
outlier %:        subExpression(if(#{DE} > #{THR}, 1, 0)) / subExpression(if(isNotNull(#{DE}),1,0))
excluding outl %: subExpression(if(#{DE} <= #{THR}, #{DE}, 0)) / #{DE}
```

Validated on the fixture: per-facility thresholds exactly match hand-computed
median + 3.5·MAD/0.6745 (14.09 / 25.57 / 7.0 / 41.57), and the two indicators
return the expected values at facility and country level (33.33% / 23.08%).
Outliers check: 5 predictors + 5 DEs + 2 indicators → **1 + 1 + 2**.
Caveat to document: a facility whose window values are all identical has
MAD = 0, so its threshold collapses to the median and _any_ increase is
flagged (classic modified-Z degeneracy — the built-in tools hit the same
thing as a division by zero). If that matters, floor the MAD term with
`greatest(...)` or fall back to the SD method for such series.

### Object-count impact per configured data element

|                                             | predictors | output DEs | indicators | total objects | scheduled job             |
| ------------------------------------------- | ---------- | ---------- | ---------- | ------------- | ------------------------- |
| Current (all 3 checks, disaggregated DE)    | 8          | 8          | 4          | 20            | required, per period      |
| Pure-indicator (mean+SD outliers)           | 0          | 0          | 4          | 4             | none                      |
| MAD-hybrid (modified-Z outliers, see below) | 1          | 1          | 4          | 6             | required (threshold only) |

The pure-indicator version also removes the _operational_ pain: no predictor
job scheduling, no "predictors ran but analytics didn't" staleness (predictor
outputs only appear after the _next_ analytics run), and no orphaned output
data values when configs are deleted.

### Null/zero rule adopted (2026-08-13)

One consistent rule across the V2 metrics: **blank when the metric's
required inputs are missing; 0 only when genuinely computed as zero.**
Outlier metrics require both a value and a threshold (guards above);
consistency requires 12 months of observable history — the denominator
probes offsets -12..-24 and facilities without any report 12+ months back
are blank, not 0% (facilities WITH history reporting only 1-11 of the last
12 months read a computed 0%). Population SD (`stddevPop`) is retained
deliberately: it matches both the legacy tool verbatim and DHIS2's built-in
outlier statistics (`stddev_pop` in the analytics outlier columns);
`stddevSamp` is a one-token alternative if literature-style sample SD is
preferred.

## 3. Semantic differences found (all validated)

Differences 1-3 are **design choices** — the legacy behaviour can be
replicated exactly with alternative expressions (each replication validated
on the fixture). Only difference 4 is **inherent** to subExpressions.

1. **Explicit zeros** _(optional)_. Predictor output DEs have
   `zeroIsSignificant: false`, so 0-results (e.g. "not consistent", "no
   outliers") are never stored and facilities silently disappear from
   facility-level tables. The indicator versions as proposed return explicit
   `0%` rows. To replicate the legacy row-suppression instead, return the
   `null` literal in place of `0`:
   `subExpression(if(<all-12> == 12, 1, null))` — validated: facility rows
   for non-consistent facilities disappear, matching the predictor output;
   aggregates are identical either way (SQL SUM ignores nulls, and the
   generated query filters rows where the whole subexpression is null).
2. **Outlier-% denominator** _(optional)_. The current predictor config
   counts a facility that did _not report at all_ in the current month as a
   "non-outlier" (missing value → 0 → `0 <= threshold`), inflating the
   denominator (fixture: 25.0% vs 33.3%). The proposed denominator counts
   only facilities that actually reported. To replicate the legacy
   denominator in the MAD-hybrid, count facilities that _have a threshold_
   instead: `subExpression(if(isNotNull(#{THR}), 1, 0))` (validates OK).
3. **Facilities with no reporting history** that suddenly report
   _(optional)_: flagged as outliers by the current predictors (missing
   threshold → 0 → any value is "above threshold"); the proposed guarded
   subExpression counts them as non-outliers. Legacy behaviour is
   replicable with `firstNonNull`:
   `subExpression(if(#{DE} > firstNonNull(#{THR}, 0), 1, 0))` (validates
   OK). Recommend the new behaviour, but it is a deliberate choice.
4. **Non-monthly queries** _(inherent)_. The periodOffset window follows the
   _query_ period type: queried quarterly, "last 12 months" silently becomes
   "last 12 quarters". The predictor approach queried quarterly instead
   returns facility-_month_ ratios. Both are self-consistent but different;
   monthly is the designed grain for both, and this must be documented for
   users. (Fixture: Q2 2026 consistency — predictor 25.0% vs subExpression
   0.0%, both explainable.) There is no expression-level way to pin the
   window to months when the user queries other period types. This applies
   to the consistency indicators and, in the MAD-hybrid, to the comparison
   indicators (a quarterly query compares quarterly-summed values against
   quarterly-summed monthly thresholds).

## 4. Version matrix (all empirical, blank instances)

|                                                    | 2.40.12 | 2.41.9 | 2.42                          | 2.43.0.1               |
| -------------------------------------------------- | ------- | ------ | ----------------------------- | ---------------------- |
| Plain + disaggregated completeness (subExpression) | PASS    | PASS   | (source-identical)            | PASS                   |
| Consistency via periodOffset subExpression         | PASS    | PASS   | (source-identical)            | PASS                   |
| Inline mean+SD outlier indicators                  | PASS    | PASS   | (source-identical)            | PASS                   |
| Hybrid (multi-DE subExpression vs threshold DE)    | PASS    | PASS   | (source-identical)            | PASS                   |
| Current predictor-based config                     | PASS    | PASS   | expected PASS (old code path) | **FAIL — bug 1 below** |

The subExpression engine is byte-identical between 2.41, 2.42 and 2.43
branches (only import/refactor diffs), so 2.42 was covered by source
inspection rather than a fourth instance. Original 2.40.0/2.40.1 lack the
backports — practically irrelevant, and the app's `minDHIS2Version` is
already 2.41.

## 5. Performance (1000 facilities × 24 months, blank instance)

Predictor side, for scale: running the app's 7 predictors for **one month**
over 1005 facilities took ~7.4 s plus a full analytics rebuild before results
are visible.

Query-side timings (cold analytics cache; warm cache is instant):

| Query                                                      | 2.40.12   | 2.43.0.1       |
| ---------------------------------------------------------- | --------- | -------------- |
| Inline-stats outlier %, 1 month, aggregated                | 0.26 s    | 0.30 s         |
| Inline-stats outlier %, 12-month aggregate trend           | 2.0 s     | 2.1 s          |
| Consistency, 12-month × 1000-facility pivot                | 8.0 s     | 6.5 s          |
| Hybrid outlier %, 12-month × 1000-facility pivot           | 9.3 s     | (not repeated) |
| **Inline-stats outlier %, 12-month × 1000-facility pivot** | **211 s** | **118 s**      |
| Predictor-DE equivalents of any of the above               | ≤ 0.7 s   | ≤ 0.7 s        |

Interpretation: for the dashboard patterns this tool targets (monthly values,
aggregate trend lines), pure indicators are comfortably fast. The one hazard
is a _facility-level pivot of many months_ of the heavy inline-stats
expression. If that use case matters for a deployment, the hybrid variant
(or predictors) is the escape hatch. Note that predictors shift cost to the
scheduled job + analytics rebuild rather than eliminating it.

## 5b. Outlier _methods_: predictors vs subExpressions

The two engines have different statistical vocabularies (verified in
`DefaultExpressionService` registries and empirically):

| Method                                         | Predictors                                                                                                                                                                                                                                                                                       | subExpression indicators                                                                           |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Z-score, population SD (what this app uses)    | ✔ `avg()` + `stddevPop()`                                                                                                                                                                                                                                                                        | ✔ inline Σx/Σx² arithmetic — validated exactly equal                                               |
| Z-score, sample SD                             | ✔ `stddev()`/`stddevSamp()`                                                                                                                                                                                                                                                                      | ✔ same arithmetic with n−1                                                                         |
| Min-max (value outside historical min/max)     | ✔ `min()`/`max()`                                                                                                                                                                                                                                                                                | ✔ `greatest(...12 offsets...)` / `least(...)` — validated (SQL greatest/least ignore null offsets) |
| Percentile / IQR fences (e.g. P75 + 1.5·IQR)   | ✔ `percentileCont(p, …)`; combining two vector results (P75 − P25) is scalar arithmetic and safe                                                                                                                                                                                                 | ✘ no order statistics over offsets                                                                 |
| Median-based / modified Z-score (median + MAD) | ✔ **with `missingValueStrategy: SKIP_IF_ANY_VALUE_MISSING`** — nested `median(greatest(#{DE}-median(#{DE}), median(#{DE})-#{DE}))` computes exact MAD for every facility incl. gappy reporters (validated: 0.5 / 3.0 / 0.0 / 3.0 = hand-computed values for 12/12, 6/12, 12/12, 11/12 reporters) | ✘ median of 12 offsets would need a sorting network of greatest/least — impractical                |
| Normal-distribution scoring                    | ✔ `normDistCum()`/`normDistDen()` (niche)                                                                                                                                                                                                                                                        | ✘                                                                                                  |

**Missing-data handling is controlled by the predictor's
`missingValueStrategy`, and it decides whether median/MAD are usable**
(validated on the fixture, same generator, three runs):

| Strategy                                                     | Behaviour for vector expressions                                                                                                  | MAD result (true: A1=0.5, A2=3, B1=0, B2=3)              |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `SKIP_IF_ANY_VALUE_MISSING`                                  | sample periods with any missing item are **excluded from the vector**                                                             | 0.5 / **3.0** / 0.0 / **3.0** — exact for everyone       |
| `SKIP_IF_ALL_VALUES_MISSING` (what this app's templates use) | plain item references skip missing samples, but **composite expressions inside a vector function substitute 0** for missing items | 0.5 / 7.5 / 0.0 / 3.5 — contaminated for gappy reporters |
| `NEVER_SKIP`                                                 | missing → 0 everywhere (even never-reporting facilities get a value)                                                              | 0.5 / 2.5 / 0.0 / 3.5 (+ A3=0.0) — wrong for gaps        |

So a _predictor-based_ modified Z-score is genuinely implementable: one
predictor with `SKIP_IF_ANY_VALUE_MISSING` producing a
`median + k·MAD/0.6745` threshold DE, then comparisons as today (or as
two-DE subExpressions, hybrid style). The usual predictor costs — scheduled
job, output DEs, and the 2.43 SELECTED regression (§6) — still apply.

**How the built-in tools handle missing data:** the same way as
`SKIP_IF_ANY` — missing periods are simply absent rows and are **excluded
from the sample**, never zero-filled. The 2.42+/2.43 analytics tables
compute `percentile_middle_value` (median), `mad`, `avg_middle_value` and
`std_dev` with SQL `percentile_cont(0.5) within group` / `stddev_pop` over
existing `datavalue` rows only (`JdbcAnalyticsTableManager.
getOutliersJoinStatement`), and the pre-2.42 `/api/outlierDetection` (used
by the bundled DQ app) likewise aggregates over stored rows within the
requested data period. One important semantic difference: the analytics-table
stats are computed over the **entire stored series** per (data element,
orgunit, COC) — not a rolling 12-month window relative to each reporting
period, which is what predictors (sequentialSampleCount) and the
periodOffset subExpressions give. None of these precomputed columns are
addressable from indicator expressions.

Bottom line: for the method this app implements (mean + k·SD),
subExpressions lose nothing. Min-max is _cheap to add_ as an indicator-only
variant. A modified Z-score variant is possible but only via predictors
(with `SKIP_IF_ANY_VALUE_MISSING`), not as pure indicators.

## 6. DHIS2 2.43 platform bugs discovered

1. **Predictors with `organisationUnitDescendants: "SELECTED"` generate 0
   predictions on 2.43.0/2.43.0.1** (unfixed on the 2.43 branch and master as
   of 2026-07-17; no Jira issue found). 2.43 refactored
   `PredictionDataValueFetcher` from `DataExportParams` (always
   `ouMode=DESCENDANTS`) to `DeflatedDataValueParams`; in
   `HibernateDataValueStore.getDdvOrgUnits` a SELECTED predictor now yields
   `ou.hierarchylevel = <level> AND dv.sourceid IN (<user's root>)` —
   mutually exclusive → zero rows. **6 of the 7 predictors this app
   currently generates use SELECTED, so the app's existing configurations
   silently stop producing data on 2.43.** Workaround: switch predictors to
   `DESCENDANTS` (equivalent when the predictor level is the
   data-registration level). Verified: with DESCENDANTS, all predictor
   results on 2.43 match 2.40/2.41 exactly. → Should be filed in Jira.
2. **Blank 2.43 installs return empty analytics for everything** until
   `POST /api/configuration/dataOutputPeriodTypes` is set: the 2.43 analytics
   tables build per-periodtype columns from that (empty-by-default)
   configuration while the query planner still selects `ax."monthly"`; the
   SQL error is swallowed and an empty grid returned. Seeded/migrated
   databases are unaffected. → Worth filing too (bad first-run experience).

## 7. Recommendation for this app

1. **Adopt pure-indicator templates for completeness and consistency, and
   the MAD-hybrid for outliers** (`minDHIS2Version` stays 2.41 — no change
   needed). Completeness/consistency lose their predictors entirely;
   outliers keep exactly one predictor + one DE computing a modified-Z
   (median + k·MAD/0.6745) threshold — the method generally recommended
   over mean+SD — while the metrics become subExpression indicators that
   just compare against the threshold DE. This cuts generated objects from
   up to 20 to 6-7 per data element, removes the predictor ordering
   dependency (one independent predictor instead of a 1→4 chain), avoids
   the heavy inline-stats expressions (§5 performance hazard), keeps the
   threshold DE visible for dashboards, and makes the outlier method
   swappable in one place (mean+SD stays available as an alternative
   generator). It also removes the need for the **org unit level selector**
   in the Add-new flow — subExpressions always evaluate at the
   data-registration level, and the threshold predictor can default to the
   dataset's registration level with DESCENDANTS.
2. **Keep supporting existing predictor-based configs** (Configuration tab,
   deletion, threshold edit) — the dataStore entries would carry a
   version/type marker distinguishing old and new configs. Deletion of new
   configs is far simpler (indicators only; existing safety gates apply).
3. **Offer a migration action** ("convert to predictor-free") that creates
   the new indicators, verifies values match at country level for the last
   complete month, then removes the old predictors/DEs via the existing
   deletion flow. On 2.43 this doubles as the fix for the predictor
   regression.
4. **Document the two caveats** in the user manual: monthly-grain semantics
   (don't put these indicators in quarterly/yearly layouts) and the
   facility-pivot performance note for the outlier indicators.
5. **File the two 2.43 Jira issues** (predictor SELECTED regression; blank
   install dataOutputPeriodTypes). Until the predictor regression is fixed,
   2.43 deployments of the _current_ app need the DESCENDANTS workaround.

## 7b. Real-data validation (DHIS2 2.42.5.1 + Laos HMIS demo, 2026-07-17)

Full-scale side-by-side validation on a broker instance (`agent-dq42`,
http://localhost:9011, `local_admin`/`district`) seeded with the Laos HMIS
demo — the same database family as implement.im/dqtest, including the
original tool-generated DQ config and 2014-2025 data (~1,200 DPT reporters,
266 malaria reporters, 18 ANC reporters at facility level).

Setup: the seed's own legacy config (repaired to canonical template
expressions — the seed had drifted in 4 places: a hand-edited ANC outlier
count generator, and the three "any of last 12 months" predictors missing
`sum()`), fresh predictor runs for Jan-Dec 2025; alongside it the DQX stack
(1 threshold predictor + 1 threshold DE + 4 subExpression indicators per
data element) and DQXi (fully inline outlier indicators, no predictor).
Dashboard: **"DQ metrics: old (predictors) vs new (subExpressions)"**
(`/dhis-web-dashboard/#/DQXdash0001`).

Results across 12 months × (national + 18 provinces):

| Comparison                                                      | Result                                                                                                                                                                                                                                     |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Threshold predictor outputs (legacy vs DQX), raw values         | **21,250 / 21,250 exact (100%)** across all 3 DEs                                                                                                                                                                                          |
| ANC 1 — all four checks, legacy vs DQX (and vs inline)          | **100%** at national and province level                                                                                                                                                                                                    |
| Malaria — all four checks, legacy vs DQX                        | **100%** at national and province level                                                                                                                                                                                                    |
| DPT 3 — completeness and excluding-outliers                     | **100%**                                                                                                                                                                                                                                   |
| DPT 3 — consistency / outlier %                                 | numerators identical (725 = 725); denominators differ by **exactly the 47 district-registered reporting units** that level-4 predictors cannot see (1,282 vs 1,235). The new approach counts real data the legacy config silently ignores. |
| DQX (stored integer threshold) vs DQXi (inline float threshold) | differences are proven integer-rounding boundary flips (e.g. value 8 vs stored threshold 8 vs true threshold 7.70; 7 flips per ~97 facilities in the worst province-month). The inline math is strictly more accurate.                     |

Additional operational findings from the legacy side while setting this up:
the seed's baked-in predictor outputs included **internally impossible
values** (all-12 > any-12, consistency of 150%) because predictor re-runs
never re-examine facilities that currently have no source data — orphaned
predictions persist indefinitely. This class of stale-intermediate problem
cannot exist in the predictor-free design.

## 8. Reproducibility

Everything here is reproducible with the scripts in
[`subexpression-tests/`](subexpression-tests/): `fixture.py` builds the
metadata + seeded data (blank instance; if the dataSet import ever fails with a
transient `DataSet.periodType` error — seen once on 2.40.12, not reproducible
on 2.43 — a restart clears it), `run_predictors.py` +
`run_analytics.py` produce the reference values, `create_new_indicators.py`
creates the candidates, `check.py` asserts the country-level numbers,
`probe_exprs.py` probes parser acceptance, `perf_fixture.py` + the timing
snippets in the session produce the performance numbers. Fixture design:
5 facilities with hand-computable patterns (all-12 reporter with an outlier
month, 6-of-12 reporter, silent facility, window-only reporter, 11-of-12
reporter) + a separate 1000-facility root for load tests.
