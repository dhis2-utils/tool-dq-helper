# Changelog

All notable changes to this project will be documented in this file.

## 1.0.0 — 2026-08-17

### Changed

- **Migrated to the DHIS2 App Platform** (React 18, TypeScript, `@dhis2/ui`, `@dhis2/app-runtime`, TanStack Query). Replaces the vanilla-JS/webpack build. The dataStore format and metadata groups are unchanged and fully compatible with configurations created by earlier versions.
- **New configurations use hybrid subExpression templates.** Per configured
  data element the tool now generates one outlier-threshold predictor + data
  element and four `subExpression()` indicators — 6 objects instead of up
  to 20. Consistency and completeness are computed at analytics query time
  (no scheduled job, no stale intermediate values); only the outlier
  threshold still needs a predictor job, now a single predictor with no
  ordering constraints. Requires DHIS2 2.40.2+. Configurations created by
  the pre-platform tool keep working and remain viewable, editable and
  removable. See `docs/hybrid-templates.md`.
- **New "outlier values" indicator**, replacing the outlier-values data
  element the pre-platform tool maintained with a predictor: it reports the
  reported value itself whenever it exceeds the threshold and is blank
  otherwise, so a facility × month pivot lists only the outlying values,
  and it aggregates to their sum. It uses a factor-1 indicator type (the
  configuration now requires the instance to have one), so the values are
  reported as-is rather than ×100.
- **New default outlier method: modified Z-score** (`median + k·MAD/0.6745`,
  default k = 3.5, range 2.5–5.0). Mean + k·SD remains available
  (default 3.0, range 2.0–4.0).
- One consistent null rule for the generated metrics: blank when the
  metric's inputs are missing, 0 only when computed and genuinely zero.
  Fixes the first reported month always showing as 100% outliers, and
  facilities without 12 months of history dragging aggregated consistency
  to 0%.
- Requires DHIS2 2.41 or later; tested on 2.41–2.43 (including the 2.42+ global shell).
- Build with `pnpm run build`; the installable zip is written to `build/bundle/`.
- User manual rewritten for the new UI and templates, with screenshots
  captured on DHIS2 2.43.1.

### Fixed

- **"Also delete the generated DHIS2 metadata" now works.** Previously the ownership safety check ran after the app had already removed the objects from its own groups, so deletion was always skipped.
- **Removed a destructive "dry-run" safety check.** DHIS2 ignores `dryRun=true` for DELETE metadata imports and deletes the objects for real (verified on 2.41.9). External references are now caught by the real, per-type atomic delete instead.
- **Outlier metadata can be deleted after editing the threshold.** App edits are recorded in the dataStore and no longer trip the "modified after creation" safety check.
- Form selects now surface loading errors instead of showing an empty list.
- Switching tabs no longer discards the form or an un-imported preview.
- The pre-import conflict check now also works for metadata names containing commas.
- Names containing `<`, `&` etc. are no longer HTML-escaped in dialogs and notifications.
- Deleting metadata after an in-app threshold edit now works in every timezone: the edit timestamp is taken from the DHIS2 server rather than the browser clock (DHIS2 returns zone-less dates, so client timestamps skewed the safety check by the timezone offset).

### Added

- i18n support (all UI strings translatable via the standard platform workflow).
- End-to-end test suite at `tests/e2e/lifecycle.sh` (parameterized by instance URL; frame-aware for 2.42+).
- Unit tests for the domain logic (`pnpm test`, Jest): template substitution and truncation quirks, conflict detection (incl. comma names), import step sequencing and group splitting, all deletion safety gates (incl. the app-edit timezone case), and threshold editing.
