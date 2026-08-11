"""Create the side-by-side visualizations + dashboard on agent-dq42.

One LINE chart per (data element x check): legacy DQ vs proposed DQX
(outlier charts additionally carry the fully inline DQXi series).
Fixed periods Jan-Dec 2025 (the data horizon of this database).
"""
import sys
sys.path.insert(0, '.')
from dq42_common import *  # noqa

ROOT = "IWp9dQGM0bS"
PE_ITEMS = [{"id": f"2025{m:02d}", "dimensionItemType": "PERIOD"} for m in range(1, 13)]
NOTE = ("Old (DQ, predictor-based) vs new (DQX, subExpression-based; DQXi = fully inline) "
        "data quality indicator. Exploration test object, 2026-07-17.")

CHARTS = [
    ("ANC 1", "completeness", ["OqIXLMi4Hkj", "DQXicANC001"]),
    ("ANC 1", "consistency 12m", ["mau6RzUtpQR", "DQXisANC001"]),
    ("ANC 1", "outliers pct", ["CWliQR4vso2", "DQXioANC001", "DQIioANC001"]),
    ("ANC 1", "excluding outliers", ["MtXkWH0zav7", "DQXieANC001", "DQIieANC001"]),
    ("DPT 3", "completeness", ["y32RTWV7EUM", "DQXicDPT001"]),
    ("DPT 3", "consistency 12m", ["wfOxLTbzBca", "DQXisDPT001"]),
    ("DPT 3", "outliers pct", ["gqXDqJSETAB", "DQXioDPT001", "DQIioDPT001"]),
    ("DPT 3", "excluding outliers", ["FsQq4BCRCyf", "DQXieDPT001", "DQIieDPT001"]),
    ("Malaria confirmed", "completeness", ["iQT36gm0qzO", "DQXicMAL001"]),
    ("Malaria confirmed", "consistency 12m", ["Smg8yRg2GwR", "DQXisMAL001"]),
    ("Malaria confirmed", "outliers pct", ["SEeoMZgiugf", "DQXioMAL001", "DQIioMAL001"]),
    ("Malaria confirmed", "excluding outliers", ["xxkZoKw9PTG", "DQXieMAL001", "DQIieMAL001"]),
]

viss, vis_ids = [], []
for i, (de_label, check, dxs) in enumerate(CHARTS):
    uid = f"DQXvz{i:06d}"
    vis_ids.append(uid)
    viss.append({
        "id": uid, "name": f"DQ old vs new - {de_label} {check}",
        "description": NOTE, "type": "LINE",
        "columns": [{"dimension": "dx", "items": [
            {"id": dx, "dimensionItemType": "INDICATOR"} for dx in dxs]}],
        "rows": [{"dimension": "pe", "items": PE_ITEMS}],
        "filters": [{"dimension": "ou", "items": [{"id": ROOT, "dimensionItemType": "ORGANISATION_UNIT"}]}],
    })
r = api("POST", "metadata", params={"importStrategy": "CREATE_AND_UPDATE", "atomicMode": "ALL"},
        body={"visualizations": viss})
print("visualizations:", r.json().get("status"))

items = [{"type": "VISUALIZATION", "visualization": {"id": uid},
          "x": (i % 2) * 30, "y": (i // 2) * 18, "width": 30, "height": 18}
         for i, uid in enumerate(vis_ids)]
r = api("POST", "metadata", params={"importStrategy": "CREATE_AND_UPDATE"}, body={"dashboards": [{
    "id": "DQXdash0001", "name": "DQ metrics: old (predictors) vs new (subExpressions)",
    "description": NOTE, "dashboardItems": items}]})
print("dashboard:", r.json().get("status"))
print("URL: http://localhost:<port>/dhis-web-dashboard/#/DQXdash0001")
