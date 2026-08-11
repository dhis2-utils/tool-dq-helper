"""Set up BOTH configs on agent-dq42 (2.42 + Laos demo):

DQ  - legacy/old-school stack, verbatim from the tool's templates (mean + 3 SD):
      per source DE: 1 threshold predictor (DESCENDANTS) + 4 comparison
      predictors (SELECTED) + 2 consistency predictors (SELECTED) +
      1 completeness predictor (SELECTED) + 8 output DEs + 4 indicators.
DQX - proposed stack: 1 threshold predictor (DESCENDANTS) + 1 threshold DE +
      4 subExpression indicators (outliers compare vs DQX threshold DE).
DQXi- fully inline outlier indicators (no predictor at all), 2 per DE.
"""
import sys
sys.path.insert(0, '.')
from dq42_common import *  # noqa

# ---------------------------------------------------------------- discovery
info = get("system/info")
print("version:", info.get("version"))
cc = get("categoryCombos", filter="name:eq:default", fields="id,categoryOptionCombos[id]")["categoryCombos"][0]
CC_DEFAULT, COC_DEFAULT = cc["id"], cc["categoryOptionCombos"][0]["id"]
levels = get("organisationUnitLevels", fields="id,name,level", paging="false")["organisationUnitLevels"]
FAC_LEVEL = max(levels, key=lambda l: l["level"])
print("default CC/COC:", CC_DEFAULT, COC_DEFAULT, "| facility level:", FAC_LEVEL)

its = get("indicatorTypes", fields="id,name,factor", paging="false")["indicatorTypes"]
IT_PCT = next((t["id"] for t in its if t["factor"] == 100), None)
print("percentage type:", IT_PCT)

for key, (uid, label) in SRC.items():
    de = get(f"dataElements/{uid}", fields="id,name,categoryCombo[id,name]")
    print(key, "->", de.get("name"), "| cc:", de.get("categoryCombo", {}).get("name"))

# datasets for completeness denominators (same UIDs as dqtest if seed matches)
DS_ANC, DS_DPT = "tQc4Gv2Jwco", "jqSaKxtj8IA"
DPT_COC_OPERAND = "TWWbtMMWD51.JKuWbG5bWAu"
for ds in (DS_ANC, DS_DPT):
    r = api("GET", f"dataSets/{ds}", params={"fields": "id,name,periodType"})
    print("dataset", ds, "->", r.json().get("name") if r.status_code == 200 else "MISSING")

NOTE_DQ = "Old-school DQ config (verbatim tool templates) for comparison. Test object 2026-07-17."
NOTE_DQX = "Proposed config: threshold predictor + subExpression indicators. Test object 2026-07-17."
NOTE_DQXI = "Fully inline variant (no predictor). Test object 2026-07-17."


def out_de(uid, name, short, note):
    return {"id": uid, "name": name, "shortName": short[:50], "description": note,
            "aggregationType": "SUM", "domainType": "AGGREGATE",
            "valueType": "INTEGER_ZERO_OR_POSITIVE", "zeroIsSignificant": False,
            "categoryCombo": {"id": CC_DEFAULT}}


def predictor(uid, name, short, output, expr, seq, descendants, note):
    return {"id": uid, "name": name, "shortName": short[:50], "description": note,
            "output": {"id": output}, "outputCombo": {"id": COC_DEFAULT},
            "generator": {"expression": expr, "missingValueStrategy": "SKIP_IF_ALL_VALUES_MISSING",
                          "slidingWindow": False, "description": short[:100]},
            "periodType": "Monthly", "organisationUnitLevels": [{"id": FAC_LEVEL["id"]}],
            "organisationUnitDescendants": descendants,
            "sequentialSampleCount": seq, "annualSampleCount": 0, "sequentialSkipCount": 0}


def indicator(uid, name, short, num, den, note):
    return {"id": uid, "name": name, "shortName": short[:50], "description": note,
            "annualized": False, "indicatorType": {"id": IT_PCT},
            "numerator": num, "numeratorDescription": short[:100],
            "denominator": den, "denominatorDescription": "denominator"}


des, preds, inds = [], [], []
for key, (src, label) in SRC.items():
    S8 = f"#{{{src}}}"
    # ---------------- legacy (DQ) ----------------
    d = {n: ("DQL" + n + key).ljust(11, "0") for n in ("thr", "exo", "noc", "outc", "outv", "call", "cany", "cmpl")}
    des += [
        out_de(d["thr"], f"DQ - {label} outlier threshold (mean + 3 SD)", f"DQ {key} outl threshold", NOTE_DQ),
        out_de(d["exo"], f"DQ - {label} excluding outliers", f"DQ {key} excl outliers", NOTE_DQ),
        out_de(d["noc"], f"DQ - {label} non-outlier count", f"DQ {key} non-outl count", NOTE_DQ),
        out_de(d["outc"], f"DQ - {label} outlier count", f"DQ {key} outlier count", NOTE_DQ),
        out_de(d["outv"], f"DQ - {label} outliers", f"DQ {key} outliers", NOTE_DQ),
        out_de(d["call"], f"DQ - {label} orgunits reported in all the last 12 Months", f"DQ {key} all last 12", NOTE_DQ),
        out_de(d["cany"], f"DQ - {label} orgunits reported in any of the last 12 Months", f"DQ {key} any last 12", NOTE_DQ),
        out_de(d["cmpl"], f"DQ - {label} completeness", f"DQ {key} completeness", NOTE_DQ),
    ]
    preds += [
        predictor(f"DQLpt{key}001", f"DQ - {label} outlier threshold (mean + 3 SD)", f"DQ {key} outl threshold",
                  d["thr"], f"avg({S8}) + (3 * stddevPop({S8}))", 12, "DESCENDANTS", NOTE_DQ),
        predictor(f"DQLpe{key}001", f"DQ - {label} excluding outliers", f"DQ {key} excl outliers",
                  d["exo"], f"if({S8}<=#{{{d['thr']}}}, {S8}, 0)", 0, "SELECTED", NOTE_DQ),
        predictor(f"DQLpn{key}001", f"DQ - {label} non-outlier count", f"DQ {key} non-outl count",
                  d["noc"], f"if({S8}<=#{{{d['thr']}}}, 1, 0)", 0, "SELECTED", NOTE_DQ),
        predictor(f"DQLpo{key}001", f"DQ - {label} outlier count", f"DQ {key} outlier count",
                  d["outc"], f"if({S8}>#{{{d['thr']}}},1, 0)", 0, "SELECTED", NOTE_DQ),
        predictor(f"DQLpv{key}001", f"DQ - {label} outliers", f"DQ {key} outliers",
                  d["outv"], f"if({S8}>#{{{d['thr']}}}, {S8}, 0)", 0, "SELECTED", NOTE_DQ),
        predictor(f"DQLpa{key}001", f"DQ - {label} orgunits reported in all the last 12 Months", f"DQ {key} all last 12",
                  d["call"], f"if(sum(if(isNotNull({S8}),1,0)) == 12,1,0)", 12, "SELECTED", NOTE_DQ),
        predictor(f"DQLpy{key}001", f"DQ - {label} orgunits reported in any of the last 12 Months", f"DQ {key} any last 12",
                  d["cany"], f"if(isNotNull(sum({S8})),1,0)", 12, "SELECTED", NOTE_DQ),
        predictor(f"DQLpc{key}001", f"DQ - {label} completeness", f"DQ {key} completeness",
                  d["cmpl"], f"(if(isNotNull({S8}), 1, 0))", 0, "SELECTED", NOTE_DQ),
    ]
    compl_den = {"ANC": f"R{{{DS_ANC}.EXPECTED_REPORTS}}", "DPT": f"R{{{DS_DPT}.EXPECTED_REPORTS}}",
                 "MAL": f"#{{{d['cany']}}}"}[key]
    inds += [
        indicator(f"DQLic{key}001", f"DQ - {label} data element completeness (%)", f"DQ {key} completeness (%)",
                  f"#{{{d['cmpl']}}}", compl_den, NOTE_DQ),
        indicator(f"DQLis{key}001", f"DQ - {label} facilities consistently reporting last 12 months (%)",
                  f"DQ {key} consist 12m (%)", f"#{{{d['call']}}}", f"#{{{d['cany']}}}", NOTE_DQ),
        indicator(f"DQLio{key}001", f"DQ - {label} values that are outliers (%)", f"DQ {key} outliers (%)",
                  f"if( isNotNull( #{{{d['outc']}}}), #{{{d['outc']}}}, 0)",
                  f"#{{{d['outc']}}}+#{{{d['noc']}}}", NOTE_DQ),
        indicator(f"DQLie{key}001", f"DQ - {label} excluding outliers (%)", f"DQ {key} excl outliers (%)",
                  f"#{{{d['exo']}}}", S8, NOTE_DQ),
    ]

    # ---------------- proposed (DQX): threshold predictor + subExpression indicators ----
    thr_x = f"DQXthr{key}01"
    des.append(out_de(thr_x, f"DQX - {label} outlier threshold (mean + 3 SD)", f"DQX {key} outl threshold", NOTE_DQX))
    preds.append(predictor(f"DQXpt{key}001", f"DQX - {label} outlier threshold (mean + 3 SD)",
                           f"DQX {key} outl threshold", thr_x,
                           f"avg({S8}) + (3 * stddevPop({S8}))", 12, "DESCENDANTS", NOTE_DQX))
    offs = [f"{S8}.periodOffset(-{i})" for i in range(1, 13)]
    n_rep = "+".join(f"if(isNotNull({o}),1,0)" for o in offs)
    any12 = f"subExpression(if({n_rep} > 0, 1, 0))"
    compl_num_item = DPT_COC_OPERAND if key == "DPT" else src
    compl_den_x = {"ANC": f"R{{{DS_ANC}.EXPECTED_REPORTS}}", "DPT": f"R{{{DS_DPT}.EXPECTED_REPORTS}}",
                   "MAL": any12}[key]
    inds += [
        indicator(f"DQXic{key}001", f"DQX - {label} data element completeness (%)", f"DQX {key} completeness (%)",
                  f"subExpression(if(isNotNull(#{{{compl_num_item}}}), 1, 0))", compl_den_x, NOTE_DQX),
        indicator(f"DQXis{key}001", f"DQX - {label} facilities consistently reporting last 12 months (%)",
                  f"DQX {key} consist 12m (%)",
                  f"subExpression(if({n_rep} == 12, 1, null))", any12, NOTE_DQX),
        indicator(f"DQXio{key}001", f"DQX - {label} values that are outliers (%)", f"DQX {key} outliers (%)",
                  f"subExpression(if({S8} > firstNonNull(#{{{thr_x}}}, 0), 1, 0))",
                  f"subExpression(if(isNotNull({S8}) || isNotNull(#{{{thr_x}}}), 1, 0))", NOTE_DQX),
        indicator(f"DQXie{key}001", f"DQX - {label} excluding outliers (%)", f"DQX {key} excl outliers (%)",
                  f"subExpression(if({S8} <= firstNonNull(#{{{thr_x}}}, 0), if(isNotNull({S8}), {S8}, 0), 0))",
                  S8, NOTE_DQX),
    ]

    # ---------------- inline (DQXi): outliers with no predictor at all ----------------
    n = f"({n_rep})"
    sx = "(" + "+".join(f"if(isNotNull({o}),{o},0)" for o in offs) + ")"
    sx2 = "(" + "+".join(f"if(isNotNull({o}),{o}*{o},0)" for o in offs) + ")"
    mean = f"({sx}/{n})"
    sd = f"(({sx2}/{n} - {mean}*{mean})^0.5)"
    thr_i = f"({mean} + 3*{sd})"
    inds += [
        indicator(f"DQIio{key}001", f"DQXi - {label} values that are outliers (%) [inline]",
                  f"DQXi {key} outliers (%)",
                  f"subExpression(if({n} > 0, if({S8} > {thr_i}, 1, 0), if(isNotNull({S8}), 1, 0)))",
                  f"subExpression(if(isNotNull({S8}) || {n} > 0, 1, 0))", NOTE_DQXI),
        indicator(f"DQIie{key}001", f"DQXi - {label} excluding outliers (%) [inline]",
                  f"DQXi {key} excl outliers (%)",
                  f"subExpression(if({n} > 0, if({S8} <= {thr_i}, if(isNotNull({S8}), {S8}, 0), 0), 0))",
                  S8, NOTE_DQXI),
    ]

body = {"dataElements": des, "predictors": preds, "indicators": inds}
r = api("POST", "metadata", params={"importStrategy": "CREATE_AND_UPDATE", "atomicMode": "ALL"}, body=body)
rep = r.json()
print("metadata import:", rep.get("status"), rep.get("stats"))
if rep.get("status") != "OK":
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
    sys.exit(1)

bad = 0
for i in inds:
    for part in ("numerator", "denominator"):
        rr = S.post(f"{BASE}/indicators/expression/description", data=i[part],
                    headers={"Content-Type": "text/plain"})
        if rr.json().get("status") != "OK":
            bad += 1
            print("INVALID", i["name"], part, rr.json().get("message"))
print("expression validation:", "all OK" if bad == 0 else f"{bad} invalid")
