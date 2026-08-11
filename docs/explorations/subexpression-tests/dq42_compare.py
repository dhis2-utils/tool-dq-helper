"""Compare legacy (DQ) vs proposed (DQX) vs inline (DQXi) indicator values.

National level + per-province, all 12 months of 2025. Prints a match table.
Also compares the raw threshold data values (DQ vs DQX threshold DEs).
"""
import sys
from collections import defaultdict
sys.path.insert(0, '.')
from dq42_common import *  # noqa

ROOT = "IWp9dQGM0bS"
PE = ";".join(f"2025{m:02d}" for m in range(1, 13))

# legacy indicator uids (same as dqtest, present in seed)
LEGACY = {
    "ANC": {"compl": "OqIXLMi4Hkj", "cons": "mau6RzUtpQR", "outp": "CWliQR4vso2", "excl": "MtXkWH0zav7"},
    "DPT": {"compl": "y32RTWV7EUM", "cons": "wfOxLTbzBca", "outp": "gqXDqJSETAB", "excl": "FsQq4BCRCyf"},
    "MAL": {"compl": "iQT36gm0qzO", "cons": "Smg8yRg2GwR", "outp": "SEeoMZgiugf", "excl": "xxkZoKw9PTG"},
}
NEW = {k: {"compl": f"DQXic{k}001", "cons": f"DQXis{k}001", "outp": f"DQXio{k}001", "excl": f"DQXie{k}001"}
       for k in LEGACY}
INLINE = {k: {"outp": f"DQIio{k}001", "excl": f"DQIie{k}001"} for k in LEGACY}


def fetch(dx_list, ou):
    out = {}
    for chunk in range(0, len(dx_list), 20):
        r = api("GET", "analytics", params={
            "dimension": [f"dx:{';'.join(dx_list[chunk:chunk+20])}", f"pe:{PE}", f"ou:{ou}"],
            "skipRounding": "true"})
        for row in r.json().get("rows", []):
            out[(row[0], row[1], row[2])] = float(row[3])
    return out


def compare(label, pairs, vals, tol=0.005):
    """pairs: list of (dxA, dxB); compares values across all (pe, ou)."""
    total = eq = a_only = b_only = 0
    worst = None
    for dxa, dxb in pairs:
        keys_a = {(pe, ou) for (dx, pe, ou) in vals if dx == dxa}
        keys_b = {(pe, ou) for (dx, pe, ou) in vals if dx == dxb}
        for k in keys_a | keys_b:
            va = vals.get((dxa, *k))
            vb = vals.get((dxb, *k))
            if va is None:
                b_only += 1
                continue
            if vb is None:
                a_only += 1
                continue
            total += 1
            diff = abs(va - vb)
            if diff <= tol or (va and diff / abs(va) <= 0.0005):
                eq += 1
            elif worst is None or diff > worst[0]:
                worst = (diff, dxa, k, va, vb)
    pct = 100 * eq / total if total else 0
    print(f"{label:34s} comparable={total:4d} match={eq:4d} ({pct:5.1f}%) "
          f"legacy-only={a_only:3d} new-only={b_only:3d}"
          + (f"  worst diff {worst[0]:.2f} @ {worst[2]} ({worst[3]:.2f} vs {worst[4]:.2f})" if worst else ""))


all_dx = []
for k in LEGACY:
    all_dx += list(LEGACY[k].values()) + list(NEW[k].values()) + list(INLINE[k].values())

for ou, oulabel in [(ROOT, "national"), (f"LEVEL-2;{ROOT}", "province")]:
    print(f"\n==== {oulabel}, Jan-Dec 2025 ====")
    vals = fetch(all_dx, ou)
    for k in LEGACY:
        for chk in ("compl", "cons", "outp", "excl"):
            compare(f"{k} {chk}: DQ vs DQX", [(LEGACY[k][chk], NEW[k][chk])], vals)
        for chk in ("outp", "excl"):
            compare(f"{k} {chk}: DQX vs inline", [(NEW[k][chk], INLINE[k][chk])], vals)

# ---- raw threshold comparison (DQ vs DQX threshold DEs) ----
print("\n==== raw threshold data values (DQ vs DQX predictors) ====")
PAIRS = [("ANC", "DQLthrANC00", None), ]  # placeholder, resolved below
legacy_thr = {p["name"]: p for p in get("dataElements", filter="name:like:outlier threshold",
                                        fields="id,name", paging="false")["dataElements"]}
for key, label in [("ANC", "ANC 1"), ("DPT", "DPT 3"), ("MAL", "Malaria confirmed cases")]:
    old = next((v["id"] for n, v in legacy_thr.items() if n == f"DQ - {label} outlier threshold (mean + 3 SD)"), None)
    new = f"DQXthr{key}01"
    r = get("dataValueSets", dataElement=[old, new], orgUnit=ROOT, children="true",
            startDate="2025-01-01", endDate="2026-01-01")
    mine, legacy = {}, {}
    for dv in r.get("dataValues", []):
        (mine if dv["dataElement"] == new else legacy)[(dv["orgUnit"], dv["period"])] = dv["value"]
    common = set(mine) & set(legacy)
    eq = sum(1 for c in common if mine[c] == legacy[c])
    print(f"{key}: common={len(common)} exact={eq} ({100*eq/max(1,len(common)):.1f}%) "
          f"new-only={len(mine)-len(common)} legacy-only={len(legacy)-len(common)}")
