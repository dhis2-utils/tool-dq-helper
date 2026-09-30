"""Query analytics for all REF/NEW indicators at T and print a comparison table.
Usage: python3 verify.py [indicator-uid ...]   (default: all REF/NEW indicators)
"""
import sys
sys.path.insert(0, '.')
from common import *  # noqa


def analytics_values(dx_list, ou_dim):
    r = api("GET", "analytics", params={
        "dimension": [f"dx:{';'.join(dx_list)}", f"pe:{T}", f"ou:{ou_dim}"],
        "skipMeta": "false", "skipRounding": "true",
    })
    if r.status_code != 200:
        return {}, r.json().get("message", "")
    j = r.json()
    names = j.get("metaData", {}).get("items", {})
    out = {}
    for row in j.get("rows", []):
        dx, ou, val = row[0], row[2], row[3]
        ou_name = names.get(ou, {}).get("name", ou)
        dx_name = names.get(dx, {}).get("name", dx)
        out[(dx_name, ou_name)] = val
    return out, None


inds = get("indicators", filter="name:like:XP", fields="id,name", paging="false")["indicators"]
inds += get("indicators", filter="name:like:XD", fields="id,name", paging="false")["indicators"]
dx = sys.argv[1:] or [i["id"] for i in inds]

for ou_dim, label in [(f"LEVEL-3;{OU_ROOT}", "facility"), (OU_ROOT, "country")]:
    vals, err = analytics_values(dx, ou_dim)
    print(f"\n== {label} level, period {T} ==")
    if err:
        print("ERROR:", err)
        continue
    for (dxn, oun) in sorted(vals):
        print(f"{dxn:45s} {oun:12s} {vals[(dxn, oun)]}")
