"""Run reference predictors for report month T and sanity-check raw outputs."""
import statistics
import sys
sys.path.insert(0, '.')
from common import *  # noqa

PREDICTORS = ["PDthresh001",  # must run first (others read its output)
              "PDnoutval01", "PDnoutcnt01", "PDoutcnt001", "PDoutval001",
              "PDconsall01", "PDconsany01", "PDcomplany1"]

for pd in PREDICTORS:
    r = api("POST", f"predictors/{pd}/run",
            params={"startDate": "2026-06-01", "endDate": "2026-07-01"})
    print(pd, r.status_code, r.json().get("message", r.text[:100]))

# ------------------------------------------------- expected values (python)
print("\n-- expected per-facility values at T --")
exp = {}
for fac, series in PLAIN.items():
    window = [series[m] for m in W if m in series]
    t = PLAIN[fac].get(T)
    row = {}
    if window:
        mean = statistics.mean(window)
        sd = statistics.pstdev(window)
        row["threshold"] = round(mean + 2 * sd)   # DE is integer-valued
        row["cons_all"] = 1 if len(window) == 12 else 0
        row["cons_any"] = 1
        if t is not None:
            row["nout_val"] = t if t <= mean + 2 * sd else 0
            row["nout_cnt"] = 1 if t <= mean + 2 * sd else 0
            row["out_cnt"] = 0 if t <= mean + 2 * sd else 1
            row["out_val"] = 0 if t <= mean + 2 * sd else t
    exp[fac] = row
    print(fac, row)

# ------------------------------------------------- actual predictor output
print("\n-- actual predictor data values at T --")
DES = {"DEthresh001": "threshold", "DEnoutval01": "nout_val", "DEnoutcnt01": "nout_cnt",
       "DEoutcnt001": "out_cnt", "DEoutval001": "out_val",
       "DEconsall01": "cons_all", "DEconsany01": "cons_any", "DEcomplany1": "compl_any"}
r = get("dataValueSets", dataElement=list(DES.keys()), period=T,
        orgUnit=OU_ROOT, children="true")
actual = {}
for dv in r.get("dataValues", []):
    if dv["dataElement"] in DES:
        fac = next((k for k, u in FAC.items() if u == dv["orgUnit"]), dv["orgUnit"])
        actual.setdefault(fac, {})[DES[dv["dataElement"]]] = dv["value"]
for fac in sorted(actual):
    print(fac, actual[fac])
