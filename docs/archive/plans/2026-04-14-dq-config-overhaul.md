# DQ Config App Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the DQ Config app to fix the duplicate-name initialization bug, remove jQuery, apply DHIS2 design system styling, and add edit/delete for existing configurations.

**Architecture:** Clean rewrite of three files (`app.js`, `index.html`, `style.css`) plus minor edits to `package.json` and `webpack.config.js`. The API wrapper (`d2api.js`) and metadata templates (`templates.js`) are untouched. All DOM manipulation uses vanilla JS. DHIS2 visual language applied via CSS custom properties.

**Tech Stack:** Vanilla JavaScript (ES modules), CSS custom properties, Webpack 5, DHIS2 API

**Spec:** `docs/superpowers/specs/2026-04-14-dq-config-overhaul-design.md`

**Key project rules (from AGENTS.md):**

- No React/Vue/frameworks — vanilla JS only
- No raw fetch for DHIS2 — use `d2api.js` helpers
- ESLint: 4-space indent, double quotes, semicolons required
- Preserve `d2-manifest` post-build step

---

## File Map

| File                  | Action    | Responsibility                         |
| --------------------- | --------- | -------------------------------------- |
| `package.json`        | Modify    | Remove jQuery dependencies             |
| `webpack.config.js`   | Modify    | Remove jQuery ProvidePlugin block      |
| `src/css/style.css`   | Rewrite   | DHIS2 design system CSS                |
| `src/index.html`      | Rewrite   | New HTML structure with DHIS2 patterns |
| `src/app.js`          | Rewrite   | All application logic, vanilla JS      |
| `src/js/d2api.js`     | Untouched | —                                      |
| `src/js/templates.js` | Untouched | —                                      |

---

## Task 1: Remove jQuery Dependencies

**Files:**

- Modify: `package.json` (lines 6-7)
- Modify: `webpack.config.js` (lines 117-121)

- [ ] **Step 1: Remove jQuery from package.json**

In `package.json`, remove the entire `dependencies` block (both `jquery` and `webpack-jquery-ui`). Replace with an empty object:

```json
"dependencies": {},
```

- [ ] **Step 2: Remove ProvidePlugin from webpack.config.js**

Remove lines 117-121 (the `webpack.ProvidePlugin` block):

```javascript
// REMOVE THIS:
new webpack.ProvidePlugin({
    $: "jquery",
    jQuery: "jquery",
    "window.jQuery": "jquery"
}),
```

Leave all other plugins intact. The CSS/SCSS loader rules stay — they're generic.

- [ ] **Step 3: Remove node_modules jQuery packages**

Run:

```bash
cd /tool-dq-config && rm -rf node_modules/jquery node_modules/webpack-jquery-ui
```

- [ ] **Step 4: Commit**

```bash
git add package.json webpack.config.js
git commit -m "chore: remove jQuery and jQuery UI dependencies"
```

---

## Task 2: Write DHIS2 Design System CSS

**Files:**

- Rewrite: `src/css/style.css`

**Reference:** Spec Section 2 (Design Tokens + Component Styles)

- [ ] **Step 1: Write complete style.css**

Replace the entire contents of `src/css/style.css` with the DHIS2 design system CSS. The file must include all of the following sections. Use the design tokens from the spec exactly.

**CSS sections to include (in order):**

1. **CSS Custom Properties** — All `--dhis2-*` tokens from spec Section 2
2. **Base/Reset** — `body` with font-family `var(--dhis2-font)`, `margin: 0`, `background: var(--dhis2-bg)`
3. **App Layout** — `.app-container` padding below header bar, max content width
4. **Tab Navigation** — `.dhis2-tabs` (flex row, bottom border), `.dhis2-tab` (inactive/active/hover states with underline indicator)
5. **Tab Content** — `.tab-content` hidden by default, `.tab-content.active` shown
6. **Cards** — `.dhis2-card` with surface background, border, radius, padding per spec
7. **Form Controls** — `.dhis2-label`, `.dhis2-select`, `.dhis2-input` with focus states per spec
8. **Buttons** — `.dhis2-btn` (primary), `.dhis2-btn-secondary`, `.dhis2-btn-destructive`, `.dhis2-btn:disabled`
9. **Tables** — `.dhis2-table` with header background, borders, cell padding
10. **Notifications** — `.notification-container` (fixed position top), `.notification` with `.notification-info`, `.notification-success`, `.notification-warning`, `.notification-error` variants, left border accent, dismiss button, fade-in animation
11. **Modal** — `.modal-overlay` (fixed full-screen dark backdrop), `.modal-dialog` (centered white card, max-width 480px), `.modal-header`, `.modal-body`, `.modal-footer` (flex row, right-aligned buttons)
12. **Loading Overlay** — `.loading-overlay` (semi-transparent overlay), `.loading-spinner` (CSS-only spinner using border animation)
13. **Config Overview** — `.config-summary` (count text), `.config-card` (card with header row containing name + action buttons), `.config-card-header` (flex row, space-between), `.config-card-actions` (button group)
14. **Status Chips** — `.dhis2-chip` (inline pill), `.dhis2-chip-active` (blue variant), `.dhis2-chip-inactive` (gray variant)
15. **Edit Inline Form** — `.edit-form` (inline form within card, shown/hidden)
16. **Empty State** — `.empty-state` (centered text with icon)
17. **Selection/Form Group** — `.form-group` with bottom margin
18. **Notice Bar** — `.dhis2-notice` (info banner with left blue border, light blue background)
19. **Results Table** — `.result-success` (green), `.result-error` (red) row styling
20. **Preview Section** — `.preview-section` styling for preview tables

Key implementation details:

- Use `var(--dhis2-*)` for all colors, not hardcoded hex values (except in `:root`)
- Notification fade-in: `@keyframes slideIn { from { transform: translateY(-20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`
- Loading spinner: `@keyframes spin { to { transform: rotate(360deg); } }` on a `border` element
- All `.dhis2-select` and `.dhis2-input` get `width: 100%` within their form group
- Font: rely on system-ui fallback stack (Roboto loaded via CDN link in HTML, but works without it in offline environments)

- [ ] **Step 2: Verify CSS is valid**

Run:

```bash
cd /tool-dq-config && npx webpack --config webpack.config.js 2>&1 | head -20
```

This will fail because app.js still imports jQuery, but confirms the CSS file itself is parseable.

- [ ] **Step 3: Commit**

```bash
git add src/css/style.css
git commit -m "feat: replace CSS with DHIS2 design system styles"
```

---

## Task 3: Write HTML Structure

**Files:**

- Rewrite: `src/index.html`

**Reference:** Spec Sections 2 (Layout), 5 (Initialization Modal, Notifications), 6 (Tab System)

- [ ] **Step 1: Write complete index.html**

Replace the entire contents of `src/index.html`. The HTML must include:

```html
<!DOCTYPE html>
<html>
    <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
            href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500&display=swap"
            rel="stylesheet"
        />
        <script defer src="resources/dhis-header-bar.js"></script>
    </head>
    <body>
        <div id="dhis-header-bar"></div>

        <!-- Notification container (populated by JS) -->
        <div id="notificationContainer" class="notification-container"></div>

        <!-- Loading overlay (hidden by default) -->
        <div id="loadingOverlay" class="loading-overlay" style="display: none;">
            <div class="loading-spinner"></div>
        </div>

        <!-- Initialization modal (hidden by default) -->
        <div id="initialiseModal" class="modal-overlay" style="display: none;">
            <div class="modal-dialog">
                <div class="modal-header">
                    <h2>Initialise Data Store</h2>
                </div>
                <div class="modal-body">
                    <p>
                        The dataStore structure must be initialised before the
                        app can be used. This will create the required metadata
                        groups and configuration entries.
                    </p>
                </div>
                <div class="modal-footer">
                    <button id="btnCancelInit" class="dhis2-btn-secondary">
                        Cancel
                    </button>
                    <button id="btnInitialise" class="dhis2-btn">
                        Initialise
                    </button>
                </div>
            </div>
        </div>

        <!-- Delete confirmation modal (hidden by default) -->
        <div id="deleteModal" class="modal-overlay" style="display: none;">
            <div class="modal-dialog">
                <div class="modal-header">
                    <h2>Remove Configuration</h2>
                </div>
                <div class="modal-body">
                    <p id="deleteModalMessage"></p>
                    <p class="dhis2-notice">
                        The DHIS2 metadata (data elements, predictors,
                        indicators) will not be deleted.
                    </p>
                </div>
                <div class="modal-footer">
                    <button id="btnCancelDelete" class="dhis2-btn-secondary">
                        Cancel
                    </button>
                    <button id="btnConfirmDelete" class="dhis2-btn-destructive">
                        Remove
                    </button>
                </div>
            </div>
        </div>

        <!-- Main app container -->
        <div class="app-container">
            <nav class="dhis2-tabs" id="tabNav">
                <a class="dhis2-tab active" data-tab="configure">Add new</a>
                <a class="dhis2-tab" data-tab="overview">Configuration</a>
                <a class="dhis2-tab" data-tab="info">Instructions</a>
            </nav>

            <!-- Tab: Add new configuration -->
            <section id="tab-configure" class="tab-content active">
                <div class="dhis2-card">
                    <h2>Configure data quality metadata</h2>
                    <div class="dhis2-notice">
                        All fields are required. Select a data set to begin.
                    </div>

                    <div class="form-group">
                        <label class="dhis2-label" for="selectDataSet"
                            >Data set</label
                        >
                        <select
                            id="selectDataSet"
                            class="dhis2-select"
                        ></select>
                    </div>

                    <div class="form-group">
                        <label class="dhis2-label" for="selectDataElement"
                            >Data element</label
                        >
                        <select
                            id="selectDataElement"
                            class="dhis2-select"
                        ></select>
                    </div>

                    <div
                        class="form-group"
                        id="completenessSection"
                        style="display: none;"
                    >
                        <label class="dhis2-label"
                            >Disaggregation completeness approach</label
                        >
                        <div id="completenessApproachContainer">
                            <div style="margin-bottom: 8px;">
                                <input
                                    type="radio"
                                    id="proxyApproach"
                                    name="completenessApproach"
                                    value="proxy"
                                    checked
                                />
                                <label for="proxyApproach"
                                    >Use one category option combo as
                                    proxy</label
                                >
                            </div>
                            <div style="margin-bottom: 12px;">
                                <input
                                    type="radio"
                                    id="anyValueApproach"
                                    name="completenessApproach"
                                    value="anyValue"
                                />
                                <label for="anyValueApproach"
                                    >Count as complete when any category option
                                    combo has a value</label
                                >
                            </div>
                            <select
                                id="selectDataElementOperand"
                                class="dhis2-select"
                            ></select>
                        </div>
                    </div>

                    <div class="form-group">
                        <label class="dhis2-label" for="selectOuLevel"
                            >Organisation unit level</label
                        >
                        <select
                            id="selectOuLevel"
                            class="dhis2-select"
                        ></select>
                    </div>

                    <div class="form-group">
                        <label class="dhis2-label" for="selectThreshold"
                            >Outlier threshold (standard deviations from
                            mean)</label
                        >
                        <input
                            id="selectThreshold"
                            class="dhis2-input"
                            type="number"
                            min="2"
                            max="4"
                            step="0.1"
                            value="3.0"
                        />
                    </div>

                    <button id="buttonPreview" class="dhis2-btn" disabled>
                        Preview
                    </button>
                </div>

                <!-- Preview section (hidden until preview clicked) -->
                <div id="previewSection" style="display: none;">
                    <div class="dhis2-card" style="margin-top: 16px;">
                        <h3>Preview</h3>

                        <h4>Outliers</h4>
                        <p class="dhis2-label">Data elements</p>
                        <div id="dataElementPreviewOutlier"></div>
                        <p class="dhis2-label">Predictors</p>
                        <div id="predictorPreviewOutlier"></div>
                        <p class="dhis2-label">Indicators</p>
                        <div id="indicatorPreviewOutlier"></div>

                        <h4>Consistency</h4>
                        <p class="dhis2-label">Data elements</p>
                        <div id="dataElementPreviewConsistency"></div>
                        <p class="dhis2-label">Predictors</p>
                        <div id="predictorPreviewConsistency"></div>
                        <p class="dhis2-label">Indicators</p>
                        <div id="indicatorPreviewConsistency"></div>

                        <h4>Completeness</h4>
                        <p class="dhis2-label">Data elements</p>
                        <div id="dataElementPreviewCompleteness"></div>
                        <p class="dhis2-label">Predictors</p>
                        <div id="predictorPreviewCompleteness"></div>
                        <p class="dhis2-label">Indicators</p>
                        <div id="indicatorPreviewCompleteness"></div>

                        <button id="buttonImport" class="dhis2-btn" disabled>
                            Import
                        </button>
                    </div>
                </div>

                <!-- Result section (hidden until import completes) -->
                <div id="resultSection" style="display: none;">
                    <div class="dhis2-card" style="margin-top: 16px;">
                        <h3>Import Results</h3>
                        <div id="resultTableContainer"></div>
                    </div>
                </div>
            </section>

            <!-- Tab: Configuration overview -->
            <section id="tab-overview" class="tab-content">
                <div id="configuredOutliers"></div>
            </section>

            <!-- Tab: Instructions -->
            <section id="tab-info" class="tab-content">
                <div class="dhis2-card">
                    <h2>Instructions</h2>
                    <p>
                        This app helps you set up automated data quality checks
                        for your DHIS2 data elements. It creates three types of
                        quality metrics:
                    </p>
                    <ul>
                        <li>
                            <strong>Outliers:</strong> Identifies values that
                            deviate significantly from the average
                        </li>
                        <li>
                            <strong>Consistency:</strong> Checks if reported
                            values are consistent across periods
                        </li>
                        <li>
                            <strong>Completeness:</strong> Monitors if data is
                            being reported as expected
                        </li>
                    </ul>
                    <h3>How to use</h3>
                    <ol>
                        <li>
                            Select a data set to filter available data elements
                        </li>
                        <li>
                            Choose the data element you want to configure
                            quality checks for
                        </li>
                        <li>
                            For disaggregated data elements, choose how to
                            handle completeness:
                            <ul>
                                <li>
                                    Use one category option as a proxy for all
                                </li>
                                <li>
                                    Count as complete when any category has data
                                </li>
                            </ul>
                        </li>
                        <li>
                            Select the organisation unit level where data is
                            collected
                        </li>
                        <li>
                            Set the threshold for outlier detection (standard
                            deviations from mean)
                        </li>
                        <li>
                            Click Preview to review the configuration before
                            importing
                        </li>
                    </ol>
                </div>
            </section>
        </div>
    </body>
</html>
```

Key differences from current HTML:

- No `onclick` attributes anywhere — all events bound in JS
- DHIS2-styled modals for init and delete confirmation
- Tab navigation uses `data-tab` attributes
- Form uses DHIS2 class names (`dhis2-select`, `dhis2-label`, `dhis2-btn`)
- Loading overlay and notification container present
- Roboto font loaded via Google Fonts link
- Preview button starts disabled (no duplicate `id` attribute like the original)

- [ ] **Step 2: Commit**

```bash
git add src/index.html
git commit -m "feat: rewrite HTML with DHIS2 design system structure"
```

---

## Task 4: Write app.js — Core (Sections 1-8)

**Files:**

- Rewrite: `src/app.js`

**Reference:** Spec Sections 1 (Bug Fixes), 3 (jQuery Removal), 5 (UX), 6 (Structure)

**Important:** This task writes the first ~60% of `app.js`. Task 5 completes it. Both tasks write to the same file. This task creates the file; Task 5 appends to it.

**ESLint rules:** 4-space indent, double quotes, semicolons required. Use `let`/`const` (no `var`).

- [ ] **Step 1: Write Sections 1-2 (Imports + State)**

Create `src/app.js` with:

```javascript
'use strict'

// ============================================================
// 1. IMPORTS
// ============================================================
import { d2Get, d2PostJson, d2PutJson } from './js/d2api.js'
import {
    templateOutlier,
    templateConsistency,
    templateCompleteness,
    templateCompletenessDisaggregated,
} from './js/templates.js'
import './css/style.css'

// ============================================================
// 2. STATE
// ============================================================
let baseConfig
let currentImport = {}
```

Note: No jQuery imports. CSS import stays (webpack handles it).

- [ ] **Step 2: Write Section 3 (Utility Helpers)**

Append to `src/app.js`:

```javascript
// ============================================================
// 3. UTILITY HELPERS
// ============================================================

function el(id) {
    return document.getElementById(id)
}

async function generateUids(count) {
    if (!count) count = 1
    const data = await d2Get('/api/system/id?limit=' + count)
    return data['codes']
}

async function defaultCoCId() {
    const data = await d2Get(
        '/api/categoryOptionCombos?filter=name:eq:default&fields=id'
    )
    const cocs = data['categoryOptionCombos']
    if (cocs.length > 1) {
        showNotification(
            'Duplicate default categoryOptionCombos found. Using ' +
                cocs[0]['id'],
            'warning'
        )
    }
    return cocs[0]['id']
}

async function indicatorTypePercentId() {
    const data = await d2Get(
        '/api/indicatorTypes.json?fields=id&filter=factor:eq:100&filter=number:eq:false'
    )
    const inTypes = data['indicatorTypes']
    if (inTypes.length > 1) {
        showNotification(
            'Duplicate percentage indicator types found.',
            'warning'
        )
    }
    return inTypes[0]['id']
}

function hasObject(list, prop, val) {
    for (const item of list) {
        if (item[prop] == val) return true
    }
    return false
}

function shareMetadata(metadata, groupId) {
    for (const type in metadata) {
        for (const elem of metadata[type]) {
            elem['sharing'] = {
                public: 'r-------',
                userGroups: {
                    [groupId]: {
                        access: 'rw------',
                        id: groupId,
                    },
                },
            }
        }
    }
}
```

Key changes from original: `alert()` → `showNotification()`, `var` → `const`/`let`.

- [ ] **Step 3: Write Section 4 (UI Helpers)**

Append to `src/app.js`:

```javascript
// ============================================================
// 4. UI HELPERS
// ============================================================

function showNotification(message, type = 'info') {
    const container = el('notificationContainer')
    const notification = document.createElement('div')
    notification.className = 'notification notification-' + type

    const text = document.createElement('span')
    text.textContent = message
    notification.appendChild(text)

    const closeBtn = document.createElement('button')
    closeBtn.className = 'notification-close'
    closeBtn.textContent = '\u00d7'
    closeBtn.addEventListener('click', function () {
        notification.remove()
    })
    notification.appendChild(closeBtn)

    container.appendChild(notification)

    // Auto-dismiss for info and success
    if (type === 'info' || type === 'success') {
        setTimeout(function () {
            if (notification.parentNode) notification.remove()
        }, 5000)
    }
}

function showLoading() {
    el('loadingOverlay').style.display = ''
}

function hideLoading() {
    el('loadingOverlay').style.display = 'none'
}

function showModal(modalId) {
    el(modalId).style.display = ''
}

function hideModal(modalId) {
    el(modalId).style.display = 'none'
}

function switchTab(tabName) {
    // Update tab active state
    const tabs = document.querySelectorAll('.dhis2-tab')
    tabs.forEach(function (tab) {
        if (tab.dataset.tab === tabName) {
            tab.classList.add('active')
        } else {
            tab.classList.remove('active')
        }
    })

    // Show/hide tab content
    const sections = document.querySelectorAll('.tab-content')
    sections.forEach(function (section) {
        if (section.id === 'tab-' + tabName) {
            section.classList.add('active')
        } else {
            section.classList.remove('active')
        }
    })
}
```

- [ ] **Step 4: Write Section 5 (Metadata Configuration)**

Append to `src/app.js`. These are the 4 configure functions (`configureOutlierMetadata`, `configureConsistencyMetadata`, `configureCompletenessMetadata`, `configureCompletenessDisaggregatedMetadata`).

Port directly from the original `app.js` with these changes:

- Replace `$()` calls with vanilla JS equivalents
- `$("#selectOuLevel").find(":selected").val()` → `el("selectOuLevel").value`
- `$("#selectThreshold").val()` → `el("selectThreshold").value`
- `$("#completenessApproachContainer").is(":visible")` → `el("completenessSection").style.display !== "none"` (check the parent section, not the inner container — `completenessSection` is what gets hidden/shown)
- `var` → `let`/`const`
- Keep the same template substitution logic (it works correctly)

- [ ] **Step 5: Write Section 6 (Metadata Group Management)**

Append to `src/app.js`:

```javascript
// ============================================================
// 6. METADATA GROUP MANAGEMENT
// ============================================================

async function addToDeGroup(groupId, dataElements) {
    let group = await d2Get(
        '/api/dataElementGroups/' + groupId + '?fields=:owner'
    )
    for (const de of dataElements) {
        group.dataElements.push({ id: de.id })
    }
    return await d2PutJson('/api/dataElementGroups/' + groupId, group)
}

async function addToInGroup(groupId, indicators) {
    let group = await d2Get(
        '/api/indicatorGroups/' + groupId + '?fields=:owner'
    )
    for (const ind of indicators) {
        group.indicators.push({ id: ind.id })
    }
    return await d2PutJson('/api/indicatorGroups/' + groupId, group)
}

async function addToPdGroup(groupId, predictors) {
    let group = await d2Get(
        '/api/predictorGroups/' + groupId + '?fields=:owner'
    )
    for (const pd of predictors) {
        group.predictors.push({ id: pd.id })
    }
    return await d2PutJson('/api/predictorGroups/' + groupId, group)
}

async function removeFromDeGroup(groupId, deIds) {
    let group = await d2Get(
        '/api/dataElementGroups/' + groupId + '?fields=:owner'
    )
    group.dataElements = group.dataElements.filter(function (de) {
        return !deIds.includes(de.id)
    })
    return await d2PutJson('/api/dataElementGroups/' + groupId, group)
}

async function removeFromInGroup(groupId, inIds) {
    let group = await d2Get(
        '/api/indicatorGroups/' + groupId + '?fields=:owner'
    )
    group.indicators = group.indicators.filter(function (ind) {
        return !inIds.includes(ind.id)
    })
    return await d2PutJson('/api/indicatorGroups/' + groupId, group)
}

async function removeFromPdGroup(groupId, pdIds) {
    let group = await d2Get(
        '/api/predictorGroups/' + groupId + '?fields=:owner'
    )
    group.predictors = group.predictors.filter(function (pd) {
        return !pdIds.includes(pd.id)
    })
    return await d2PutJson('/api/predictorGroups/' + groupId, group)
}

function splitOutlierPredictors(outlierConfig, predictors) {
    let result = {
        threshold: [],
        analysis: [],
    }
    for (const p of predictors) {
        if (outlierConfig['\u00a7PD_THRESHOLD\u00a7'] == p['id']) {
            result.threshold.push(p)
        } else {
            result.analysis.push(p)
        }
    }
    return result
}
```

Note: `splitOutlierPredictors` uses `"threshold"` (not `"treshold"` — the typo fix from spec 1c).

- [ ] **Step 6: Write Section 7 (Import Functions)**

Append to `src/app.js`. Port `importOutlier()`, `importConsistency()`, `importCompleteness()` from original with these fixes:

1. **Bug fix 1b:** In `importOutlier()`, the error catch for "Add to groups" must use array brackets:

    ```javascript
    // WRONG (original): results.push("Outlier - Add to groups", error["status"]);
    // CORRECT:
    results.push(['Outlier - Add to groups', error['status']])
    ```

2. **Bug fix 1c:** Use `"threshold"` not `"treshold"` in `splitOutlierPredictors` call:

    ```javascript
    // WRONG (original): splitOutlierPredictors(outlierConfig, outlierImport.predictors)["treshold"]
    // CORRECT:
    splitOutlierPredictors(outlierConfig, outlierImport.predictors)['threshold']
    ```

3. Use `baseConfig.predictorGroupThreshold` (not `predictorGroupTreshold`)

4. Replace `var` with `let`/`const`

5. Remove `console.log(importResult)` from `importCompleteness()`

- [ ] **Step 7: Write Section 8 (Preview)**

Append to `src/app.js`. Port `previewConfiguration()` and `previewPossible()` with vanilla JS replacements.

Key changes:

- `$()` → `el()` / `document.getElementById()`
- `$(selector).find(":selected").val()` → `el(id).value`
- `$(selector).show()` → `el(id).style.display = ""`
- `$(selector).hide()` → `el(id).style.display = "none"`
- `$(selector).attr("disabled", false)` → `el(id).disabled = false`
- `$(selector).prop("disabled", !isValid)` → `el(id).disabled = !isValid`
- The `alert()` for non-monthly datasets → `showNotification(..., "warning")`
- The `alert()` for preview failure → `showNotification(..., "error")`
- `confirm()` in importMetadata → use the delete modal pattern (but we'll handle import confirmation inline for now — keep `confirm()` here as it's simpler for the import flow and not the reported UX issue)

For `previewPossible()`:

- **Bug fix 1d:** Use `data-catcombo` attribute instead of regex parsing:
    ```javascript
    const selectedOption =
        el('selectDataElement').options[el('selectDataElement').selectedIndex]
    const catCombo = selectedOption ? selectedOption.dataset.catcombo : ''
    const isDisaggregated = catCombo && catCombo !== 'default'
    ```

Also include `makeSelect()` and `makeTable()` and `generateResultsTable()` and `makeSelectOuLevel()` as utility functions in this section — they support the preview flow. Port with vanilla JS replacements.

For `makeTable()`: keep the same logic but replace jQuery HTML injection with vanilla DOM string building. Add DHIS2 table class:

```javascript
let htmlCode = "<table class='dhis2-table'><tr>"
```

For `generateResultsTable()`: add result-level class for color coding:

```javascript
const statusClass = row[1] === 'SUCCESS' ? 'result-success' : 'result-error'
htmlCode +=
    "<tr class='" +
    statusClass +
    "'><td>" +
    row[0] +
    '</td><td>' +
    row[1] +
    '</td></tr>'
```

- [ ] **Step 8: Commit progress**

```bash
git add src/app.js
git commit -m "feat: write app.js core — imports, utilities, metadata config, import, preview"
```

---

## Task 5: Write app.js — Config Overview, Edit/Delete, Init, Load (Sections 9-13)

**Files:**

- Modify: `src/app.js` (append to file created in Task 4)

**Reference:** Spec Sections 1a (Initialization Bug Fix), 1c (Typo Migration), 4 (Edit/Delete), 5 (Config Overview)

**CRITICAL:** This task appends to the existing `src/app.js` from Task 4. Do NOT overwrite the file. Read the current file first to understand where to append.

- [ ] **Step 1: Write Section 9 (Configuration Overview — List)**

Append `listConfig()` function. Port from original `app.js` lines 456-569 with:

- Replace `$()` with vanilla JS
- `$("#configuredOutliers").html(htmlCode)` → `el("configuredOutliers").innerHTML = htmlCode`
- Add summary count at top: `<div class="config-summary">N data elements configured</div>`
- Add empty state when no configs: `<div class="empty-state"><p>No data elements configured yet.</p><p>Go to the <a href="#" data-tab="configure">Add new</a> tab to get started.</p></div>`
- Add edit/delete buttons to each config card header:
    ```html
    <div class="config-card-header">
        <h4>{name}</h4>
        <div class="config-card-actions">
            <button class="dhis2-btn-secondary btn-edit" data-de-id="{id}">
                Edit
            </button>
            <button
                class="dhis2-btn-destructive btn-delete"
                data-de-id="{id}"
                data-de-name="{name}"
            >
                Remove
            </button>
        </div>
    </div>
    ```
- Use DHIS2 chip styling for config type indicators:
    ```html
    <span class="dhis2-chip dhis2-chip-active">Outliers (3.0 SD)</span>
    ```
- After rendering, attach event listeners to the dynamically created edit/delete buttons

- [ ] **Step 2: Write Section 9 (Configuration Overview — Delete)**

Append `deleteConfig()` function:

```javascript
async function deleteConfig(deId, deName) {
    // Show confirmation modal
    el('deleteModalMessage').textContent =
        "Remove DQ configuration for '" + deName + "'?"
    showModal('deleteModal')

    return new Promise(function (resolve) {
        const confirmBtn = el('btnConfirmDelete')
        const cancelBtn = el('btnCancelDelete')

        function cleanup() {
            confirmBtn.removeEventListener('click', onConfirm)
            cancelBtn.removeEventListener('click', onCancel)
            hideModal('deleteModal')
        }

        async function onConfirm() {
            cleanup()
            showLoading()
            try {
                // Load all dataStore arrays
                const outliers = await d2Get('/api/dataStore/dqConfig/outliers')
                const consistency = await d2Get(
                    '/api/dataStore/dqConfig/consistency'
                )
                const completeness = await d2Get(
                    '/api/dataStore/dqConfig/completeness'
                )

                // Find and collect metadata IDs to remove from groups
                const baseId = deId.split('.')[0]

                // Process outliers
                const outlierEntry = outliers.find(function (item) {
                    return Object.keys(item)[0] === baseId
                })
                if (outlierEntry) {
                    const config = outlierEntry[baseId]
                    // Remove from groups
                    const deIds = [
                        config['\u00a7DE_NOUTLIER_COUNT\u00a7'],
                        config['\u00a7DE_NOUTLIER_VAL\u00a7'],
                        config['\u00a7DE_OUTLIER_COUNT\u00a7'],
                        config['\u00a7DE_OUTLIER_VAL\u00a7'],
                        config['\u00a7DE_THRESHOLD\u00a7'],
                    ].filter(Boolean)
                    const inIds = [
                        config['\u00a7IN_NOUTLIER_PROP\u00a7'],
                        config['\u00a7IN_OUTLIER_PROP\u00a7'],
                    ].filter(Boolean)
                    const pdIds = [
                        config['\u00a7PD_NOUTLIER_COUNT\u00a7'],
                        config['\u00a7PD_NOUTLIER_VAL\u00a7'],
                        config['\u00a7PD_OUTLIER_COUNT\u00a7'],
                        config['\u00a7PD_OUTLIER_VAL\u00a7'],
                        config['\u00a7PD_THRESHOLD\u00a7'],
                    ].filter(Boolean)
                    const thresholdPdIds = [
                        config['\u00a7PD_THRESHOLD\u00a7'],
                    ].filter(Boolean)
                    const analysisPdIds = pdIds.filter(function (id) {
                        return !thresholdPdIds.includes(id)
                    })

                    if (deIds.length)
                        await removeFromDeGroup(
                            baseConfig.dataElementGroup,
                            deIds
                        )
                    if (inIds.length)
                        await removeFromInGroup(
                            baseConfig.indicatorGroup,
                            inIds
                        )
                    if (pdIds.length)
                        await removeFromPdGroup(
                            baseConfig.predictorGroup,
                            pdIds
                        )
                    if (thresholdPdIds.length)
                        await removeFromPdGroup(
                            baseConfig.predictorGroupThreshold,
                            thresholdPdIds
                        )
                    if (analysisPdIds.length)
                        await removeFromPdGroup(
                            baseConfig.predictorGroupAnalysis,
                            analysisPdIds
                        )
                }

                // Process consistency
                const consistencyEntry = consistency.find(function (item) {
                    return Object.keys(item)[0] === baseId
                })
                if (consistencyEntry) {
                    const config = consistencyEntry[baseId]
                    const deIds = [
                        config['\u00a7DE_CONS_ALL\u00a7'],
                        config['\u00a7DE_CONS_ANY\u00a7'],
                    ].filter(Boolean)
                    const inIds = [config['\u00a7IN_CONS_PROP\u00a7']].filter(
                        Boolean
                    )
                    const pdIds = [
                        config['\u00a7PD_CONS_ALL\u00a7'],
                        config['\u00a7PD_CONS_ANY\u00a7'],
                    ].filter(Boolean)

                    if (deIds.length)
                        await removeFromDeGroup(
                            baseConfig.dataElementGroup,
                            deIds
                        )
                    if (inIds.length)
                        await removeFromInGroup(
                            baseConfig.indicatorGroup,
                            inIds
                        )
                    if (pdIds.length)
                        await removeFromPdGroup(
                            baseConfig.predictorGroup,
                            pdIds
                        )
                    if (pdIds.length)
                        await removeFromPdGroup(
                            baseConfig.predictorGroupConsistency,
                            pdIds
                        )
                }

                // Process completeness — match on both exact key and base ID
                const completenessEntry = completeness.find(function (item) {
                    const key = Object.keys(item)[0]
                    return key === baseId || key.split('.')[0] === baseId
                })
                if (completenessEntry) {
                    const key = Object.keys(completenessEntry)[0]
                    const config = completenessEntry[key]
                    const inIds = [
                        config['\u00a7IN_COMPL\u00a7'],
                        config['\u00a7IN_COMPL_ANY\u00a7'],
                    ].filter(Boolean)

                    if (inIds.length)
                        await removeFromInGroup(
                            baseConfig.indicatorGroup,
                            inIds
                        )
                }

                // Remove entries from dataStore arrays
                const newOutliers = outliers.filter(function (item) {
                    return Object.keys(item)[0] !== baseId
                })
                const newConsistency = consistency.filter(function (item) {
                    return Object.keys(item)[0] !== baseId
                })
                const newCompleteness = completeness.filter(function (item) {
                    const key = Object.keys(item)[0]
                    return key !== baseId && key.split('.')[0] !== baseId
                })

                await d2PutJson('/api/dataStore/dqConfig/outliers', newOutliers)
                await d2PutJson(
                    '/api/dataStore/dqConfig/consistency',
                    newConsistency
                )
                await d2PutJson(
                    '/api/dataStore/dqConfig/completeness',
                    newCompleteness
                )

                showNotification(
                    "Configuration for '" + deName + "' removed successfully.",
                    'success'
                )
                await listConfig()
            } catch (error) {
                showNotification(
                    'Failed to remove configuration: ' + error.message,
                    'error'
                )
            } finally {
                hideLoading()
            }
            resolve()
        }

        function onCancel() {
            cleanup()
            resolve()
        }

        confirmBtn.addEventListener('click', onConfirm)
        cancelBtn.addEventListener('click', onCancel)
    })
}
```

- [ ] **Step 3: Write Section 9 (Configuration Overview — Edit)**

Append `editOutlierThreshold()` function:

```javascript
async function editOutlierThreshold(deId, cardElement) {
    // Find the outlier config for this data element
    const outliers = await d2Get('/api/dataStore/dqConfig/outliers')
    const baseId = deId.split('.')[0]
    const entryIndex = outliers.findIndex(function (item) {
        return Object.keys(item)[0] === baseId
    })
    if (entryIndex === -1) {
        showNotification('Outlier configuration not found.', 'error')
        return
    }

    const config = outliers[entryIndex][baseId]
    const currentSD = config['\u00a7VAL_STDDEV\u00a7']

    // Show inline edit form
    let existingForm = cardElement.querySelector('.edit-form')
    if (existingForm) {
        existingForm.remove()
        return // Toggle off if already showing
    }

    const formHtml =
        '<div class="edit-form">' +
        '<label class="dhis2-label">New outlier threshold (standard deviations)</label>' +
        '<input class="dhis2-input edit-threshold-input" type="number" min="2" max="4" step="0.1" value="' +
        currentSD +
        '">' +
        '<div style="margin-top: 8px;">' +
        '<button class="dhis2-btn btn-save-edit">Save</button> ' +
        '<button class="dhis2-btn-secondary btn-cancel-edit">Cancel</button>' +
        '</div>' +
        '<p style="margin-top: 8px; font-size: 13px; color: var(--dhis2-text-secondary);">' +
        'To change data element or org unit level, remove and re-create the configuration.</p>' +
        '</div>'

    cardElement.insertAdjacentHTML('beforeend', formHtml)

    const form = cardElement.querySelector('.edit-form')
    const input = form.querySelector('.edit-threshold-input')

    form.querySelector('.btn-cancel-edit').addEventListener(
        'click',
        function () {
            form.remove()
        }
    )

    form.querySelector('.btn-save-edit').addEventListener(
        'click',
        async function () {
            const newSD = input.value
            if (!newSD || parseFloat(newSD) < 2 || parseFloat(newSD) > 4) {
                showNotification(
                    'Threshold must be between 2 and 4.',
                    'warning'
                )
                return
            }
            if (newSD === currentSD) {
                form.remove()
                return
            }

            showLoading()
            try {
                const oldSD = currentSD

                // Helper for targeted string replacement
                function replaceSD(str) {
                    return str
                        .split('mean + ' + oldSD + ' SD')
                        .join('mean + ' + newSD + ' SD')
                        .split(oldSD + ' standard deviations')
                        .join(newSD + ' standard deviations')
                        .split('(' + oldSD + ' * stddevPop')
                        .join('(' + newSD + ' * stddevPop')
                        .split('+ ' + oldSD + ' SD)')
                        .join('+ ' + newSD + ' SD)')
                }

                // Collect all metadata IDs that reference the SD value
                const metadataIds = [
                    config['\u00a7DE_THRESHOLD\u00a7'],
                    config['\u00a7DE_NOUTLIER_VAL\u00a7'],
                    config['\u00a7PD_THRESHOLD\u00a7'],
                    config['\u00a7IN_NOUTLIER_PROP\u00a7'],
                    config['\u00a7IN_OUTLIER_PROP\u00a7'],
                ].filter(Boolean)

                // Fetch affected data elements
                const deIds = [
                    config['\u00a7DE_THRESHOLD\u00a7'],
                    config['\u00a7DE_NOUTLIER_VAL\u00a7'],
                ].filter(Boolean)
                if (deIds.length) {
                    const deResult = await d2Get(
                        '/api/dataElements?filter=id:in:[' +
                            deIds.join(',') +
                            ']&fields=:owner&paging=false'
                    )
                    const updatedDEs = deResult['dataElements'].map(
                        function (de) {
                            de.name = replaceSD(de.name)
                            de.shortName = replaceSD(de.shortName)
                            de.description = replaceSD(de.description)
                            return de
                        }
                    )
                    if (updatedDEs.length) {
                        await d2PostJson('/api/metadata', {
                            dataElements: updatedDEs,
                        })
                    }
                }

                // Fetch affected predictors
                const pdId = config['\u00a7PD_THRESHOLD\u00a7']
                if (pdId) {
                    const pdResult = await d2Get(
                        '/api/predictors?filter=id:eq:' +
                            pdId +
                            '&fields=:owner&paging=false'
                    )
                    const updatedPDs = pdResult['predictors'].map(
                        function (pd) {
                            pd.name = replaceSD(pd.name)
                            pd.shortName = replaceSD(pd.shortName)
                            pd.description = replaceSD(pd.description || '')
                            if (pd.generator) {
                                pd.generator.expression = replaceSD(
                                    pd.generator.expression
                                )
                                pd.generator.description = replaceSD(
                                    pd.generator.description || ''
                                )
                                if (pd.generator.displayDescription) {
                                    pd.generator.displayDescription = replaceSD(
                                        pd.generator.displayDescription
                                    )
                                }
                            }
                            return pd
                        }
                    )
                    if (updatedPDs.length) {
                        await d2PostJson('/api/metadata', {
                            predictors: updatedPDs,
                        })
                    }
                }

                // Fetch affected indicators
                const inIds = [
                    config['\u00a7IN_NOUTLIER_PROP\u00a7'],
                    config['\u00a7IN_OUTLIER_PROP\u00a7'],
                ].filter(Boolean)
                if (inIds.length) {
                    const inResult = await d2Get(
                        '/api/indicators?filter=id:in:[' +
                            inIds.join(',') +
                            ']&fields=:owner&paging=false'
                    )
                    const updatedINs = inResult['indicators'].map(
                        function (ind) {
                            ind.name = replaceSD(ind.name)
                            ind.shortName = replaceSD(ind.shortName)
                            ind.description = replaceSD(ind.description || '')
                            return ind
                        }
                    )
                    if (updatedINs.length) {
                        await d2PostJson('/api/metadata', {
                            indicators: updatedINs,
                        })
                    }
                }

                // Update dataStore config
                config['\u00a7VAL_STDDEV\u00a7'] = newSD
                outliers[entryIndex] = { [baseId]: config }
                await d2PutJson('/api/dataStore/dqConfig/outliers', outliers)

                showNotification(
                    'Outlier threshold updated to ' + newSD + ' SD.',
                    'success'
                )
                await listConfig()
            } catch (error) {
                showNotification(
                    'Failed to update threshold: ' + error.message,
                    'error'
                )
            } finally {
                hideLoading()
            }
        }
    )
}
```

- [ ] **Step 4: Write Sections 10-11 (Tab Navigation + Form Logic)**

Append tab navigation event setup and form logic functions.

Tab navigation: handled in `load()` via event delegation on the tab nav container.

```javascript
// ============================================================
// 10. TAB NAVIGATION
// ============================================================
// (switchTab() is defined in Section 4 UI Helpers above)
// Tab click handler is bound in load() via event delegation.

// ============================================================
// 11. FORM LOGIC
// ============================================================

async function prepInputs() {
    const htmlCode = await makeSelect('dataSets', '?paging=false')
    el('selectDataSet').innerHTML = htmlCode

    el('selectDataSet').addEventListener('change', async function () {
        await updateDataElements()
        await makeSelectOuLevel()
        previewPossible()
    })

    // Data element change handler — uses data-catcombo attribute (Bug fix 1d)
    el('selectDataElement').addEventListener('change', async function () {
        const selected = el('selectDataElement')
        const selectedOption = selected.options[selected.selectedIndex]
        const catCombo = selectedOption ? selectedOption.dataset.catcombo : ''

        if (catCombo && catCombo.toLowerCase() !== 'default') {
            el('completenessSection').style.display = ''

            // Show/hide operand selector based on approach
            const showOperand = el('proxyApproach').checked
            el('selectDataElementOperand').style.display = showOperand
                ? ''
                : 'none'

            // Populate operand selector
            const dataElementId = selectedOption.value.split('.')[0]
            const operandResponse = await d2Get(
                '/api/dataElementOperands?filter=dataElement.id:like:' +
                    dataElementId +
                    '&fields=id,name&paging=false'
            )
            const operandHtml = ["<option value=''>[Select Operand]</option>"]
                .concat(
                    operandResponse['dataElementOperands'].map(
                        function (operand) {
                            return (
                                "<option value='" +
                                operand.id +
                                "'>" +
                                operand.name +
                                '</option>'
                            )
                        }
                    )
                )
                .join('')
            el('selectDataElementOperand').innerHTML = operandHtml
        } else {
            el('completenessSection').style.display = 'none'
            el('selectDataElementOperand').value = ''
        }

        previewPossible()
    })

    // Completeness approach radio handler
    document
        .querySelectorAll("input[name='completenessApproach']")
        .forEach(function (radio) {
            radio.addEventListener('change', async function () {
                const isProxyApproach = el('proxyApproach').checked
                el('selectDataElementOperand').style.display = isProxyApproach
                    ? ''
                    : 'none'

                if (isProxyApproach) {
                    // Re-populate operand selector
                    const selected = el('selectDataElement')
                    const selectedOption =
                        selected.options[selected.selectedIndex]
                    if (selectedOption && selectedOption.value) {
                        const dataElementId = selectedOption.value.split('.')[0]
                        const operandResponse = await d2Get(
                            '/api/dataElementOperands?filter=dataElement.id:like:' +
                                dataElementId +
                                '&fields=id,name&paging=false'
                        )
                        const operandHtml = [
                            "<option value=''>[Select Operand]</option>",
                        ]
                            .concat(
                                operandResponse['dataElementOperands'].map(
                                    function (operand) {
                                        return (
                                            "<option value='" +
                                            operand.id +
                                            "'>" +
                                            operand.name +
                                            '</option>'
                                        )
                                    }
                                )
                            )
                            .join('')
                        el('selectDataElementOperand').innerHTML = operandHtml
                    }
                } else {
                    el('selectDataElementOperand').value = ''
                }

                previewPossible()
            })
        })

    // Hide completeness section initially
    el('completenessSection').style.display = 'none'
}

async function updateDataElements() {
    try {
        const dataSetId = el('selectDataSet').value
        const dataElementsResponse = await d2Get(
            '/api/dataElements?filter=dataSetElements.dataSet.id:like:' +
                dataSetId +
                '&filter=valueType:in:[NUMBER,UNIT_INTERVAL,PERCENTAGE,INTEGER,INTEGER_POSITIVE,INTEGER_NEGATIVE,INTEGER_ZERO_OR_POSITIVE]' +
                '&fields=name,id,categoryCombo[name]&paging=false'
        )

        const dataElements = [...dataElementsResponse['dataElements']].sort(
            function (a, b) {
                return a.name.localeCompare(b.name)
            }
        )
        const dataElementIds = dataElements.map(function (obj) {
            return obj.id
        })

        // Fetch combined items (operands)
        const combinedItemsResponse = await d2Get(
            '/api/dataElementOperands?filter=dataElement.id:in:[' +
                dataElementIds.join(',') +
                ']&filter=id:like:.&fields=name,id,categoryOptionCombo[name]&paging=false'
        )
        const combinedItems = [
            ...combinedItemsResponse['dataElementOperands'],
        ].sort(function (a, b) {
            return a.name.localeCompare(b.name)
        })

        // Fetch already configured elements
        const configuredOutliers = await d2Get(
            '/api/dataStore/dqConfig/outliers'
        )
        const configuredElements = new Set(
            configuredOutliers.flatMap(function (ol) {
                return Object.keys(ol)
            })
        )

        // Bug fix 1d: Store catCombo name as data attribute
        // For data elements: use actual categoryCombo.name
        dataElements.forEach(function (de) {
            const isDefault = de.categoryCombo.name.toLowerCase() === 'default'
            const suffix = isDefault ? '(default)' : '(total)'
            de.displayName = de.name + ' ' + suffix
            de.catComboName = de.categoryCombo.name

            if (!hasObject(combinedItems, 'id', de.id)) {
                combinedItems.unshift(de)
            }
        })

        // For combined items (operands): set catComboName to "default"
        // since operands are already disaggregated and should NOT trigger completeness section
        combinedItems.forEach(function (item) {
            if (!item.catComboName) {
                item.catComboName = 'default'
            }
            if (!item.displayName) {
                const categoryOptionComboSuffix = item.categoryOptionCombo
                    ? ' - ' + item.categoryOptionCombo.name
                    : ''
                item.displayName = item.name + categoryOptionComboSuffix
            }
        })

        // Build select HTML
        const dataElementHtml = [
            "<option value=''>[Select data element]</option>",
        ]
            .concat(
                combinedItems.map(function (obj) {
                    const isDisabled = configuredElements.has(
                        obj.id.split('.')[0]
                    )
                    return (
                        "<option value='" +
                        obj.id +
                        "' data-catcombo='" +
                        obj.catComboName +
                        "'" +
                        (isDisabled ? ' disabled' : '') +
                        '>' +
                        obj.displayName +
                        '</option>'
                    )
                })
            )
            .join('')

        el('selectDataElement').innerHTML = dataElementHtml
    } catch (error) {
        showNotification(
            'Failed to update data elements: ' + error.message,
            'error'
        )
    }
}
```

- [ ] **Step 5: Write Section 12 (Initialization with check-then-create)**

Append the `initialise()` function with the **bug fix 1a** (check-then-create):

```javascript
async function findOrCreateGroup(
    apiPath,
    name,
    shortName,
    sharing,
    extraProps
) {
    // Check if group with this name already exists
    const searchResult = await d2Get(
        '/api/' +
            apiPath +
            '?filter=name:eq:' +
            encodeURIComponent(name) +
            '&fields=id&paging=false'
    )
    const existing = searchResult[apiPath]
    if (existing && existing.length > 0) {
        return existing[0]['id']
    }

    // Create new group
    const uids = await generateUids(1)
    const groupId = uids[0]
    const group = {
        id: groupId,
        name: name,
        sharing: sharing,
        ...extraProps,
    }
    if (shortName) group.shortName = shortName
    await d2PostJson('/api/' + apiPath, group)
    return groupId
}

async function initialise() {
    showLoading()
    try {
        const newBaseConfig = {}
        const data = await d2Get('/api/me?fields=id')
        const userId = data['id']

        // Create sharing template
        const tempUid = (await generateUids(1))[0]
        const makeSharingForGroup = function (groupId) {
            return {
                public: 'r-------',
                userGroups: {
                    [groupId]: {
                        access: 'rw------',
                        id: groupId,
                    },
                },
            }
        }

        // 1. User Group — check-then-create
        const ugSearch = await d2Get(
            '/api/userGroups?filter=name:eq:' +
                encodeURIComponent('DQ - DQ Config Admin') +
                '&fields=id,users[id]&paging=false'
        )
        const existingUGs = ugSearch['userGroups']
        let ugId

        if (existingUGs && existingUGs.length > 0) {
            ugId = existingUGs[0]['id']
            // Add current user if not already a member
            const members = existingUGs[0]['users'] || []
            const isMember = members.some(function (u) {
                return u.id === userId
            })
            if (!isMember) {
                const group = await d2Get(
                    '/api/userGroups/' + ugId + '?fields=:owner'
                )
                group.users.push({ id: userId })
                await d2PutJson('/api/userGroups/' + ugId, group)
            }
        } else {
            ugId = (await generateUids(1))[0]
            await d2PostJson('/api/userGroups', {
                id: ugId,
                name: 'DQ - DQ Config Admin',
                sharing: makeSharingForGroup(ugId),
                users: [{ id: userId }],
            })
        }
        newBaseConfig['userGroup'] = ugId

        const sharing = makeSharingForGroup(ugId)

        // 2. Data Element Group
        newBaseConfig.dataElementGroup = await findOrCreateGroup(
            'dataElementGroups',
            'DQ - Data quality data elements',
            'DQ data elements',
            sharing
        )

        // 3. Indicator Group
        newBaseConfig.indicatorGroup = await findOrCreateGroup(
            'indicatorGroups',
            'DQ - Data quality indicators',
            'DQ indicators',
            sharing
        )

        // 4. Predictor Groups (4x)
        newBaseConfig.predictorGroup = await findOrCreateGroup(
            'predictorGroups',
            'DQ - Data quality predictors (all)',
            'DQ predictors',
            sharing
        )
        newBaseConfig.predictorGroupThreshold = await findOrCreateGroup(
            'predictorGroups',
            'DQ - Data quality predictors (thresholds)',
            null,
            sharing
        )
        newBaseConfig.predictorGroupAnalysis = await findOrCreateGroup(
            'predictorGroups',
            'DQ - Data quality predictors (analysis)',
            null,
            sharing
        )
        newBaseConfig.predictorGroupConsistency = await findOrCreateGroup(
            'predictorGroups',
            'DQ - Data quality predictors (consistency)',
            null,
            sharing
        )

        // Save to dataStore
        await d2PostJson('/api/dataStore/dqConfig/baseConfig', newBaseConfig)
        await d2PostJson('/api/dataStore/dqConfig/outliers', [])
        await d2PostJson('/api/dataStore/dqConfig/consistency', [])
        await d2PostJson('/api/dataStore/dqConfig/completeness', [])

        showNotification('Initialisation complete.', 'success')
        hideModal('initialiseModal')
        load()
    } catch (error) {
        showNotification('Initialisation failed: ' + error.message, 'error')
    } finally {
        hideLoading()
    }
}
```

Note: Uses `predictorGroupThreshold` (not `Treshold` — bug fix 1c). The `findOrCreateGroup` helper implements the check-then-create pattern from spec 1a.

- [ ] **Step 6: Write Section 12 continued (Migration) + Section 13 (Load)**

Append the migration function and the main `load()` entry point:

```javascript
async function migrateBaseConfig(config) {
    let changed = false

    // Bug fix 1c: migrate "predictorGroupTreshold" → "predictorGroupThreshold"
    if (
        config['predictorGroupTreshold'] &&
        !config['predictorGroupThreshold']
    ) {
        config['predictorGroupThreshold'] = config['predictorGroupTreshold']
        delete config['predictorGroupTreshold']
        changed = true
    }

    if (changed) {
        await d2PutJson('/api/dataStore/dqConfig/baseConfig', config)
    }

    return config
}

// ============================================================
// 13. LOAD & EVENT BINDING
// ============================================================

async function load() {
    // Tab navigation — event delegation
    el('tabNav').addEventListener('click', function (e) {
        const tab = e.target.closest('.dhis2-tab')
        if (tab && tab.dataset.tab) {
            e.preventDefault()
            switchTab(tab.dataset.tab)
        }
    })

    // Initialisation modal buttons
    el('btnInitialise').addEventListener('click', initialise)
    el('btnCancelInit').addEventListener('click', function () {
        window.location.href = '../..'
    })

    // Import button
    el('buttonImport').addEventListener('click', async function () {
        const outlierConfig = currentImport['outlierConfig']
        if (
            !confirm(
                "Configure data quality metrics metadata for '" +
                    outlierConfig['\u00a7NAME\u00a7'] +
                    "'?"
            )
        ) {
            return
        }

        showLoading()
        el('resultSection').style.display = 'none'

        try {
            const results = [
                ...(await importOutlier()),
                ...(await importConsistency()),
                ...(await importCompleteness()),
            ]

            el('resultSection').style.display = ''
            el('resultTableContainer').innerHTML = generateResultsTable(results)
        } catch (error) {
            showNotification('Import failed: ' + error.message, 'error')
        } finally {
            hideLoading()
        }
    })

    // Preview button
    el('buttonPreview').addEventListener('click', previewConfiguration)

    // Form field change handlers for previewPossible validation
    el('selectDataSet').addEventListener('change', previewPossible)
    el('selectDataElement').addEventListener('change', previewPossible)
    el('selectOuLevel').addEventListener('change', previewPossible)
    el('selectThreshold').addEventListener('change', previewPossible)

    // Check if dataStore exists
    try {
        const dataStore = await d2Get('/api/dataStore')

        if (dataStore && dataStore.includes('dqConfig')) {
            baseConfig = await d2Get('/api/dataStore/dqConfig/baseConfig')
            baseConfig = await migrateBaseConfig(baseConfig)

            el('buttonPreview').disabled = true
            listConfig()
        } else {
            showModal('initialiseModal')
        }

        await prepInputs()
    } catch (error) {
        showNotification('Failed to load app: ' + error.message, 'error')
    }
}

load()
```

- [ ] **Step 7: Verify file structure**

Read through the complete `src/app.js` and verify:

- All 13 sections are present in order
- No duplicate function declarations
- No `$` or `jQuery` references remain
- No `var` declarations (all `let`/`const`)
- All `"treshold"` occurrences are corrected to `"threshold"`
- All `alert()` calls are replaced with `showNotification()`
- ESLint formatting: 4-space indent, double quotes, semicolons

- [ ] **Step 8: Commit**

```bash
git add src/app.js
git commit -m "feat: complete app.js rewrite — edit/delete, init bug fix, vanilla JS"
```

---

## Task 6: Build Verification and Lint

**Files:** All modified files

- [ ] **Step 1: Install dependencies**

```bash
cd /tool-dq-config && yarn install 2>&1 | tail -5
```

Expected: completes without errors (jQuery packages no longer needed).

- [ ] **Step 2: Run lint**

```bash
cd /tool-dq-config && yarn run lint 2>&1
```

Fix any ESLint errors. Common issues:

- Missing semicolons
- Wrong indent (must be 4 spaces)
- Wrong quotes (must be double quotes)
- Unused variables

- [ ] **Step 3: Run build**

```bash
cd /tool-dq-config && yarn run build 2>&1
```

Expected: builds successfully to `build/` directory. If there are webpack errors related to removed jQuery, verify the ProvidePlugin was removed correctly.

- [ ] **Step 4: Fix any issues found in steps 2-3**

Iterate on lint and build errors until both pass clean.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "fix: resolve lint and build issues"
```

---

## Dependency Graph

```
Task 1 (package.json + webpack) ──┐
Task 2 (style.css)                ├──→ Task 4 (app.js core) ──→ Task 5 (app.js rest) ──→ Task 6 (build + lint)
Task 3 (index.html)              ─┘
```

Tasks 1, 2, and 3 can run in parallel. Task 4 depends on all three (needs package cleanup done and HTML IDs finalized). Task 5 depends on Task 4 (appends to same file). Task 6 depends on all.
