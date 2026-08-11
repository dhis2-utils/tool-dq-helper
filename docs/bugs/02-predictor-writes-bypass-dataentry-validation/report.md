# Predictor output values cannot be edited or deleted through the data value APIs (E8003/E8022 asymmetry)

**Component:** [Backend] Data value / data entry validation, Predictor
**Affects versions:** 2.43.1 (verified on play). New behaviour in the 2.43 data-entry
validation; ≤2.42 accepts these writes/deletes.
**Verified on:** https://play.im.dhis2.org/stable-2-43-1 (2.43.1, rev 9cbfbf3), Sierra Leone demo, 2026-07-17.

Since 2.43, writing a data value requires the data element to belong to a data set
(`E8003`) that is explicitly assigned to the target org unit (`E8022`). **Predictors,
however, bypass this validation when writing** — creating values that no data value API
can subsequently update or delete. Predictor output data elements are typically not in
any data set (they hold computed values, not entered ones — this has been standard
practice, e.g. in the WHO data quality metadata configurations).

## Steps to Reproduce

1. Log in to https://play.im.dhis2.org/stable-2-43-1 as `admin`/`district`.
2. Import the attached [`metadata.json`](metadata.json) (same file as bug 01: two
   output data elements *not in any data set*, two predictors):

   ```
   curl -u admin:district -X POST -H "Content-Type: application/json" \
     "https://play.im.dhis2.org/stable-2-43-1/api/metadata?importStrategy=CREATE_AND_UPDATE&atomicMode=ALL" \
     -d @metadata.json
   ```
3. Run the DESCENDANTS predictor for a month with ANC data:

   ```
   curl -u admin:district -X POST \
     "https://play.im.dhis2.org/stable-2-43-1/api/predictors/zzDQbugPD02/run?startDate=2026-06-01&endDate=2026-07-01"
   ```
   → `"Generated 1024 predictions"` — the predictor **successfully writes** 1,024
   values for data element `zzDQbugDE02`, which belongs to no data set.
4. Try to delete (or update) one of those predictor-written values
   (`DiszpKrYNg8` = Ngelehun CHC, or any facility returned by
   `GET /api/dataValueSets?dataElement=zzDQbugDE02&orgUnit=ImspTQPwCqd&children=true&period=202606`):

   ```
   curl -u admin:district -X DELETE \
     "https://play.im.dhis2.org/stable-2-43-1/api/dataValues?de=zzDQbugDE02&pe=202606&ou=DiszpKrYNg8&co=HllvX50cXC0"
   ```

## Actual Result

```
409 Conflict
"Data set detection failed, found no set for data element(s): `[zzDQbugDE02]`" (E8003)
```

The same applies to updating the value via `POST /api/dataValues` and to
`POST /api/dataValueSets` imports (including imports with `"deleted": true`). The
predictor-generated values are effectively **immutable and undeletable** through the API.

Two further observations while reproducing:

- Adding the data element to a data set assigned **only to the root org unit** is not
  enough: writes/deletes at facilities then fail with
  `"Data set ... not usable with org unit(s)" (E8022)`. The data set must be assigned
  to every org unit that holds values.
- Even after deleting all values (soft delete), the soft-deleted rows still block
  `DELETE /api/dataElements/{uid}`, and deleting the value again is impossible once the
  data set is removed — a circular dependency that makes cleanup of such data elements
  effectively impossible through the API.

## Expected Result

Consistency between write paths, in either direction:

- If data set membership/assignment is required for data values, predictor (and other
  server-side) writes should be subject to the same rule — or, preferably,
- values that legitimately exist (written by predictors) must remain manageable through
  the data value APIs: computed/output data elements should be exempt from data set
  detection, as they were in ≤2.42.

Additionally, existing installations upgrading to 2.43 with predictor output data
elements outside data sets (the common case) should not lose the ability to manage
their historical predictor data.

## Cleanup after reproducing

Create a temporary Monthly data set containing `zzDQbugDE02` assigned to the facilities
with values, delete the values via import with `"deleted": true`, then delete the
predictors, data set and data elements. (Play resets periodically, which also removes
the test objects.)
