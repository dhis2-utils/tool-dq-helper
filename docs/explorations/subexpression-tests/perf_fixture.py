"""Perf fixture: second OU root with 1000 facilities, 24 months of DE_PLAIN data.

Deterministic pseudo-values; ~5% of facility-months skipped (missing data),
occasional spikes so outlier logic has something to find.
"""
import sys
sys.path.insert(0, '.')
from common import *  # noqa

ROOT_P = "OUrootPerf1"
N_FAC = 1000
MONTHS = [f"{y}{m:02d}" for y in (2024, 2025) for m in range(1, 13)] + ["202601", "202602", "202603", "202604", "202605", "202606"]

def fac_uid(i):
    return f"OUp{i:08d}"

ous = [{"id": ROOT_P, "name": "Perf Root", "shortName": "Perf Root", "openingDate": "2020-01-01"}]
ous += [{"id": fac_uid(i), "name": f"Perf Facility {i}", "shortName": f"PerfFac {i}",
         "openingDate": "2020-01-01", "parent": {"id": ROOT_P}} for i in range(N_FAC)]

r = api("POST", "metadata", body={"organisationUnits": ous})
print("OU import:", r.json().get("status"))

# add perf root to user (keep existing roots)
me = get("me", fields="id")
user = get(f"users/{me['id']}", fields=":owner")
have = {o["id"] for o in user.get("organisationUnits", [])}
if ROOT_P not in have:
    user["organisationUnits"] = user.get("organisationUnits", []) + [{"id": ROOT_P}]
    user["dataViewOrganisationUnits"] = user.get("dataViewOrganisationUnits", []) + [{"id": ROOT_P}]
    api("PUT", f"users/{me['id']}", body=user)
    print("user updated with perf root")

defaults = get("categoryCombos", filter="name:eq:default", fields="categoryOptionCombos[id]")
COC_DEFAULT = defaults["categoryCombos"][0]["categoryOptionCombos"][0]["id"]

dvs = []
for i in range(N_FAC):
    for mi, pe in enumerate(MONTHS):
        h = (i * 31 + mi * 17) % 100
        if h < 5:           # ~5% missing
            continue
        base = 20 + (i % 50)
        val = base + (h % 11) - 5
        if h == 97:         # occasional spike
            val = base * 10
        dvs.append({"dataElement": DE_PLAIN, "period": pe, "orgUnit": fac_uid(i),
                    "categoryOptionCombo": COC_DEFAULT, "value": str(val)})

print("importing", len(dvs), "values...")
r = api("POST", "dataValueSets", body={"dataValues": dvs})
resp = r.json().get("response", r.json())
print("dv import:", resp.get("status"), resp.get("importCount"))
