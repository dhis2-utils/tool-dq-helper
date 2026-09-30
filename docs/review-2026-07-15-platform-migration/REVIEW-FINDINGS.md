# Review findings: DQ Metrics Configuration Tool v1.0.0 (App Platform migration)

Reviewed: 2026-07-15 · Scope: migration + code review + functional test + architecture assessment · Reviewer: agent (Claude Code)
DHIS2 versions tested: 2.41.9, 2.43.0.1 (Sierra Leone demo); 2.41, 2.43 (Lao HMIS demo, incl. 41→43 database migration path)

## Summary

The tool was migrated in this session from a vanilla-JS/webpack app to the DHIS2 App Platform (React 18, TypeScript, `@dhis2/ui`, `@dhis2/app-runtime`, TanStack Query). The dataStore format, generated metadata (names, descriptions, expressions), and group structure are byte-compatible with the old tool. Functional testing surfaced **three serious pre-existing bugs in the "also delete metadata" feature — including one where a supposed dry-run actually deletes metadata** — all fixed and re-verified live during the review. The app now passes the full lifecycle (initialise → configure → preview → import → edit → delete) on DHIS2 2.41 and 2.43, on both the Sierra Leone and Lao demo databases.

## Findings

Findings marked **[FIXED]** were resolved during this session and re-verified against live instances; code references point at the fix.

### HIGH

#### H1. [FIXED] "Also delete metadata" never deleted anything — ownership gate evaluated after group cleanup

- **Where**: `src/lib/deletion.ts:360` (fix; gate evaluation now precedes group removal)
- **What**: Pre-existing bug faithfully inherited from the original tool (`src/app.js` at git HEAD, lines ~1524–1594): the delete flow removed the generated objects from the app-managed groups _first_, then evaluated the ownership gate — which checks membership of those same groups. The gate therefore always failed with "not owned by app" and metadata deletion was silently skipped for every check, on every version. Reproduced live on 2.41.9 before the fix.
- **Fix**: Safety gates are evaluated before any group/dataStore cleanup. Verified: full metadata deletion now succeeds on 2.41 and 2.43.

#### H2. [FIXED] The "dry-run" reference check actually deletes metadata — DHIS2 ignores `dryRun=true` for DELETE imports

- **Where**: `src/lib/deletion.ts:298` (comment documenting the removal)
- **What**: The original tool's fourth safety gate posted `POST /api/metadata?importStrategy=DELETE&dryRun=true&atomicMode=NONE` for predictors and indicators. Verified live on DHIS2 2.41.9: the response reports `deleted: N` and the objects are **really deleted** (confirmed with an isolated scratch object: create → "dry-run" delete → 404). In the original tool this destructive behavior was masked by H1 (the gate never ran); once H1 was fixed, every "gated" delete silently deleted predictors/indicators while reporting failure, leaving orphaned data elements.
- **Fix**: The dry-run gate was removed. External references are instead caught by the real delete itself, which runs per object type with `atomicMode=ALL` in dependency order (indicators → predictors → data elements) and reports any failure. Consider filing the `dryRun` behavior as a DHIS2 core bug (reproduced on 2.41.9; the metadata importer's DELETE path does not consult the dryRun flag).

#### H3. [FIXED] Editing the outlier threshold made outlier metadata permanently undeletable

- **Where**: `src/lib/threshold.ts:127` and `src/lib/deletion.ts:243` (fix)
- **What**: The app's own Edit feature renames the generated metadata (names/descriptions/expressions embed the SD value), which bumps `lastUpdated`. The "modified after creation" gate (`lastUpdated − created < 5s`) then blocks deletion of the outlier metadata forever. Pre-existing design conflict, also masked by H1 in the original. Reproduced live on 2.43: after an Edit, delete reported "skipped (… modified after creation)".
- **Fix**: threshold edits now record `editedAt` in the dataStore config, and the edit-time gate accepts objects whose `lastUpdated` is within 60 s of a recorded app edit. Manual renames are still caught by the template-match gate. Verified: import → edit to 2.5 SD → delete-with-metadata removes everything, on 2.41 and 2.43.

#### H4. [FIXED] Port regression: outlier shortName truncation changed (34 vs 35 chars)

- **Where**: `src/lib/configure.ts:139` (fix: `truncatedOutlierShortName`)
- **What**: The original truncated outlier source shortNames >34 chars to **35** chars (`length > 34 ? substring(0, 35)`); the first port cut to 34. Generated shortNames would differ from old-tool output for long source names, breaking the pre-import conflict check against metadata created by earlier versions. Found by adversarial diff review of the port.
- **Fix**: original quirk preserved and documented in a named helper.

### MEDIUM

#### M1. [FIXED] Switching tabs discards form state and un-imported previews

- **Where**: `src/AppRoutes.tsx:30` (fix)
- **What**: Tabs were routes, so navigating to Configuration and back unmounted `ConfigurePage`, discarding the selected data set/element and any generated-but-not-imported preview (the old tool used CSS tab toggles and kept state).
- **Fix**: all three tabs stay mounted and are toggled with CSS (hash routes and deep links preserved; the Configuration tab's data fetch is deferred until first opened). Verified live on 2.43: a generated preview and all form selections survive a round-trip through the Instructions tab.

#### M2. [FIXED] Conflict check breaks for metadata names containing commas (pre-existing)

- **Where**: `src/lib/configure.ts:271` (fix: `findExistingValues`)
- **What**: DHIS2 `in:[…]` filters split on commas, so a source data element whose name contained a comma made the pre-import conflict check query for the wrong names (silently missing conflicts). Same behavior in the original tool.
- **Fix**: values containing a comma are now checked with individual `eq:` filters; comma-free values still use a single `in:[…]` query.

#### M3. Group membership updates are read-modify-write without concurrency protection (pre-existing)

- **Where**: `src/lib/importer.ts:31` (`addToGroup`/`removeFromGroup`)
- **What**: Group updates GET `fields=:owner`, mutate the member array, and PUT the whole group. Two admins importing/removing concurrently can silently drop each other's membership changes. Pre-existing design; low likelihood in practice (single-admin tool) but worth knowing.
- **Fix suggestion**: DHIS2 ≥2.41 supports collection endpoints (`POST/DELETE /api/<groups>/<id>/<members>/<memberId>` and `POST …/gist`?) — using per-member add/remove endpoints removes the race.

### LOW

#### L1. [FIXED] User manual screenshots show the old UI — all 13 referenced screenshots regenerated from the new app on DHIS2 2.43 (Sierra Leone demo, 1280×800); 6 unreferenced old-UI images deleted; manual text updated where it described old-UI mechanics (filterable selects, post-import behaviour, notification wording, testing appendix).

#### L2. [FIXED] Metadata labels not translatable — `src/lib/labels.ts` label maps are now built lazily via functions with `i18n.t()` literals, so they pick up the active locale and are extracted into `i18n/en.pot`.

#### L3. [FIXED] Main bundle chunk >500 kB minified — vendor code is now split via `manualChunks` in `viteConfigExtensions.mts` (largest chunk 303 kB; warning gone). Note: all `@dhis2` packages must stay in ONE chunk — splitting `@dhis2/ui` from `@dhis2/app-runtime` breaks module initialisation order at runtime ("Cannot access X before initialization"; observed live, documented in the config).

#### L4. [FIXED] Repo housekeeping — planning docs and the design-direction page moved to `docs/archive/` (preserving an uncommitted edit to the round-2 plan), `.DS_Store` files and the `.superpowers/` scratch dir deleted, `.gitignore` covers generated dirs (`.d2`, `src/locales`, `.pnpm-store`).

## Claims investigated and rejected

- **Claim**: after H1 was fixed, delete still failed — first hypothesis was that the app-runtime data engine drops query params (`importStrategy=DELETE`) on mutations, turning deletes into plain imports.
- **Source**: own debugging hypothesis during functional testing on 2.41.9.
- **Refuted by**: network capture of the app's requests (params present in the URL: `POST /api/41/metadata?importStrategy=DELETE&atomicMode=ALL`) plus engine source (`@dhis2/app-service-data` `queryToResourcePath.js` includes `params` for mutations). The real cause was H2 — the earlier "dry-run" had already deleted the objects, so the real delete got E5001 "no matching object".

## Architecture assessment

**The App Platform is the right architecture for this tool, and the migration is complete.** The old vanilla stack had a hand-rolled fetch wrapper, hand-built HTML strings (XSS-prone `innerHTML` with metadata names), a legacy header-bar hack for <2.42, and no i18n. The platform build brings: `@dhis2/ui` look-and-feel, the global-shell integration on 2.42+ (verified working), the app-runtime engine (auth, API versioning, typed errors), React rendering (the XSS surface is gone — verified no `innerHTML`/`dangerouslySetInnerHTML` remain), and an installable zip with correct manifests for 2.41–2.43.

Structure: framework-free domain logic in `src/lib/` (templates, configure, import, delete, threshold, overview, initialise) with React/query hooks and pages on top. The domain code is deliberately port-faithful — templates are byte-identical to the old tool and the dataStore format is unchanged, so existing installations keep working (verified: the `predictorGroupTreshold` typo migration also ported).

Costs already paid: ~2,300 lines of vanilla JS rewritten as ~2,600 lines of TypeScript/TSX. M1, M2 and L1–L4 were fixed in a follow-up pass (verified live on a fresh 2.43 instance); the only remaining open finding is M3 (group-update concurrency, pre-existing, low likelihood).

## Environment gaps

- DHIS2 2.42 was not separately tested (no blocking reason — 2.41 and 2.43 bracket it and 2.43 exercises the 2.42+ global-shell path; a v42 Sierra Leone seed exists if desired).
- The Lao HMIS demo has no v43 seed; the 43 test ran the v41 database Flyway-migrated on boot — which doubles as a test of the upgrade path.
- Laos testing used the smoke suite (`tests/e2e/lifecycle.sh`), not the exhaustive per-gate scenarios run on Sierra Leone 2.41.
