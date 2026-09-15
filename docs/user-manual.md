# DHIS2 Data Quality Configuration — User Manual

This app helps administrators set up automated data-quality metadata in DHIS2 for a chosen data element. From a single form, it generates three families of DQ metrics (outliers, consistency, and completeness) as DHIS2 indicators plus one outlier-threshold predictor — no manual metadata editing required.

The app has three tabs:

- **Add new** — configure a new data element
- **Configuration** — review, edit, or remove existing configurations
- **Instructions** — in-app quick reference

![Add new tab, empty state](images/user-manual/01-add-new-empty.png)

---

## The three DQ metrics

| Metric           | What it measures                                                                                                             | Generated metadata                        |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| **Outliers**     | Values above a per-org-unit outlier threshold, computed monthly from the previous 12 months (modified Z-score or mean + SD). | 1 data element, 1 predictor, 3 indicators |
| **Consistency**  | Whether an org unit reports in all / any of the last 12 months.                                                              | 1 indicator                               |
| **Completeness** | 100 × (org units reporting) / (reports expected).                                                                            | 1 indicator                               |

Seven objects in total per configured data element. The outliers family has three indicators: the two percentages above, plus **"outlier values"**, which reports the reported value itself whenever it exceeds the threshold (blank otherwise), for dashboards and pivot tables that list the outlying values — it aggregates to the sum of those values. The consistency and completeness metrics are pure indicators — they compute their per-facility logic at analytics query time using indicator `subExpression()` (available since DHIS2 2.40.2), so they need no scheduled job and never go stale. Only the outlier threshold is a stored value written by a predictor, because its calculation (median/MAD or mean/SD over a 12-month window) cannot be expressed in an indicator.

> The pre-platform (vanilla JS) versions of this tool instead generated a chain of up to 8 predictors and 8 intermediate data elements per configuration. Configurations created that way keep working and remain viewable, editable and removable in the app. See `hybrid-templates.md` for the rationale and the (small, deliberate) output differences.

The generated items are added to app-managed DHIS2 metadata groups so the app can track them for later edit/remove.

---

## Adding a new configuration

### 1. Select a data set

Click the field to open the list, type in the filter box to narrow it down, then click the data set. Data sets with the "Monthly" period type are fully supported automatically.

![Data set filter in use](images/user-manual/02-filter-dataset.png)

### 2. Select a data element

Once a data set is chosen, the data element list populates with that data set's members.

![Data element dropdown populated after data set selection](images/user-manual/03-after-dataset.png)

### 3. Choose a disaggregation

For data elements with a non-default category combo, a disaggregation list appears. Pick either:

- A **specific category option combo** — the DQ checks target only that combo. Completeness is computed from that combo only.
- **Total (all disaggregations combined)** — the DQ checks target the data element total. In this case you must also choose a **completeness approach** (see next step).

![Disaggregation list with "Total" selected, completeness approach shown](images/user-manual/05-total-completeness.png)

#### Completeness approach (only when "Total" is selected)

- **Use one category option combo as proxy** — treats a single combo's reporting as a proxy for overall completeness. Pick the combo from the dropdown.
- **Count as complete when any category option combo has a value** — any reported combo counts as reported.

Both approaches generate a single completeness indicator; they differ only in which value the indicator's numerator checks (the proxy combo vs. the data element total).

### 4. Select an organisation unit level

Only levels that the data set is assigned to are enabled. Levels the data set is not assigned to appear greyed out with a "(not assigned to data set)" hint.

### 5. Choose the outlier detection method

- **Modified Z-score (recommended, default)** — the threshold is `median + k × MAD / 0.6745` over the previous 12 months. Robust against the outliers it is trying to detect, and the method generally recommended for health data. One caveat: a facility whose 12 window values are all identical has MAD = 0, so any increase is flagged — inherent to the method (DHIS2's built-in outlier tools share it).
- **Standard deviations from mean** — the threshold is `mean + k × SD` (population SD, matching DHIS2's built-in outlier statistics). The method used by earlier versions of this tool, and the fallback for very flat series.

### 6. Set the outlier threshold

The threshold value _k_ depends on the method:

| Method                        | Default | Permitted range |
| ----------------------------- | ------- | --------------- |
| Modified Z-score              | 3.5     | 2.5 – 5.0       |
| Standard deviations from mean | 3.0     | 2.0 – 4.0       |

Both in 0.1 steps. Switching method resets the value to that method's default.

### 7. Click Preview

![Completed form ready for preview](images/user-manual/06-form-complete.png)

---

## Reviewing the preview

The Preview card shows every data element, predictor, and indicator the app will create, grouped by metric family. Review carefully: once imported, these objects will be created in DHIS2.

![Preview card showing outliers, consistency, and completeness metadata](images/user-manual/07b-preview-card.png)

Notes:

- Only the outliers family has data element and predictor rows. Consistency and completeness generate only an indicator each, so their data element and predictor tables show **N/A**.
- Non-monthly data sets trigger a warning — period-related expressions in the generated metadata are only correct for monthly data sets.

### Conflict detection

Before you click Import, the app checks the target DHIS2 instance for existing data elements, predictors, and indicators that already use any of the proposed `name` or `shortName` values.

If conflicts are found:

- Conflicting cells are highlighted with an orange background and a `⚠` marker.
- The **Import** button is disabled.
- A **⚠ already exists** legend appears next to the Import button explaining the marker.
- A warning notification summarises the count.

![Preview with conflicts — Import disabled, cells highlighted](images/user-manual/13b-conflicts-preview-card.png)

**How to resolve:** the conflicts are usually because the data element has already been configured in a previous session. Check the Configuration tab — if it's there, either keep it as-is or remove it and re-configure with different parameters.

---

## Running the import

Click **Import** to create the metadata in DHIS2. Confirm the prompt, then wait for the results card to appear. Each step of the import (per metric family: metadata POST, group memberships, and DataStore config save) is reported with an `OK` or error status.

![Import results with all steps OK](images/user-manual/08b-import-results-card.png)

The preview is replaced by the results card once the import completes. Click **Close** to dismiss the results; the form keeps its selections (the just-configured data element is now disabled in the list), so configuring another data element only requires changing the fields that differ.

You can switch to the Configuration or Instructions tab at any point — the form and any un-imported preview are kept when you come back.

### After the import: scheduling and analytics

- The **consistency and completeness indicators** work as soon as the next analytics run completes — nothing to schedule.
- The **outlier metrics** additionally need the threshold predictor to run. Schedule a _predictor_ job (Scheduler app) covering the predictor group **"DQ - Data quality predictors (thresholds)"** (or "(all)"), typically nightly before the analytics job. There is only one predictor per configuration and no ordering constraints between predictors. Outlier values appear after the first predictor run followed by an analytics run.

---

## Reviewing existing configurations

The **Configuration** tab lists every data element that has at least one DQ configuration stored in this app's DataStore.

![Configuration overview with several configured data elements](images/user-manual/09-overview.png)

Each card shows:

- The data element name and parent data set
- Chips indicating which metrics are configured. The outliers chip includes the method and threshold, e.g. **Outliers (modified-Z 3.5)** or **Outliers (mean + 3 SD)**; configurations from the pre-platform tool show **Outliers (3 SD)**.
- **Edit** and **Remove** buttons
- **Show details** to expand a per-metric breakdown of every metadata object's UID

![Expanded configuration with full metadata details](images/user-manual/10-overview-expanded.png)

Expanding details on one card only enlarges that card — the others stay at their natural height.

### Missing-metadata warning

If any metadata object referenced by a configuration has been deleted outside this app, the card shows an orange "⚠ N missing metadata" chip. Hover for a tooltip listing which objects are missing. This usually means either a user deleted something via the Maintenance app, or a metadata export/import reshuffled UIDs.

---

## Editing a configuration

Click **Edit** on a card to change the outlier threshold. A small inline form appears under the card (an expanded details section collapses automatically so the form is visible). The form uses the ranges of the configuration's own method — you can change the _k_ value, but not switch method; to change method, data element, or organisation unit level, remove the configuration and re-create it.

![Inline edit form for outlier threshold](images/user-manual/11-edit-form.png)

Saving will:

1. Update the threshold predictor's generator expression to use the new _k_
2. Update the names and descriptions of the threshold data element, the predictor, and the three outlier indicators to reflect the new threshold text
3. Save the new threshold to the DataStore entry

Already-stored threshold values keep the old _k_ until the predictor job next runs.

---

## Removing a configuration

Click **Remove** on a card. A confirmation modal appears.

![Remove Configuration modal with metadata-delete checkbox](images/user-manual/12-delete-modal.png)

By default the app only removes its own DataStore entry — the generated DHIS2 metadata is left in place. Tick **"Also delete the generated DHIS2 metadata"** to have the app attempt to delete the data elements, predictors, and indicators as well.

### Safety checks before metadata deletion

Each of the three metrics (outliers, consistency, completeness) is treated as an atomic group. For that group's metadata to be deleted, every item in it must pass three checks:

1. **Ownership** — the item must still belong to this app's metadata groups.
2. **No edits** — the item's `lastUpdated − created` must be < 5 seconds, i.e. untouched since import. Edits made through this app (outlier-threshold changes) are recorded in the DataStore and do not count as manual edits.
3. **Template match** — the item's current `name` and `description` must still match the template's text pattern (indicating no one renamed it).

If any item in a group fails any check, the whole group is skipped and its DHIS2 metadata is left alone. The DataStore entry is still removed either way.

External references (e.g. a dashboard favorite using one of the indicators) are caught by the delete itself: each DELETE call is atomic per object type, so a blocked object makes that call fail without deleting anything else, and the failure is reported. (Earlier versions attempted a dry-run DELETE as a fourth check, but DHIS2 ignores `dryRun=true` for DELETE imports and deletes the objects for real, so the dry-run was removed.)

### Ordered deletion

When deleting metadata the app issues three separate DELETE calls per metric, in this order:

1. Indicators (nothing within the metric references them)
2. Predictors (same)
3. Data elements (safe to delete now that referencing indicators and predictors are gone)

This avoids DHIS2 refusing a single-payload delete because a data element is still referenced by the indicators/predictors being deleted alongside it.

On DHIS2 2.43, deleting the outlier-threshold **data element** can additionally be blocked by the _data value changelog_ once the predictor has run (past predicted values reference the data element in the audit trail). The app reports this as a delete failure for that object type; the indicators and predictor are still deleted.

### Result notification

After the modal closes you'll see a single notification:

- All checks succeeded: `Config removed. Outliers metadata: deleted. Consistency metadata: deleted. Completeness metadata: deleted.` (notification style: success)
- One or more skipped: lists the reason per metric (e.g. `Consistency metadata: skipped (Facilities consistently reporting (indicator) 'xyz' description no longer matches template)`). Notification style: warning.
- One or more failed to delete despite passing safety checks: reports the type that failed (`Outliers metadata: delete failed (indicators: ...)`). This usually means the item has an external reference that only became visible at real delete time (e.g. a dashboard favorite, or the 2.43 changelog case above).

Open the browser console (`perCheckResults`) for the full per-candidate detail after a deletion.

---

## Instructions tab

A short in-app reference covering the same material in brief.

![Instructions tab](images/user-manual/14-instructions.png)

---

## Glossary

- **DataStore** — a per-namespace key/value store DHIS2 exposes at `/api/dataStore`. This app stores its configs in the `dqConfig` namespace under three keys (`outliers`, `consistency`, `completeness`), each holding a list of per-DE entries.
- **Predictor** — a DHIS2 object that runs a formula over historical data and writes the result to a designated data element. Only the outlier threshold relies on a predictor.
- **Indicator** — a DHIS2 formula that combines numerator and denominator expressions into a calculated value. Used here to express percentages.
- **subExpression()** — an indicator expression function (DHIS2 2.40.2+) that evaluates its content once per data-registration org unit and period before aggregating. It is what lets the consistency, completeness, and outlier indicators count _facilities_ ("did this facility report?", "is this facility's value above its threshold?") without any stored intermediate values.
- **Category option combo (CoC)** — a specific combination of category options. Disaggregated data elements store a value per CoC; the "default" CoC represents the undisaggregated total.

---

## Known limitations

- Requires DHIS2 **2.40.2 or later** (multi-item `subExpression()` with `periodOffset`); the app's declared minimum version is 2.41.
- The instance must have an indicator type with **factor 1** (e.g. "Number"), which the outlier-values indicator uses; without one, Preview reports an error. Every standard DHIS2 database ships one.
- Only monthly data sets are fully automated. Configuring against a non-monthly data set emits a warning; the generated expressions must be adjusted by hand.
- **Use the generated indicators in monthly layouts only.** The 12-month windows inside the indicators follow the _query's_ period type: in a quarterly chart the consistency indicator silently means "last 12 quarters". (The threshold predictor itself is always monthly.)
- Instances running the **Doris analytics backend** are not yet supported — subExpression indicators generate PostgreSQL-specific SQL ([DHIS2-21793](https://dhis2.atlassian.net/browse/DHIS2-21793)).
- Only the outlier threshold value can be edited in place; any other change requires remove + re-create.
- Cross-instance portability is not supported — the DataStore stores UIDs, which differ between instances. Exporting metadata and importing to another instance will orphan the references.
- `code` fields are not set on any generated metadata, so no `code` conflict check is performed during preview.

---

## Appendix — Testing notes

This manual (text and screenshots) was produced by walking through every flow against a live DHIS2 2.43.1 test instance (Laos HMIS demo database) with the app installed via `POST /api/apps`. Screenshots were captured at 1280×800.

For anyone reproducing or extending the tests:

1. A parameterized end-to-end suite covering the full lifecycle (initialise → configure → preview → import → verify → edit threshold → delete incl. metadata) lives at `tests/e2e/lifecycle.sh`, and an env-gated live Jest test (`LIVE_DHIS2=… pnpm run test`) covers the same lifecycle plus a predictor run and server-side expression validation. Both are frame-aware where relevant: DHIS2 2.42+ serves installed apps inside a global-shell iframe, while 2.41 and earlier serve them at the top level.
2. For browser automation, authenticate with a Basic-auth `GET /api/me` to establish the session cookie — the React login form resists scripted form fills.
3. **Console noise in normal operation** (not app bugs): a `PWA features will not work` error on plain-HTTP instances (no secure context), a 404 for `/api/staticContent/logo_banner` when the instance has no custom logo, and two `StyleSheet: illegal rule` warnings from the `@dhis2/ui` CSS reset in Chromium.
