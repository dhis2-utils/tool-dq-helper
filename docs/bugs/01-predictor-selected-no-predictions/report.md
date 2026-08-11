# Predictors with organisationUnitDescendants = SELECTED generate 0 predictions

**Component:** [Backend] Predictor
**Affects versions:** 2.43.0, 2.43.0.1, 2.43.1 (verified). Works correctly on 2.40.12, 2.41.9, 2.42.5.1 (verified).
**Verified on:** https://play.im.dhis2.org/stable-2-43-1 (2.43.1, rev 9cbfbf3), Sierra Leone demo, 2026-07-17.

## Steps to Reproduce

1. Log in to https://play.im.dhis2.org/stable-2-43-1 as `admin`/`district`.
2. Import the attached [`metadata.json`](metadata.json):

   ```
   curl -u admin:district -X POST -H "Content-Type: application/json" \
     "https://play.im.dhis2.org/stable-2-43-1/api/metadata?importStrategy=CREATE_AND_UPDATE&atomicMode=ALL" \
     -d @metadata.json
   ```

   This creates two output data elements and two predictors that are **identical in every
   way** (generator `if(isNotNull(#{fbfJHSPpUQD}),1,0)` on "ANC 1st visit", Monthly,
   org unit level Facility) **except** `organisationUnitDescendants`: one `SELECTED`,
   one `DESCENDANTS`.

   Note on org units: predictors have no explicit org unit selection — they run over
   the org units of the **user running them**, restricted to the configured
   `organisationUnitLevels`. Here: `admin` (org unit = Sierra Leone national root,
   `ImspTQPwCqd`) × level 4 = all facilities. Reproducing requires running as a user
   whose org unit is **above** the predictor's level (the normal case — e.g. a
   national-level admin or the scheduler); a user assigned directly to a facility
   would not trigger the bug, since the level filter and the user-org-unit filter
   would then agree (see suspected cause below).
3. Run both predictors for a month that has ANC data (June 2026 at the time of testing):

   ```
   curl -u admin:district -X POST \
     "https://play.im.dhis2.org/stable-2-43-1/api/predictors/zzDQbugPD01/run?startDate=2026-06-01&endDate=2026-07-01"
   curl -u admin:district -X POST \
     "https://play.im.dhis2.org/stable-2-43-1/api/predictors/zzDQbugPD02/run?startDate=2026-06-01&endDate=2026-07-01"
   ```

## Actual Result

```
zzDQbugPD01 (SELECTED):    "Generated 0 predictions"
zzDQbugPD02 (DESCENDANTS): "Generated 1024 predictions"
```

The SELECTED predictor silently produces nothing — HTTP 200, no error, no warning.
The same SELECTED predictor definition generates ~1,024 predictions on 2.40/2.41/2.42.
The scheduled PREDICTOR job likewise reports COMPLETED while producing no output
(observed in a production-style 2.43.0.1 instance whose nightly predictor job has been
silently dead since its upgrade).

## Expected Result

Both predictors should generate ~1,024 predictions (one per facility reporting
ANC 1st visit in June 2026). `SELECTED` vs `DESCENDANTS` should only control whether
data registered *below* the selected level is aggregated up — for data registered at
facility level and a facility-level predictor they are equivalent.

## Why this is not the documented SELECTED behaviour

The documented semantics of `organisationUnitDescendants`
([DHIS2-9833](https://dhis2.atlassian.net/browse/DHIS2-9833),
[community discussion](https://community.dhis2.org/t/dhis2-predictor/53583/17)) are
about **which levels provide data**: SELECTED legitimately yields 0 predictions when
data is registered *below* the predictor's selected level (e.g. district-level
predictor, facility-level data). This report is a different situation, verified on the
play instance:

- All 1,024 ANC 1st visit data registrations for June 2026 are at **level 4
  (Facility)** — exactly the predictor's selected level. SELECTED should find them.
- The Sierra Leone hierarchy has **no org units below level 4** (verified:
  `filter=level:gt:4` → 0). With no descendants in existence, SELECTED and
  DESCENDANTS are definitionally equivalent at level 4 — yet they return 0 and
  1,024 respectively.
- The identical SELECTED configuration generates correctly on 2.40.12, 2.41.9 and
  2.42.5.1 (verified) — i.e. those versions implement the documented semantics;
  2.43 deviates from them.

Note also that SELECTED is the **default** in the Maintenance app
([DHIS2-12150](https://dhis2.atlassian.net/browse/DHIS2-12150)), so the broken case is
the default configuration.

## Suspected cause (from reading dhis2-core)

2.43 refactored `PredictionDataValueFetcher` from `DataExportParams` (which always set
`ouMode = DESCENDANTS` for scoping the fetch to the user's org units) to
`DeflatedDataValueParams`. In `HibernateDataValueStore.getDdvOrgUnits`, a SELECTED
predictor now renders

```sql
ou.hierarchylevel = <predictor level>  AND  dv.sourceid IN (<current user's root org units>)
```

— mutually exclusive conditions whenever the running user's org unit is above the
predictor's level (i.e. essentially always), so the data fetch returns zero rows. The
predictor's descendants flag now controls user-org-unit scoping in addition to data
roll-up. Unfixed on the `2.43` branch and `master` as of 2026-07-17.

## Impact

Any configuration using SELECTED predictors (e.g. the WHO/DHIS2 data quality metadata
approach, where 6 of 7 generated predictors use SELECTED) silently stops producing data
on upgrade to 2.43. Because the job status is COMPLETED, nothing alerts administrators.

**Workaround:** set `organisationUnitDescendants` to `DESCENDANTS` (equivalent when the
predictor level is the data-registration level).

## Cleanup after reproducing

Delete `zzDQbugPD01`, `zzDQbugPD02` (predictors), then the data values written by
`zzDQbugPD02` and the two `zzDQbug` data elements. Note: deleting the values requires
first adding the data element to a data set assigned to the facilities — see bug 02.
