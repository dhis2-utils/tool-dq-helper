# DQ Config App — Round 2 Fixes Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix regressions in delete/edit, clean up DE dropdown labels, warn on missing referenced indicators, add optional metadata cleanup with safety checks, and make large dropdowns searchable.

**Architecture:** All changes inline in existing `src/app.js` / `src/index.html` / `src/css/style.css`. Add `tom-select` (MIT, ~45KB) for searchable selects. No new source files.

**Tech Stack:** Vanilla JS + ES modules, Webpack 5, DHIS2 Web API, Tom Select (new dep).

---

## File Structure

| File                | Role / Change                                                          |
| ------------------- | ---------------------------------------------------------------------- |
| `src/app.js`        | All logic changes (6 tasks)                                            |
| `src/index.html`    | No structural change; Tom Select binds to existing `<select>` elements |
| `src/css/style.css` | Tom Select theme overrides to match DHIS2 design                       |
| `package.json`      | Add `tom-select` dependency                                            |

---

## Task 1: Fix delete — remove bare-ID split for outlier/consistency lookups

**Files:**

- Modify: `src/app.js` `deleteConfig()` around line 957–1044

**Context:** Outlier/consistency entries are keyed in dataStore by the `§DE_SOURCE§.id` which is the bare DE ID _or_ the operand ID (`deId.cocId`) depending on what the user configured. The current code does `baseId = deId.split(".")[0]` which breaks the lookup when a card was configured against an operand — the filter at line 1035-1037 matches nothing, so the PUT writes the same list back and the card remains.

Only completeness should use the bare-ID match (it's stored under whatever operand was the proxy, but cards are normalized to bare in `listConfig`).

- [ ] **Step 1:** Read the current `deleteConfig` function.

- [ ] **Step 2:** In the outliers block (lines 959-994), replace `Object.keys(item)[0] === baseId` with `Object.keys(item)[0] === deId`. Leave all inner field extraction unchanged.

- [ ] **Step 3:** Same change in the consistency block (lines 996-1016).

- [ ] **Step 4:** In the completeness block (lines 1018-1032), leave the existing dual-match (`key === baseId || key.split(".")[0] === baseId`) intact — it is correct for completeness. But rename the local: since `deId` may be operand, the match intent is "base matches base":

    ```javascript
    const deIdBase = deId.split('.')[0]
    const completenessEntry = completeness.find(function (item) {
        const key = Object.keys(item)[0]
        return key === deId || key.split('.')[0] === deIdBase
    })
    ```

- [ ] **Step 5:** Update the three filter blocks at lines 1034-1044:

    ```javascript
    const newOutliers = outliers.filter(function (item) {
        return Object.keys(item)[0] !== deId
    })
    const newConsistency = consistency.filter(function (item) {
        return Object.keys(item)[0] !== deId
    })
    const newCompleteness = completeness.filter(function (item) {
        const key = Object.keys(item)[0]
        return !(key === deId || key.split('.')[0] === deIdBase)
    })
    ```

- [ ] **Step 6:** Keep `baseConfig.dataElementGroup`, `indicatorGroup`, `predictorGroup*` calls as-is — they operate on metadata UIDs collected from the config, not on `deId`.

- [ ] **Step 7:** Manual smoke test via `yarn start`: configure outlier for an operand, delete it, confirm card disappears. Then configure outlier for a bare DE, delete it, same check.

- [ ] **Step 8:** Lint: `yarn run lint`. Commit.

---

## Task 2: Fix edit outlier threshold — same root cause

**Files:**

- Modify: `src/app.js` `editOutlierThreshold()` around line 1046-1175

**Context:** Same bug: lookup uses `baseId = deId.split(".")[0]` but outlier entries may be keyed by operand ID.

- [ ] **Step 1:** In `editOutlierThreshold(deId, cardElement)`, replace:

    ```javascript
    const baseId = deId.split('.')[0]
    const entryIndex = outliers.findIndex(function (item) {
        return Object.keys(item)[0] === baseId
    })
    ```

    with:

    ```javascript
    const entryIndex = outliers.findIndex(function (item) {
        return Object.keys(item)[0] === deId
    })
    ```

- [ ] **Step 2:** Change `outliers[entryIndex][baseId]` → `outliers[entryIndex][deId]` (one line below).

- [ ] **Step 3:** Confirm nothing else in the function references `baseId`; if the variable is now unused, delete its declaration.

- [ ] **Step 4:** Manual smoke test: configure outlier for an operand, click Edit, change SD, save, confirm card updates. Same for bare DE.

- [ ] **Step 5:** Lint. Commit.

---

## Task 3: Drop "(default)" / "(CoC)" suffix from DE dropdown labels

**Files:**

- Modify: `src/app.js` `updateDataElements()` around line 1304-1314

**Context:** The next-level disaggregation select makes the CoC explicit, so showing it in the DE label is redundant.

- [ ] **Step 1:** In the data element options map, replace:

    ```javascript
    const isDefault = meta.catComboName.toLowerCase() === "default";
    const suffix = isDefault ? " (default)" : " (" + meta.catComboName + ")";
    ...
    return "<option value='" + de.id + "'" +
        (isDisabled ? " disabled" : "") + ">" + escapeHtml(de.name + suffix) + "</option>";
    ```

    with:

    ```javascript
    return (
        "<option value='" +
        de.id +
        "'" +
        (isDisabled ? ' disabled' : '') +
        '>' +
        escapeHtml(de.name) +
        '</option>'
    )
    ```

- [ ] **Step 2:** Lint. Commit.

---

## Task 4: Warn when referenced metadata (DE, predictor, or indicator) no longer exists

**Files:**

- Modify: `src/app.js` `listConfig()` around line 710–920
- Modify: `src/css/style.css` — add `.dhis2-chip-warning`

**Context:** Configs reference generated data elements, predictors, and indicators by UID. If any have been deleted in DHIS2 outside this app, the config is dangling. Surface this on the config cards so the user knows which configs need cleanup. Check all three types, not just indicators.

- [ ] **Step 1:** In `listConfig()`, after `addToMap` calls and before building HTML, collect referenced IDs from every config, grouped by metadata type. Use the existing `*_METADATA_LABELS` maps (they already encode the type per placeholder key — first element of each tuple):

    ```javascript
    const referencedByType = {
        dataElement: new Set(),
        predictor: new Set(),
        indicator: new Set(),
    }
    const allLabelMaps = [
        OUTLIER_METADATA_LABELS,
        CONSISTENCY_METADATA_LABELS,
        COMPLETENESS_METADATA_LABELS,
    ]
    configuredElements.forEach(function (entry) {
        Object.values(entry.configs).forEach(function (cfg) {
            allLabelMaps.forEach(function (labelMap) {
                Object.keys(labelMap).forEach(function (placeholder) {
                    const type = labelMap[placeholder][0] // "dataElement" | "predictor" | "indicator"
                    const id = cfg[placeholder]
                    if (id && referencedByType[type])
                        referencedByType[type].add(id)
                })
            })
        })
    })
    ```

    Note: if `COMPLETENESS_METADATA_LABELS` is missing entries for `§DE_COMPL_ANY§` / `§PD_COMPL_ANY§`, extend that map during this task so they are covered here and in task 6.

- [ ] **Step 2:** Batch-query each type:

    ```javascript
    const endpointByType = {
        dataElement: 'dataElements',
        predictor: 'predictors',
        indicator: 'indicators',
    }
    const existingByType = {
        dataElement: new Set(),
        predictor: new Set(),
        indicator: new Set(),
    }
    for (const type of Object.keys(referencedByType)) {
        const ids = Array.from(referencedByType[type])
        if (ids.length === 0) continue
        const endpoint = endpointByType[type]
        const result = await d2Get(
            '/api/' +
                endpoint +
                '?filter=id:in:[' +
                ids.join(',') +
                ']&fields=id&paging=false'
        )
        existingByType[type] = new Set(
            (result[endpoint] || []).map(function (o) {
                return o.id
            })
        )
    }
    ```

- [ ] **Step 3:** Per entry, compute `missing = [{type, id, label}, ...]` by walking the same placeholder keys and checking each referenced ID against `existingByType`. If any are missing, render a warning chip with the count, and list the missing items (type + label from the label map) in the chip's `title` attribute:

    ```javascript
    const missingChip =
        missing.length > 0
            ? '<span class="dhis2-chip dhis2-chip-warning" title="' +
              escapeHtml(
                  missing
                      .map(function (m) {
                          return m.type + ': ' + m.label + ' (' + m.id + ')'
                      })
                      .join('\n')
              ) +
              '">⚠ ' +
              missing.length +
              ' missing metadata</span>'
            : ''
    ```

    Render next to the status chips in the card header.

- [ ] **Step 4:** Add CSS class `.dhis2-chip-warning` in `src/css/style.css` (section "14. Status Chips"):

    ```css
    .dhis2-chip-warning {
        background: var(--dhis2-warning-bg);
        color: var(--dhis2-warning);
    }
    ```

- [ ] **Step 5:** Smoke tests:
    - Delete an indicator via the DHIS2 UI, reload the Configuration tab, confirm the card shows `⚠ 1 missing metadata` with the indicator's label in the tooltip.
    - Same with a predictor and with a data element (try one of each).

- [ ] **Step 6:** Lint, build, commit.

---

## Task 5: Add Tom Select for searchable dropdowns

**Files:**

- Modify: `package.json` (add dep)
- Modify: `src/app.js` — initialize Tom Select on the three selects; re-init on option refresh
- Modify: `src/css/style.css` — import Tom Select CSS or custom override
- Maybe: `src/index.html` — already has the selects; no change needed

**Context:** With 100+ data sets and 1000+ data elements, native selects are unusable. Tom Select gives a single-select combobox with type-to-filter, no jQuery, plain ES module.

- [ ] **Step 1:** `cd /tool-dq-config && yarn add tom-select`. Confirm it resolves without conflict.

- [ ] **Step 2:** In `src/app.js`, add import at top:

    ```javascript
    import TomSelect from 'tom-select/dist/js/tom-select.complete.min.js'
    import 'tom-select/dist/css/tom-select.css'
    ```

- [ ] **Step 3:** Add module state:

    ```javascript
    const tomSelectInstances = {}
    function initOrRefreshTomSelect(id) {
        const el = document.getElementById(id)
        if (tomSelectInstances[id]) {
            // Refresh options from the native <select>
            tomSelectInstances[id].sync()
            return
        }
        tomSelectInstances[id] = new TomSelect(el, {
            create: false,
            allowEmptyOption: true,
            maxOptions: null,
            sortField: null, // preserve DOM order (already sorted upstream)
        })
    }
    ```

- [ ] **Step 4:** After each `el("selectX").innerHTML = ...` in `prepInputs`, `updateDataElements`, `updateDisaggregation`, `makeSelectOuLevel`, call `initOrRefreshTomSelect(...)` for the affected select.

- [ ] **Step 5:** Selects to init: `selectDataSet`, `selectDataElement`, `selectDisaggregation`, `selectOuLevel`. Leave `selectDataElementOperand` on the native select (it's short — CoCs of one DE — and inside a hidden section where Tom Select re-render is awkward).

- [ ] **Step 6:** In `src/css/style.css`, add overrides so Tom Select matches DHIS2 look:

    ```css
    .ts-control {
        border: 1px solid #a0adba !important;
        border-radius: var(--dhis2-radius) !important;
        padding: 4px 8px !important;
        font-family: inherit !important;
        font-size: 14px !important;
        min-height: 38px;
    }
    .ts-wrapper.focus .ts-control {
        border-color: var(--dhis2-primary) !important;
        box-shadow: 0 0 0 3px rgba(21, 101, 192, 0.1) !important;
    }
    .ts-dropdown {
        font-family: inherit;
        font-size: 14px;
        border: 1px solid var(--dhis2-border);
    }
    .ts-dropdown .active {
        background: var(--dhis2-primary-light);
        color: var(--dhis2-primary-dark);
    }
    ```

- [ ] **Step 7:** Verify webpack build handles the CSS import (existing CSS loader rules should cover it).

- [ ] **Step 8:** Smoke test: open the app, type in each dropdown, confirm filtering works and selection updates the underlying form state the same way (change events should still fire).

- [ ] **Step 9:** Lint, build, commit.

---

## Task 6: Optional "also delete metadata" on config removal

**Files:**

- Modify: `src/index.html` — add checkbox inside delete modal
- Modify: `src/app.js` `deleteConfig()` — gated metadata-delete branch after the dataStore filter

**Context:** When user confirms deletion, offer to also delete the generated DHIS2 metadata (data elements, predictors, indicators). Only delete items that pass **all** of these checks:

1. **Ownership:** item is a member of one of the app-managed groups (`baseConfig.dataElementGroup`, `indicatorGroup`, `predictorGroup`, `predictorGroupThreshold`, `predictorGroupAnalysis`, `predictorGroupConsistency`).
2. **No manual edits (template structure):** current `name` in DHIS2 matches the template's name pattern for that placeholder — same prefix and suffix around the `§...§` substitution points. Same check for `description`. See the **Template matching strategy** below.
3. **No manual edits (timing):** `Date(lastUpdated) - Date(created) < 5000` ms — i.e., created and last edited in the same import transaction.
4. **Not referenced elsewhere:** dry-run `POST /api/metadata?importStrategy=DELETE&dryRun=true` with the check's candidate items reports no conflicts for any of them.

**Atomicity rule (per check):** Each check type (outliers, consistency, completeness) is treated as an atomic group. If **any** metadata item of a check fails **any** safety check, the app deletes **none** of that check's metadata. The user is told which item(s) caused the skip and why. Other checks for the same config are evaluated independently — if consistency passes cleanly but outliers has one edited predictor, consistency metadata is deleted and outliers metadata is left intact.

### Template matching strategy

For each item, we know its placeholder key (e.g. `§IN_NOUTLIER_PROP§`). The templates in `src/js/templates.js` contain entries keyed by that same placeholder (via each entry's `"id"` field). Build a map at runtime:

```javascript
// One-time at module init (or lazily the first time task 6 runs)
import {
    templateOutlier,
    templateConsistency,
    templateCompleteness,
    templateCompletenessDisaggregated,
} from './js/templates.js'

function collectTemplateEntries() {
    const map = {} // placeholderKey -> { name, description, shortName, kind }
    const bundles = [
        templateOutlier(),
        templateConsistency(),
        templateCompleteness(),
        templateCompletenessDisaggregated(),
    ]
    for (const bundle of bundles) {
        for (const kind of ['dataElements', 'predictors', 'indicators']) {
            for (const entry of bundle[kind] || []) {
                if (entry.id && entry.id.startsWith('\u00a7')) {
                    map[entry.id] = {
                        name: entry.name,
                        description: entry.description,
                        shortName: entry.shortName,
                        kind: kind.slice(0, -1), // "dataElement" | "predictor" | "indicator"
                    }
                }
            }
        }
    }
    return map
}
```

Convert each template string into a regex by escaping regex-special characters, then replacing every `§...§` placeholder with `.*?`, and anchoring `^…$`:

```javascript
function templateToRegex(templateStr) {
    // Escape regex specials, then replace §XXX§ (now as \u00a7...\u00a7 in the escaped string) with .*?
    const escaped = templateStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const withWildcards = escaped.replace(/\\u00a7[^\u00a7]*\\u00a7/g, '.*?') // note: the escaped string contains literal \u00a7 patterns? simpler: do this before escaping
    return new RegExp('^' + withWildcards + '$')
}
```

A cleaner implementation does the wildcard substitution _before_ the regex-escape by splitting on `§...§` boundaries, then joins escaped segments with `.*?`:

```javascript
function templateToRegex(templateStr) {
    const parts = templateStr.split(/\u00a7[^\u00a7]*\u00a7/)
    const pattern = parts
        .map(function (p) {
            return p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        })
        .join('.*?')
    return new RegExp('^' + pattern + '$')
}
```

Check: the DHIS2 item's current `name` must match the regex; same for `description`. `shortName` is skipped — DHIS2 truncates to 50 chars silently and DQ shortNames use ad-hoc abbreviations that won't round-trip cleanly.

A mismatch on either means manual edit → skip the item in the delete pass.

- [ ] **Step 1:** Update `src/index.html` delete modal body to include the checkbox:

    ```html
    <div class="modal-body">
        <p id="deleteModalMessage"></p>
        <p style="font-size: 13px; color: var(--dhis2-text-secondary);">
            The DHIS2 metadata (data elements, predictors, indicators) will not
            be deleted by default.
        </p>
        <label
            style="display: flex; align-items: center; gap: 8px; margin-top: 8px;"
        >
            <input type="checkbox" id="deleteMetadataCheckbox" />
            <span
                >Also delete the generated DHIS2 metadata (only if unreferenced,
                unmodified, and owned by this app)</span
            >
        </label>
    </div>
    ```

- [ ] **Step 2:** Reset checkbox when opening modal (at top of `deleteConfig`):

    ```javascript
    el('deleteMetadataCheckbox').checked = false
    ```

- [ ] **Step 3:** In `onConfirm` flow, after the existing dataStore PUTs succeed and before `await listConfig()`, read the checkbox:

    ```javascript
    const alsoDeleteMetadata = el('deleteMetadataCheckbox').checked
    ```

- [ ] **Step 4:** If `alsoDeleteMetadata` is true, build one `candidateSet` per check type that applies (outliers, consistency, completeness). Each candidate is `{id, placeholderKey, kind}` where `kind` is `"dataElement"`, `"predictor"`, or `"indicator"` (derived from placeholder prefix `DE_` / `PD_` / `IN_`, confirmed via `collectTemplateEntries()`).

- [ ] **Step 5:** Add helper `async function evaluateCheckForDeletion(candidates, baseConfig, ownedIds, templateMap)` that evaluates a **single check's** candidates and returns `{ ok: boolean, failures: [{id, kind, reason}, ...] }`. Steps:
    1. **Ownership:** for each candidate, fail if its id isn't in `ownedIds[kind]`. Reason: `"not owned by app"`.
    2. **Edit-time:** batch-fetch all candidates grouped by kind with `fields=id,name,description,created,lastUpdated&filter=id:in:[...]&paging=false`. Fail any where `Date(lastUpdated).getTime() - Date(created).getTime() >= 5000`. Reason: `"modified after creation"`. Also fail any id that didn't come back in the fetch (already deleted out-of-band) — reason: `"no longer exists"`.
    3. **Template:** for each fetched item, look up `templateMap[placeholderKey]`; build regexes from `template.name` and `template.description` via `templateToRegex` and test the current `name` and `description`. Both must match. Reason on fail: `"name/description no longer matches template"`.
    4. **Dry-run:** build payload `{ "dataElements": [...], "predictors": [...], "indicators": [...] }` containing only `{ id }` entries for **all** candidates in this check (not just survivors — the dry-run needs to evaluate the real delete set). `POST /api/metadata?importStrategy=DELETE&dryRun=true&atomicMode=NONE`. Walk `typeReports[].objectReports[]`; fail any candidate whose report has non-empty `errorReports`. Reason: `"referenced elsewhere (dry-run conflict)"`.
    5. Return `ok = (failures.length === 0)`.

- [ ] **Step 6:** Orchestrate per-check evaluation:

    ```javascript
    // One-time precomputation (shared across checks):
    const ownedIds = await fetchOwnedIds(baseConfig) // { dataElement: Set, predictor: Set, indicator: Set }
    const templateMap = collectTemplateEntries()
    const perCheckResults = {} // { outliers: {ok, failures, candidates}, consistency: ..., completeness: ... }
    for (const checkType of ['outliers', 'consistency', 'completeness']) {
        if (!candidateSets[checkType]) continue
        perCheckResults[checkType] = await evaluateCheckForDeletion(
            candidateSets[checkType],
            baseConfig,
            ownedIds,
            templateMap
        )
        perCheckResults[checkType].candidates = candidateSets[checkType]
    }
    ```

    Then, for each check that returned `ok: true`, issue one real `POST /api/metadata?importStrategy=DELETE&atomicMode=ALL` (atomicMode=ALL because we've already confirmed safety — this one is genuinely all-or-nothing, if the real call somehow fails mid-way we want it to roll back). For checks with `ok: false`, emit a warning notification naming the first failure's reason (the user can expand details via console/log if they want the full list).

- [ ] **Step 6:** After `safeDeleteCandidates` returns, if `approved.length > 0`:

    ```javascript
    await d2PostJson(
        '/api/metadata?importStrategy=DELETE&atomicMode=NONE',
        approvedPayload
    )
    ```

    (atomicMode=NONE means individual failures don't roll back successes — defense in depth.)

- [ ] **Step 7:** Build a summary notification that lists the outcome **per check**. Example success path: `"Config removed. Outlier metadata: deleted. Consistency metadata: deleted."`. Example partial: `"Config removed. Outlier metadata: skipped (predictor \"DQ - …\" was modified after creation). Consistency metadata: deleted."`. `console.log` the full `perCheckResults` for developer inspection. Keep the existing success notification when `alsoDeleteMetadata` is false.

- [ ] **Step 8:** Smoke test matrix:
    - Checkbox **off** → dataStore clears, all metadata remains. (Regression check.)
    - Checkbox **on**, freshly imported unreferenced config → **all** checks' metadata deleted.
    - Checkbox **on**, manually edit one outlier predictor's description → outlier check skipped in full (no outlier metadata deleted), consistency and completeness still deleted.
    - Checkbox **on**, use one outlier indicator in a visualization → outlier check skipped (dry-run conflict on that indicator), others still deleted.
    - Checkbox **on**, delete one outlier DE directly in DHIS2 first, then remove config → outlier check skipped with `"no longer exists"` for that DE, others still deleted. dataStore still clears regardless.

- [ ] **Step 9:** Lint, build, commit.

---

## Task 7: "Close" button after successful import

**Files:**

- Modify: `src/index.html` — add Close button inside `resultSection`
- Modify: `src/app.js` — bind click handler

**Context:** After import completes with all-OK results, the preview and result sections stay visible. Users need a way to dismiss them and return to a clean form for the next configuration. Add a "Close" button below the import results table that hides both `resultSection` and `previewSection`.

- [ ] **Step 1:** In `src/index.html`, add a Close button inside the result section card, after the `resultTableContainer`:

    ```html
    <!-- Result section (hidden until import completes) -->
    <div id="resultSection" style="display: none;">
        <div class="dhis2-card" style="margin-top: 16px;">
            <h3>Import Results</h3>
            <div id="resultTableContainer"></div>
            <button
                id="buttonCloseResult"
                class="dhis2-btn-secondary"
                style="margin-top: 16px;"
            >
                Close
            </button>
        </div>
    </div>
    ```

- [ ] **Step 2:** In `src/app.js`, in `bindFormEvents()` (around line 2060), add:

    ```javascript
    el('buttonCloseResult').addEventListener('click', function () {
        el('resultSection').style.display = 'none'
        el('previewSection').style.display = 'none'
    })
    ```

- [ ] **Step 3:** Smoke test: configure + preview + import → results show → click Close → both preview and results disappear, form remains intact for next use.

- [ ] **Step 4:** Lint, commit.

---

## Task 8: Scroll to preview section after clicking Preview

**Files:**

- Modify: `src/app.js` `previewConfiguration()` around line 1030

**Context:** When the user clicks Preview, the preview section appears below the form but may be out of the viewport. The user may not notice it. Scroll the preview section into view after it's shown.

- [ ] **Step 1:** In `previewConfiguration()`, after `el("previewSection").style.display = "";` (line 1030), add:

    ```javascript
    el('previewSection').scrollIntoView({ behavior: 'smooth', block: 'start' })
    ```

- [ ] **Step 2:** Smoke test: fill form, click Preview, confirm page scrolls smoothly so the preview card heading is visible at top of viewport.

- [ ] **Step 3:** Lint, commit.

---

## Task 9: Pre-import conflict checking for name and shortName

**Files:**

- Modify: `src/app.js` `previewConfiguration()` — add conflict check after metadata generation
- Modify: `src/app.js` `makeTable()` — support optional row-level highlighting
- Modify: `src/css/style.css` — add `.conflict-row` style

**Context:** When previewing metadata, some generated objects may have `name` or `shortName` values that already exist in DHIS2 on other objects. If the user proceeds, the import will fail or create confusing duplicates. Catch these during preview and highlight conflicting rows in the preview tables so the user can see the problem before attempting import.

Templates do not use `code` fields, so conflicts to check are `name` and `shortName` only.

**Strategy:** After all three `configure*Metadata()` calls populate `currentImport`, collect all `name` and `shortName` values across all generated objects (dataElements, predictors, indicators). Batch-query DHIS2 for each metadata type using `filter=name:in:[...]` and `filter=shortName:in:[...]`. Any matches indicate a conflict. Annotate the preview tables so conflicting cells are highlighted, and show a warning notification summarizing the conflicts.

- [ ] **Step 1:** Add a helper function `async function checkMetadataConflicts(metadata)` in section 5b (after the `configure*` functions). It receives the combined metadata object `{ dataElements: [...], predictors: [...], indicators: [...] }` and returns a `Set` of conflicting `name` and `shortName` values:

    ```javascript
    async function checkMetadataConflicts(metadata) {
        const conflicts = new Set() // Set of "type:field:value" strings
        const checks = [
            { type: 'dataElements', endpoint: 'dataElements' },
            { type: 'predictors', endpoint: 'predictors' },
            { type: 'indicators', endpoint: 'indicators' },
        ]
        for (const check of checks) {
            const items = metadata[check.type] || []
            if (items.length === 0) continue

            const names = items
                .map(function (o) {
                    return o.name
                })
                .filter(Boolean)
            const shortNames = items
                .map(function (o) {
                    return o.shortName
                })
                .filter(Boolean)

            // Check name conflicts
            if (names.length > 0) {
                const nameFilter =
                    'filter=name:in:[' +
                    names.map(encodeURIComponent).join(',') +
                    ']'
                const result = await d2Get(
                    '/api/' +
                        check.endpoint +
                        '?' +
                        nameFilter +
                        '&fields=name&paging=false'
                )
                var existing = result[check.endpoint] || []
                for (var i = 0; i < existing.length; i++) {
                    conflicts.add('name:' + existing[i].name)
                }
            }

            // Check shortName conflicts
            if (shortNames.length > 0) {
                const snFilter =
                    'filter=shortName:in:[' +
                    shortNames.map(encodeURIComponent).join(',') +
                    ']'
                const result = await d2Get(
                    '/api/' +
                        check.endpoint +
                        '?' +
                        snFilter +
                        '&fields=shortName&paging=false'
                )
                var existing2 = result[check.endpoint] || []
                for (var j = 0; j < existing2.length; j++) {
                    conflicts.add('shortName:' + existing2[j].shortName)
                }
            }
        }
        return conflicts
    }
    ```

- [ ] **Step 2:** Modify `makeTable()` to accept an optional third parameter `conflicts` (a `Set`). When rendering cells for `name` or `shortName` columns, check if the cell value is in the conflict set and add a CSS class:

    ```javascript
    function makeTable(objects, properties, conflicts) {
        let htmlCode = "<table class='dhis2-table'><tr>"
        for (const prop of properties) {
            htmlCode += '<th>' + prop + '</th>'
        }
        for (const obj of objects) {
            htmlCode += '</tr><tr>'
            for (const prop of properties) {
                let nestedObj = JSON.parse(JSON.stringify(obj))
                let parts = prop.split('[')
                for (let part of parts) {
                    part = part.replace(']', '')
                    nestedObj = nestedObj[part]
                }
                const isConflict =
                    conflicts &&
                    (prop === 'name' || prop === 'shortName') &&
                    conflicts.has(prop + ':' + nestedObj)
                const cls = isConflict ? ' class="conflict-cell"' : ''
                const warning = isConflict ? ' ⚠ already exists' : ''
                htmlCode += '<td' + cls + '>' + nestedObj + warning + '</td>'
            }
        }
        htmlCode += '</tr></table>'
        return htmlCode
    }
    ```

- [ ] **Step 3:** Update `previewTable()` to pass through conflicts:

    ```javascript
    function previewTable(objects, properties, conflicts) {
        if (!objects || objects.length === 0) {
            return '<p style="color: var(--dhis2-text-secondary); font-style: italic;">N/A</p>'
        }
        return makeTable(objects, properties, conflicts)
    }
    ```

- [ ] **Step 4:** In `previewConfiguration()`, after all three `configure*Metadata()` calls and before rendering preview tables, merge all generated metadata and run conflict check:

    ```javascript
    // Merge all generated metadata for conflict check
    const allMetadata = {
        dataElements: [
            ...(currentImport.outlierImport.dataElements || []),
            ...(currentImport.consistencyImport.dataElements || []),
            ...(currentImport.completenessImport.dataElements || []),
        ],
        predictors: [
            ...(currentImport.outlierImport.predictors || []),
            ...(currentImport.consistencyImport.predictors || []),
            ...(currentImport.completenessImport.predictors || []),
        ],
        indicators: [
            ...(currentImport.outlierImport.indicators || []),
            ...(currentImport.consistencyImport.indicators || []),
            ...(currentImport.completenessImport.indicators || []),
        ],
    }
    const conflicts = await checkMetadataConflicts(allMetadata)
    ```

    Then pass `conflicts` to every `previewTable()` call:

    ```javascript
    el('dataElementPreviewOutlier').innerHTML = previewTable(
        outlierMetadata['dataElements'],
        ['name', 'shortName', 'description'],
        conflicts
    )
    ```

    (Same for all 9 preview table calls.)

- [ ] **Step 5:** If conflicts are found, show a warning notification:

    ```javascript
    if (conflicts.size > 0) {
        showNotification(
            conflicts.size +
                ' name/shortName conflict(s) found — highlighted in preview. Import may fail or create duplicates.',
            'warning'
        )
    }
    ```

- [ ] **Step 6:** Add `.conflict-cell` CSS in `src/css/style.css` (section 19, Results):

    ```css
    .conflict-cell {
        background: var(--dhis2-warning-bg);
        color: var(--dhis2-warning);
        font-weight: 500;
    }
    ```

- [ ] **Step 7:** Smoke test:
    - Import a config, then try to configure the same DE again → preview should highlight all name/shortName cells.
    - Configure a DE that has never been configured → no highlights.
    - Confirm import button is NOT disabled by conflicts (user may proceed knowingly).

- [ ] **Step 8:** Lint, build, commit.

---

## Sequencing

Tasks 1–6 are the original round 2 fixes (all implemented).

Tasks 7, 8 are small independent fixes — can ship in one commit each.
Task 9 is standalone but larger.

Recommended order: **7 → 8 → 9**.

## Out of scope

- Editing non-threshold outlier parameters (still requires delete + re-create).
- Bulk metadata cleanup for orphaned items not tied to a current config.
- Fuzzy template matching (whitespace-tolerant, etc.) — strict equality is the spec.
- Migration of existing dataStore entries — nothing changes on disk for older configs.
- `code` field conflict checking — templates do not set `code` on any generated metadata.
