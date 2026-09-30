#!/usr/bin/env bash
# End-to-end lifecycle test for the DQ Metrics Configuration Tool.
#
# Drives the *installed* app (POST /api/apps) through the full lifecycle:
#   initialise → configure → preview → import → verify → edit threshold →
#   delete (with metadata) → verify clean.
#
# Frame-aware: works on ≤2.41 (app served top-level) and 2.42+ (app inside
# the global-shell iframe).
#
# Requirements: playwright-cli, curl, python3. The app zip must already be
# installed on the instance.
#
# Usage:
#   DHIS2_URL=http://dhis2-agent-x:8080 DHIS2_USER=local_admin DHIS2_PASS=district \
#   DATASET="Morbidity" DE="Measles new" PROXY_COC="12-59m" OULEVEL="Level 4 - Facility" \
#   bash tests/e2e/lifecycle.sh
set -u

DHIS2_URL=${DHIS2_URL:?set DHIS2_URL}
DHIS2_USER=${DHIS2_USER:-local_admin}
DHIS2_PASS=${DHIS2_PASS:-district}
DATASET=${DATASET:?set DATASET}
DE=${DE:?set DE}
PROXY_COC=${PROXY_COC:-}   # empty = data element without disaggregation
OULEVEL=${OULEVEL:?set OULEVEL e.g. "Level 4 - Facility"}
APP_KEY=${APP_KEY:-tool-dq-helper}

PASS=0; FAIL=0
step() { echo; echo "== $1"; }
ok()   { echo "   PASS: $1"; PASS=$((PASS+1)); }
bad()  { echo "   FAIL: $1"; FAIL=$((FAIL+1)); }

# Frame-aware run-code helper: $1 = playwright code using `f` as root locator
R() {
    playwright-cli run-code "async page => {
        const f = page.frames().length > 1 ? page.frameLocator('iframe') : page;
        $1
    }" 2>&1 | grep -E "^Error|error:" | head -2
    sleep 1
}

api() { curl -s -u "$DHIS2_USER:$DHIS2_PASS" "$@"; }

count_kind() { # $1 kind, $2 name-like filter
    api -G "$DHIS2_URL/api/$1" \
        --data-urlencode "filter=name:like:$2" \
        --data-urlencode "fields=id" --data-urlencode "paging=false" |
        python3 -c "import json,sys; print(len(json.load(sys.stdin)['$1']))"
}

step "Open app and authenticate"
playwright-cli close-all >/dev/null 2>&1
playwright-cli open --browser=chromium "$DHIS2_URL/api/system/info" >/dev/null 2>&1
STATUS=$(playwright-cli --raw eval "fetch('/api/me', {headers: {Authorization: 'Basic ' + btoa('$DHIS2_USER:$DHIS2_PASS')}, credentials: 'include'}).then(r => r.status)")
[ "$STATUS" = "200" ] && ok "authenticated" || bad "auth returned $STATUS"
playwright-cli goto "$DHIS2_URL/api/apps/$APP_KEY/index.html" >/dev/null 2>&1
sleep 6

step "Initialise data store (if prompted)"
if playwright-cli --raw snapshot | grep -q "Initialise data store"; then
    R "await f.getByRole('button', { name: 'Initialise' }).click()"
    sleep 5
    api "$DHIS2_URL/api/dataStore/dqConfig/baseConfig" | grep -q userGroup &&
        ok "baseConfig created" || bad "baseConfig missing after initialise"
else
    ok "already initialised"
fi

step "Configure: $DATASET / $DE"
R "await f.getByRole('tab', { name: 'Add new' }).click()"; sleep 2
R "await f.locator('[data-test=\"dhis2-uicore-select-input\"]').nth(0).click()"
R "await f.getByPlaceholder('Type to filter options').fill('$DATASET')"
R "await f.getByText('$DATASET', { exact: true }).click()"; sleep 2
R "await f.locator('[data-test=\"dhis2-uicore-select-input\"]').nth(1).click()"; sleep 1
R "await f.getByPlaceholder('Type to filter options').fill('$DE')"
R "await f.getByText('$DE', { exact: true }).click()"

if [ -n "$PROXY_COC" ]; then
    R "await f.locator('[data-test=\"dhis2-uicore-select-input\"]').nth(2).click()"
    R "await f.getByText('Total (all disaggregations combined)').click()"
    R "await f.locator('[data-test=\"dhis2-uicore-select-input\"]').nth(3).click()"
    R "await f.getByText('$PROXY_COC', { exact: true }).click()"
    OU_INDEX=4
else
    OU_INDEX=2
fi
R "await f.locator('[data-test=\"dhis2-uicore-select-input\"]').nth($OU_INDEX).click()"
R "await f.getByText('$OULEVEL').click()"

step "Preview"
R "await f.getByRole('button', { name: 'Preview' }).click()"
sleep 6
COLS=$(playwright-cli --raw snapshot | grep -c "columnheader")
[ "$COLS" -gt 10 ] && ok "preview tables rendered ($COLS column headers)" || bad "preview missing (found $COLS column headers)"

step "Import"
R "await f.getByRole('button', { name: 'Import' }).click()"
R "await f.getByRole('dialog').getByRole('button', { name: 'Import' }).click()"
sleep 10
OKROWS=$(playwright-cli --raw snapshot | grep -c 'cell "OK"')
[ "$OKROWS" -ge 9 ] && ok "import steps all OK ($OKROWS rows)" || bad "import rows OK=$OKROWS (expected >=9)"

step "Verify metadata on server"
DES=$(count_kind dataElements "DQ - $DE"); PDS=$(count_kind predictors "DQ - $DE"); INS=$(count_kind indicators "DQ - $DE")
[ "$DES" -ge 1 ] && ok "data elements created ($DES)" || bad "data elements: $DES"
[ "$PDS" -ge 1 ] && ok "predictors created ($PDS)" || bad "predictors: $PDS"
[ "$INS" -ge 4 ] && ok "indicators created ($INS)" || bad "indicators: $INS"

step "Edit outlier threshold to 2.5"
R "await f.getByRole('tab', { name: 'Configuration' }).click()"; sleep 3
R "await f.getByRole('button', { name: 'Edit' }).click()"
R "await f.locator('input[type=number]').fill('2.5')"
R "await f.getByRole('button', { name: 'Save' }).click()"
sleep 6
playwright-cli --raw snapshot | grep -q "Outliers (modified-Z 2.5)" && ok "chip shows modified-Z 2.5" || bad "chip not updated"
api -G "$DHIS2_URL/api/predictors" --data-urlencode "filter=name:like:DQ - $DE outlier threshold" --data-urlencode "fields=name" |
    grep -q "modified-Z 2.5" && ok "predictor renamed to modified-Z 2.5" || bad "predictor not renamed"

step "Remove configuration incl. metadata"
R "await f.getByRole('button', { name: 'Remove' }).first().click()"
R "await f.getByRole('dialog').locator('input[type=checkbox]').check()"
R "await f.getByRole('dialog').getByRole('button', { name: 'Remove' }).click()"
# Deletion runs many sequential API calls — wait for the loading overlay to clear
for _ in $(seq 1 36); do
    playwright-cli --raw snapshot 2>/dev/null | grep -q "progressbar" || break
    sleep 5
done
sleep 2
DES=$(count_kind dataElements "DQ - $DE"); PDS=$(count_kind predictors "DQ - $DE"); INS=$(count_kind indicators "DQ - $DE")
[ "$DES" = "0" ] && [ "$PDS" = "0" ] && [ "$INS" = "0" ] &&
    ok "all generated metadata deleted" || bad "leftovers: DE=$DES PD=$PDS IN=$INS"
api "$DHIS2_URL/api/dataStore/dqConfig/outliers" | grep -q '^\[\]$' && ok "dataStore outliers empty" || bad "dataStore outliers not empty"

echo
echo "==== RESULT: $PASS passed, $FAIL failed ===="
[ "$FAIL" = "0" ]
