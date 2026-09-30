"""Shared helpers + fixture definition for the subExpression exploration.

Fixed UIDs so scripts are re-runnable and analytics output is readable.
Report month T = 202606; stats window W = 202506..202605 (12 months).
"""
import json
import sys
import requests

BASE = "http://dhis2-agent-subexpr:8080"
AUTH = ("local_admin", "district")

S = requests.Session()
S.auth = AUTH


def api(method, path, params=None, body=None, ok=(200, 201, 204, 409)):
    r = S.request(method, f"{BASE}/api/{path}", params=params, json=body)
    if r.status_code not in ok:
        print(f"!! {method} {path} -> {r.status_code}\n{r.text[:2000]}", file=sys.stderr)
    return r


def get(path, **params):
    return api("GET", path, params=params).json()


# ---------------------------------------------------------------- fixed UIDs
OU_ROOT = "OUroot00001"
OU_DA = "OUdistrictA"
OU_DB = "OUdistrictB"
FAC = {"A1": "OUfacilA001", "A2": "OUfacilA002", "A3": "OUfacilA003",
       "B1": "OUfacilB001", "B2": "OUfacilB002"}

CAT_OPT_M = "COoptMale01"
CAT_OPT_F = "COoptFemale"
CAT_SEX = "CATsex00001"
CC_SEX = "CCsex000001"

DE_PLAIN = "DEplain0001"   # "XP cases" default catcombo
DE_DISAG = "DEdisag0001"   # "XD cases" sex catcombo
DS = "DSmonthly01"

IT_PERCENT = "ITpercent01"
IT_NUMBER = "ITnumber001"

# months: 12-month window W then report month T
W = ["202506", "202507", "202508", "202509", "202510", "202511",
     "202512", "202601", "202602", "202603", "202604", "202605"]
T = "202606"

# ------------------------------------------------------ data value patterns
# facility -> {month: value} for DE_PLAIN (default coc)
SERIES_A1 = [10, 12, 11, 13, 10, 12, 11, 10, 12, 11, 13, 12]
PLAIN = {
    "A1": {**{m: v for m, v in zip(W, SERIES_A1)}, T: 100},   # T is an outlier
    "A2": {**{m: 5 + i for i, m in enumerate(W) if i % 2 == 0}, T: 5},  # 6 of 12
    "A3": {},                                                  # never reports
    "B1": {m: 7 for m in W},                                   # all 12, but not T
    "B2": {**{m: 20 + i for i, m in enumerate(W) if i != 3}, T: 25},  # 11 of 12 + T
}

# DE_DISAG: values per (facility, month, coc M/F). A1 reports both M+F,
# A2 reports only M (tests "any disaggregation" counting = 1 per facility).
DISAG = {
    "A1": {T: {"M": 4, "F": 6}},
    "A2": {T: {"M": 3}},
}
