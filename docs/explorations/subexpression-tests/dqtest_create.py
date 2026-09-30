"""Create the DQX (new-approach) metadata on dqtest, additive only.

Per source DE: 1 threshold DE + 1 threshold predictor (mean + 3 SD,
DESCENDANTS = 2.43-safe) + 4 subExpression indicators that faithfully
replicate the legacy predictor semantics (incl. missing-threshold and
row-suppression behaviour). Only the source DEs are shared with the
existing config.
"""
import json
import requests

S = requests.Session()
S.auth = ("test_admin", "Test1234!")
BASE = "https://implement.im.dhis2.org/dqtest/api"

CC_DEFAULT = "bjDvmb4bfuf"
COC_DEFAULT = "HllvX50cXC0"
IT_PCT = "hmSnCXmLYwt"
OULEVEL4 = "vFr4zVw6Avn"
NOTE = "DQX exploration test object (subExpression-based DQ metrics), created 2026-07-17. Safe to delete."

CFG = {
    "ANC": {"label": "ANC 1", "src": "qqc4NnWVFL9", "compl_num_item": "qqc4NnWVFL9",
            "compl_den": "R{tQc4Gv2Jwco.EXPECTED_REPORTS}"},
    "DPT": {"label": "DPT 3", "src": "TWWbtMMWD51", "compl_num_item": "TWWbtMMWD51.JKuWbG5bWAu",
            "compl_den": "R{jqSaKxtj8IA.EXPECTED_REPORTS}"},
    "MAL": {"label": "Malaria confirmed cases", "src": "KV1LlPytf4f", "compl_num_item": "KV1LlPytf4f",
            "compl_den": None},  # legacy uses 'any of last 12 months' as denominator
}

des, preds, inds = [], [], []
for key, c in CFG.items():
    src, label = c["src"], c["label"]
    thr_de = f"DQXthr{key}01"
    offs = [f"#{{{src}}}.periodOffset(-{i})" for i in range(1, 13)]
    n_reported = "+".join(f"if(isNotNull({o}),1,0)" for o in offs)
    any12 = f"subExpression(if({n_reported} > 0, 1, 0))"

    des.append({
        "id": thr_de, "name": f"DQX - {label} outlier threshold (mean + 3 SD)",
        "shortName": f"DQX {key} outl threshold", "description": NOTE,
        "aggregationType": "SUM", "domainType": "AGGREGATE",
        "valueType": "INTEGER_ZERO_OR_POSITIVE", "zeroIsSignificant": False,
        "categoryCombo": {"id": CC_DEFAULT},
    })
    preds.append({
        "id": f"DQXpd{key}001", "name": f"DQX - {label} outlier threshold (mean + 3 SD)",
        "shortName": f"DQX {key} outl threshold", "description": NOTE,
        "output": {"id": thr_de}, "outputCombo": {"id": COC_DEFAULT},
        "generator": {"expression": f"avg(#{{{src}}}) + (3 * stddevPop(#{{{src}}}))",
                      "missingValueStrategy": "SKIP_IF_ALL_VALUES_MISSING",
                      "slidingWindow": False, "description": f"Mean of {label} + 3 SD"},
        "periodType": "Monthly", "organisationUnitLevels": [{"id": OULEVEL4}],
        "organisationUnitDescendants": "DESCENDANTS",
        "sequentialSampleCount": 12, "annualSampleCount": 0, "sequentialSkipCount": 0,
    })

    def ind(uid, name, short, num, den):
        return {"id": uid, "name": name, "shortName": short, "description": NOTE,
                "annualized": False, "indicatorType": {"id": IT_PCT},
                "numerator": num, "numeratorDescription": short,
                "denominator": den, "denominatorDescription": "denominator"}

    inds.append(ind(f"DQXco{key}001", f"DQX - {label} data element completeness (%)",
                    f"DQX {key} completeness (%)",
                    f"subExpression(if(isNotNull(#{{{c['compl_num_item']}}}), 1, 0))",
                    c["compl_den"] or any12))
    inds.append(ind(f"DQXcs{key}001", f"DQX - {label} facilities consistently reporting last 12 months (%)",
                    f"DQX {key} consist 12m (%)",
                    f"subExpression(if({n_reported} == 12, 1, null))",
                    any12))
    inds.append(ind(f"DQXop{key}001", f"DQX - {label} values that are outliers (%)",
                    f"DQX {key} outliers (%)",
                    f"subExpression(if(#{{{src}}} > firstNonNull(#{{{thr_de}}}, 0), 1, 0))",
                    f"subExpression(if(isNotNull(#{{{src}}}) || isNotNull(#{{{thr_de}}}), 1, 0))"))
    inds.append(ind(f"DQXeo{key}001", f"DQX - {label} excluding outliers (%)",
                    f"DQX {key} excl outliers (%)",
                    f"subExpression(if(#{{{src}}} <= firstNonNull(#{{{thr_de}}}, 0), if(isNotNull(#{{{src}}}), #{{{src}}}, 0), 0))",
                    f"#{{{src}}}"))

metadata = {
    "dataElements": des,
    "predictors": preds,
    "indicators": inds,
    "indicatorGroups": [{
        "id": "DQXgroup001", "name": "DQX - subExpression validation (test)",
        "shortName": "DQX validation", "description": NOTE,
        "indicators": [{"id": i["id"]} for i in inds],
    }],
}

r = S.post(f"{BASE}/api/metadata".replace("/api/api", "/api"),
           params={"importStrategy": "CREATE_AND_UPDATE", "atomicMode": "ALL"}, json=metadata) \
    if False else S.post(f"{BASE}/metadata", params={"importStrategy": "CREATE_AND_UPDATE", "atomicMode": "ALL"}, json=metadata)
rep = r.json()
print("import:", rep.get("status"), json.dumps(rep.get("stats", {})))
if rep.get("status") not in ("OK",):
    def walk(o):
        if isinstance(o, dict):
            if "message" in o and "errorCode" in o:
                print("ERR", o.get("errorCode"), o.get("message"))
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)
    walk(rep)
    raise SystemExit(1)

# validate all indicator expressions server-side
for i in inds:
    for part in ("numerator", "denominator"):
        rr = S.post(f"{BASE}/indicators/expression/description", data=i[part],
                    headers={"Content-Type": "text/plain"})
        st = rr.json().get("status")
        if st != "OK":
            print("INVALID", i["name"], part, rr.json().get("message"))
print("all indicator expressions validated")
