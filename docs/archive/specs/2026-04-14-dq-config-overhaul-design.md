# DQ Config App Overhaul — Design Spec

**Date:** 2026-04-14
**Scope:** Bug fixes, jQuery removal, DHIS2 design system CSS, edit/delete configurations, UX improvements

## Overview

A clean rewrite of `app.js`, `index.html`, and `style.css` to fix reported bugs, remove jQuery/jQuery UI dependencies, apply DHIS2 design system styling, and add edit/delete capability for existing configurations. `d2api.js` and `templates.js` remain untouched. `webpack.config.js` receives a minimal edit to remove jQuery-specific configuration. The legacy header bar script (`src/resources/dhis-header-bar.js`) is unchanged.

## 1. Bug Fixes

### 1a. Duplicate Name Conflict on Initialization (Reported Bug)

**Problem:** `initialise()` POSTs 7 groups with hardcoded names without checking if groups with those names already exist. DHIS2 returns 409 for most types; user groups create duplicates. After the first failure the function stops, leaving partial state.

**Fix:** Check-then-create pattern for each group:

```
For each group (userGroup, dataElementGroup, indicatorGroup, 4x predictorGroups):
  1. GET /api/{type}?filter=name:eq:{expected name}&fields=id&paging=false
  2. If match found → reuse existing ID, skip creation
  3. If no match → generate UID, POST new group
  4. Store ID in baseConfig either way
```

For user groups specifically: if reusing an existing group, add the current user to it if not already a member.

Error handling: if any group creation fails, show an error notification and stop — do not save partial baseConfig to the dataStore.

### 1b. Missing Array Brackets (line 809)

**Problem:** `results.push("Outlier - Add to groups", error["status"])` pushes two separate values instead of one array.

**Fix:** `results.push(["Outlier - Add to groups", error["status"]])`

### 1c. Typo: `predictorGroupTreshold`

**Problem:** Misspelled key used throughout the codebase and stored in the dataStore.

**Fix:** Rename to `predictorGroupThreshold` everywhere, including:

- The `baseConfig` dataStore key
- The internal `"treshold"` / `"analysis"` object keys returned by `splitOutlierPredictors()` → rename to `"threshold"` / `"analysis"`
- All call sites that read `splitOutlierPredictors(...)["treshold"]` → `["threshold"]`

Add migration in the `load()` function:

```
When reading baseConfig from dataStore:
  if "predictorGroupTreshold" key exists and "predictorGroupThreshold" does not:
    copy value to "predictorGroupThreshold"
    delete "predictorGroupTreshold"
    PUT updated baseConfig back to dataStore
```

### 1d. Fragile Category Combo Parsing

**Problem:** The completeness section visibility is determined by parsing the category combo name from the option's display text using a regex: `selectedElement.text().match(/\((.*?)\)$/)`. This breaks if data element names contain parentheses.

**Fix:** Store the category combo name as a `data-catcombo` attribute on each `<option>` element when building the data element select. The attribute holds the original `categoryCombo.name` from the API response (e.g., `"default"`, `"Age/Sex"`). The completeness section is shown when the selected option's `data-catcombo` is NOT `"default"` — i.e., the data element is disaggregated. For combined items (data element operands), set `data-catcombo="default"` since operands are already disaggregated. For "total" entries (aggregated across all category option combos), set `data-catcombo` to the actual category combo name (non-default), which triggers the completeness section.

## 2. DHIS2 Design System CSS

### Design Tokens (CSS Custom Properties)

```css
:root {
    --dhis2-primary: #1565c0;
    --dhis2-primary-dark: #0d47a1;
    --dhis2-primary-light: #e3f2fd;
    --dhis2-header: #2c6693;
    --dhis2-bg: #f4f6f8;
    --dhis2-surface: #ffffff;
    --dhis2-border: #d5dde5;
    --dhis2-text: #212934;
    --dhis2-text-secondary: #6e7a8a;
    --dhis2-text-label: #4a5768;
    --dhis2-success: #1b5e20;
    --dhis2-success-bg: #e8f5e9;
    --dhis2-error: #b71c1c;
    --dhis2-error-bg: #ffebee;
    --dhis2-warning: #e65100;
    --dhis2-warning-bg: #fff3e0;
    --dhis2-radius: 4px;
    --dhis2-font: 'Roboto', system-ui, -apple-system, sans-serif;
}
```

### Component Styles

**Tabs:** Horizontal text links along a bottom border. Active tab: `border-bottom: 2px solid var(--dhis2-primary)`, `color: var(--dhis2-text)`, `font-weight: 500`. Inactive: `color: var(--dhis2-text-secondary)`.

**Cards:** `background: var(--dhis2-surface)`, `border: 1px solid var(--dhis2-border)`, `border-radius: var(--dhis2-radius)`, `padding: 20px`.

**Buttons:**

- Primary: `background: var(--dhis2-primary)`, white text, 4px radius, 500 weight, 8px 24px padding.
- Destructive: `background: var(--dhis2-error)`, white text. Used for delete confirmation.
- Disabled: gray background, `cursor: not-allowed`.

**Form controls (selects, inputs):** Full-width, `border: 1px solid #a0adba`, 4px radius, 8px 12px padding, 14px font. Focus: blue border + `box-shadow: 0 0 0 3px rgba(21,101,192,0.1)`.

**Labels:** 13px, `color: var(--dhis2-text-label)`, `font-weight: 500`, block display, 4px bottom margin.

**Notifications:** Top-of-content banners with left border accent. Info = blue, success = green, error = red, warning = orange. Auto-dismiss after 5 seconds for success/info. Errors persist until dismissed via close button.

**Status chips:** Inline pill indicators on config cards. Active = `background: #d5e5f5; color: var(--dhis2-primary)`. Inactive = `background: #e8edf2; color: var(--dhis2-text-secondary)`.

**Modal dialog:** Centered white card on a semi-transparent dark overlay. Used for initialization prompt and delete confirmation.

**Tables:** Header row with `background: var(--dhis2-bg)`, 1px borders, 8px cell padding.

### Font Loading

Load Roboto 400/500 via Google Fonts `<link>` in `index.html`. Fallback to `system-ui, -apple-system, sans-serif`.

### Layout

- App body: `background: var(--dhis2-bg)`, padded content area below the DHIS2 header bar.
- Single-column form layout (selects are wide, two-column would compress too much).
- Tabs as a `<nav>` element above the content sections.
- Each tab's content in a `<section>` with `data-tab` attribute, shown/hidden via JS.

## 3. jQuery Removal

### Dependencies to Remove

From `package.json`:

- `jquery`
- `webpack-jquery-ui`

From `webpack.config.js`: remove the `webpack.ProvidePlugin` block that injects `$`, `jQuery`, and `window.jQuery` globally (lines 117-121). This is the only jQuery-specific configuration in webpack. The generic CSS and SCSS loader rules must remain — they handle the app's own CSS. The SCSS rule is technically unused after removing jQuery UI (no source files use SCSS), but can remain harmlessly as a no-op.

### Replacement Pattern

| jQuery                 | Vanilla JS                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `$("#id")`             | `el("id")` helper: `function el(id) { return document.getElementById(id); }` — ID-only lookup, returns null if not found |
| `.val()`               | `.value`                                                                                                                 |
| `.html(str)`           | `.innerHTML = str`                                                                                                       |
| `.show()`              | `.style.display = ""`                                                                                                    |
| `.hide()`              | `.style.display = "none"`                                                                                                |
| `.toggle(bool)`        | `.style.display = bool ? "" : "none"`                                                                                    |
| `.prop("disabled", x)` | `.disabled = x`                                                                                                          |
| `.on("change", fn)`    | `.addEventListener("change", fn)`                                                                                        |
| `.find(":selected")`   | `.options[el.selectedIndex]`                                                                                             |
| `.is(":checked")`      | `.checked`                                                                                                               |
| `.is(":visible")`      | `.style.display !== "none"`                                                                                              |
| `$("#tabs").tabs()`    | Custom tab switching via `data-tab` attributes                                                                           |

### Event Binding

Remove all `onclick` attributes from HTML. Bind events in JS via `addEventListener` at the end of `app.js` (in the load/init section). No `window.` globals needed.

## 4. Edit & Delete Configurations

### Delete

**UI:** Each config card on the overview tab gets a small delete button (text button, destructive color) in the card header.

**Flow:**

1. User clicks delete on a config card
2. DHIS2-styled confirmation modal: "Remove DQ configuration for '{name}'? The DHIS2 metadata (data elements, predictors, indicators) will not be deleted."
3. On confirm:
   a. Remove the entry from the relevant dataStore array(s) — check all three (`outliers`, `consistency`, `completeness`) since a single data element may have entries in each. **Key matching:** outlier and consistency entries are keyed by bare data element ID (e.g., `"aBc12eFgHiJ"`). Completeness entries may be keyed by data element operand ID (e.g., `"aBc12eFgHiJ.xYz98765432"`). When deleting, match on both the exact key AND the base ID (`key.split(".")[0]`) to catch completeness entries that belong to the same data element.
   b. Remove items from their respective metadata groups. For outliers: remove from data element group, indicator group, all predictor group, threshold predictor group, analysis predictor group. For consistency: remove from data element group, indicator group, all predictor group, consistency predictor group. For completeness (standard): remove from indicator group only. For completeness (disaggregated): remove from indicator group only (predictors/data elements are not added to groups in the current implementation).
   c. PUT updated dataStore arrays
4. Show success/error notification
5. Refresh config list

**Does NOT delete DHIS2 metadata** — data elements, predictors, and indicators may have associated data values. Removing from groups and dataStore is safe; actual metadata deletion is an admin task.

### Edit

**Scope:** Edit the outlier threshold (standard deviations) for an existing configuration. Other parameters (data element, org unit level) are embedded in predictor expressions and require delete + re-create.

**UI:** Each config card with outlier configuration gets an edit button. Clicking it shows an inline form on the card with a number input for the new SD value and save/cancel buttons.

**Flow:**

1. User clicks edit, enters new SD value
2. On save:
   a. Read the outlier config from dataStore
   b. Update `§VAL_STDDEV§` in the stored config
   c. Fetch each piece of metadata that references the SD value via their stored IDs:
    - Threshold data element (`§DE_THRESHOLD§`): name contains `"mean + {OLD} SD"`
    - Threshold predictor (`§PD_THRESHOLD§`): expression contains `"{OLD} * stddevPop"`, name/description contain `"mean + {OLD} SD"`
    - Non-outlier value data element (`§DE_NOUTLIER_VAL§`): description contains `"mean + {OLD} SD"`
    - Outlier indicators (`§IN_NOUTLIER_PROP§`, `§IN_OUTLIER_PROP§`): description contains `"{OLD} standard deviations"`
      d. Update using targeted patterns (not bare value replacement, to avoid corrupting unrelated numbers):
    - `"mean + {OLD} SD"` → `"mean + {NEW} SD"` (in names and descriptions)
    - `"{OLD} standard deviations"` → `"{NEW} standard deviations"` (in descriptions)
    - `"({OLD} * stddevPop"` → `"({NEW} * stddevPop"` (in predictor expressions)
    - `"+ {OLD} SD)"` → `"+ {NEW} SD)"` (in names)
      e. PUT each updated metadata object back via `/api/metadata`
      f. PUT updated config to dataStore
3. Show success/error notification
4. Refresh config list

**For non-threshold edits:** The card shows a note: "To change data element or org unit level, delete and re-create the configuration."

## 5. UX Improvements

### Loading States

- A loading overlay (semi-transparent with a CSS spinner) shown during:
    - Initialization
    - Preview generation
    - Metadata import
    - Edit save
    - Delete operation
- All action buttons disabled during operations to prevent double-clicks.

### Notification System

Replace all `alert()` calls with a notification banner system:

```
function showNotification(message, type = "info")
  type: "info" | "success" | "warning" | "error"
  - Rendered as a banner at the top of the active tab content
  - Left border accent color matching type
  - Auto-dismiss after 5s for info/success
  - Errors/warnings persist until dismissed via X button
  - Multiple notifications stack
```

### Import Results

Style the results table as a DHIS2 card with row-level color coding:

- SUCCESS rows: green text/icon
- ERROR rows: red text/icon with error detail

### Configuration Overview

- Summary count at top: "N data elements configured" (count of unique data elements, deduplicated across outlier/consistency/completeness configs)
- Empty state when no configurations: friendly message + prompt to go to "Add new" tab
- Each card shows: name, data set, data element ID, and chips for which config types are present (outliers with SD value, consistency, completeness)

### Initialization Modal

Restyle as DHIS2 modal: white card centered on dark overlay, proper heading, descriptive text, primary + secondary buttons. The "Cancel" button redirects to `"../.."` (the DHIS2 apps list), matching the current `closeApp()` behavior.

## 6. App.js Structure

Organized into clearly commented sections, top to bottom:

```javascript
// ============================================================
// 1. IMPORTS
// ============================================================

// 2. STATE
// baseConfig, currentImport

// 3. UTILITY HELPERS
// el(), generateUids(), defaultCoCId(), indicatorTypePercentId(),
// hasObject(), shareMetadata()

// 4. UI HELPERS
// showNotification(), showLoading(), hideLoading(),
// showModal(), hideModal()

// 5. METADATA CONFIGURATION
// configureOutlierMetadata(), configureConsistencyMetadata(),
// configureCompletenessMetadata(), configureCompletenessDisaggregatedMetadata()

// 6. METADATA GROUP MANAGEMENT
// addToDeGroup(), addToInGroup(), addToPdGroup(),
// removeFromDeGroup(), removeFromInGroup(), removeFromPdGroup()
// splitOutlierPredictors()

// 7. IMPORT FUNCTIONS
// importOutlier(), importConsistency(), importCompleteness(), importMetadata()

// 8. PREVIEW
// previewConfiguration(), previewPossible()

// 9. CONFIGURATION OVERVIEW (list, edit, delete)
// listConfig(), deleteConfig(), editOutlierThreshold()

// 10. TAB NAVIGATION
// switchTab() — data-driven, easy to extend

// 11. FORM LOGIC
// prepInputs() (renamed from prepOutlierInputs — handles all form setup, not just outliers),
// updateDataElements(), makeSelectOuLevel()

// 12. INITIALIZATION
// initialise() — with check-then-create
// migrateBaseConfig() — typo fix migration

// 13. LOAD & EVENT BINDING
// load() — entry point
```

### Tab System (Extensibility)

```html
<nav class="dhis2-tabs">
    <a class="dhis2-tab active" data-tab="configure">Add new</a>
    <a class="dhis2-tab" data-tab="overview">Configuration</a>
    <a class="dhis2-tab" data-tab="info">Instructions</a>
    <!-- Future tabs just add another <a> here -->
</nav>

<section id="tab-configure" class="tab-content active">...</section>
<section id="tab-overview" class="tab-content">...</section>
<section id="tab-info" class="tab-content">...</section>
<!-- Future tabs add a matching <section> -->
```

Tab switching logic reads `data-tab` from the clicked element, hides all `.tab-content` sections, shows the matching one, and updates the active class. No hardcoded tab names in the JS.

## Files Changed

| File                               | Change                                                          |
| ---------------------------------- | --------------------------------------------------------------- |
| `src/app.js`                       | Full rewrite                                                    |
| `src/index.html`                   | Full rewrite                                                    |
| `src/css/style.css`                | Full rewrite                                                    |
| `package.json`                     | Remove `jquery`, `webpack-jquery-ui` from dependencies          |
| `webpack.config.js`                | Remove `webpack.ProvidePlugin` block for jQuery (lines 117-121) |
| `src/js/d2api.js`                  | No changes                                                      |
| `src/js/templates.js`              | No changes                                                      |
| `src/resources/dhis-header-bar.js` | No changes                                                      |

## Out of Scope

- Search/filter on config list
- Bulk operations
- Undo for delete
- Export/import of configurations
- Changes to `templates.js` or `d2api.js`
- React or any framework
- Dark mode
