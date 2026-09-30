"""Compact assertions of country-level values at T. Exit 1 on any mismatch."""
import sys
sys.path.insert(0, '.')
from common import *  # noqa

EXPECTED = {
    "NEW XP completeness (%)": 60.0,
    "NEW XD completeness any disaggregation (%)": 40.0,
    "REF XD completeness any disaggregation (%)": 40.0,
    "NEW XP consistency 12m (%)": 50.0,
    "REF XP consistency 12m (%)": 50.0,
    "NEW XP excluding outliers (%)": 23.0769,
    "HYB XP excluding outliers (%)": 23.0769,
    "REF XP excluding outliers (%)": 23.0769,
    "NEW XP values that are outliers (%)": 33.3333,
    "HYB XP values that are outliers (%)": 33.3333,
    "REF XP values that are outliers (%)": 25.0,   # known predictor quirk (B1)
}

inds = get("indicators", filter="name:like:XP", fields="id,name", paging="false")["indicators"]
inds += get("indicators", filter="name:like:XD", fields="id,name", paging="false")["indicators"]
r = api("GET", "analytics", params={
    "dimension": [f"dx:{';'.join(i['id'] for i in inds)}", f"pe:{T}", f"ou:{OU_ROOT}"],
    "skipRounding": "true"})
j = r.json()
names = j.get("metaData", {}).get("items", {})
got = {names.get(row[0], {}).get("name", row[0]): float(row[3]) for row in j.get("rows", [])}

fails = 0
for name, want in EXPECTED.items():
    have = got.get(name)
    ok = have is not None and abs(have - want) < 0.001
    if not ok:
        fails += 1
    print(f"{'PASS' if ok else 'FAIL'} {name:45s} want {want:>8} got {have}")
print(f"\n{'ALL PASS' if fails == 0 else str(fails) + ' FAILURES'}")
sys.exit(1 if fails else 0)
