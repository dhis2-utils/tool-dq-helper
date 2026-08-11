"""Create base metadata + data on the blank agent-subexpr instance.

Also imports the *reference* predictor-based DQ config (verbatim expressions
from the app's templates.ts, SD=2, OU level 3 = Facility) so candidate
indicator-only configs can be validated against real predictor output.
"""
from common import *  # noqa

# ---------------------------------------------------------------- defaults
defaults = get("categoryCombos", filter="name:eq:default", fields="id,categoryOptionCombos[id]")
CC_DEFAULT = defaults["categoryCombos"][0]["id"]
COC_DEFAULT = defaults["categoryCombos"][0]["categoryOptionCombos"][0]["id"]
CO_DEFAULT = get("categoryOptions", filter="name:eq:default", fields="id")["categoryOptions"][0]["id"]
CAT_DEFAULT = get("categories", filter="name:eq:default", fields="id")["categories"][0]["id"]
print("default CC", CC_DEFAULT, "COC", COC_DEFAULT)

# ---------------------------------------------------- reference config UIDs
DE_THRESHOLD = "DEthresh001"
DE_NOUT_VAL = "DEnoutval01"
DE_NOUT_CNT = "DEnoutcnt01"
DE_OUT_CNT = "DEoutcnt001"
DE_OUT_VAL = "DEoutval001"
DE_CONS_ALL = "DEconsall01"
DE_CONS_ANY = "DEconsany01"
DE_COMPL_ANY = "DEcomplany1"

PD_THRESHOLD = "PDthresh001"
PD_NOUT_VAL = "PDnoutval01"
PD_NOUT_CNT = "PDnoutcnt01"
PD_OUT_CNT = "PDoutcnt001"
PD_OUT_VAL = "PDoutval001"
PD_CONS_ALL = "PDconsall01"
PD_CONS_ANY = "PDconsany01"
PD_COMPL_ANY = "PDcomplany1"

IN_REF_CONS = "INrefcons01"
IN_REF_EXCLOUT = "INrefexcl01"
IN_REF_OUTPROP = "INrefoutp01"
IN_REF_COMPLANY = "INrefcany01"
IN_NEW_COMPL = "INnewcompl1"      # single-item subExpression, should work on 2.40
IN_NEW_COMPLANY = "INnewcany01"   # single-item (disaggregated DE), 2.40 candidate


def out_de(uid, name, short):
    return {
        "id": uid, "name": name, "shortName": short,
        "aggregationType": "SUM", "domainType": "AGGREGATE",
        "valueType": "INTEGER_ZERO_OR_POSITIVE", "zeroIsSignificant": False,
        "categoryCombo": {"id": CC_DEFAULT},
    }


def predictor(uid, name, short, output, expr, seq_samples, descendants="SELECTED"):
    return {
        "id": uid, "name": name, "shortName": short,
        "output": {"id": output}, "outputCombo": {"id": COC_DEFAULT},
        "generator": {
            "expression": expr,
            "missingValueStrategy": "SKIP_IF_ALL_VALUES_MISSING",
            "slidingWindow": False, "description": short,
        },
        "periodType": "Monthly",
        "organisationUnitLevels": [{"id": "OULEVEL0003"}],
        "organisationUnitDescendants": descendants,
        "sequentialSampleCount": seq_samples,
        "annualSampleCount": 0, "sequentialSkipCount": 0,
    }


def indicator(uid, name, short, num, den, itype=IT_PERCENT):
    return {
        "id": uid, "name": name, "shortName": short, "annualized": False,
        "indicatorType": {"id": itype},
        "numerator": num, "numeratorDescription": short,
        "denominator": den, "denominatorDescription": "denom",
    }


metadata = {
    "organisationUnitLevels": [
        {"id": "OULEVEL0001", "name": "Country", "level": 1},
        {"id": "OULEVEL0002", "name": "District", "level": 2},
        {"id": "OULEVEL0003", "name": "Facility", "level": 3},
    ],
    "organisationUnits": [
        {"id": OU_ROOT, "name": "Country", "shortName": "Country", "openingDate": "2020-01-01"},
        {"id": OU_DA, "name": "District A", "shortName": "District A", "openingDate": "2020-01-01", "parent": {"id": OU_ROOT}},
        {"id": OU_DB, "name": "District B", "shortName": "District B", "openingDate": "2020-01-01", "parent": {"id": OU_ROOT}},
        *[{"id": uid, "name": f"Facility {k}", "shortName": f"Facility {k}", "openingDate": "2020-01-01",
           "parent": {"id": OU_DA if k.startswith("A") else OU_DB}} for k, uid in FAC.items()],
    ],
    "categoryOptions": [
        {"id": CAT_OPT_M, "name": "Male", "shortName": "Male"},
        {"id": CAT_OPT_F, "name": "Female", "shortName": "Female"},
    ],
    "categories": [
        {"id": CAT_SEX, "name": "Sex", "shortName": "Sex", "dataDimensionType": "DISAGGREGATION",
         "categoryOptions": [{"id": CAT_OPT_M}, {"id": CAT_OPT_F}]},
    ],
    "categoryCombos": [
        {"id": CC_SEX, "name": "Sex", "dataDimensionType": "DISAGGREGATION",
         "categories": [{"id": CAT_SEX}]},
    ],
    "dataElements": [
        {"id": DE_PLAIN, "name": "XP cases", "shortName": "XP cases",
         "aggregationType": "SUM", "domainType": "AGGREGATE",
         "valueType": "INTEGER_ZERO_OR_POSITIVE", "zeroIsSignificant": False,
         "categoryCombo": {"id": CC_DEFAULT}},
        {"id": DE_DISAG, "name": "XD cases", "shortName": "XD cases",
         "aggregationType": "SUM", "domainType": "AGGREGATE",
         "valueType": "INTEGER_ZERO_OR_POSITIVE", "zeroIsSignificant": False,
         "categoryCombo": {"id": CC_SEX}},
        out_de(DE_THRESHOLD, "DQ - XP cases outlier threshold (mean + 2 SD)", "XP outl threshold"),
        out_de(DE_NOUT_VAL, "DQ - XP cases excluding outliers", "XP excl outlier"),
        out_de(DE_NOUT_CNT, "DQ - XP cases non-outlier count", "XP non-outl count"),
        out_de(DE_OUT_CNT, "DQ - XP cases outlier count", "XP outlier count"),
        out_de(DE_OUT_VAL, "DQ - XP cases outliers", "XP outliers"),
        out_de(DE_CONS_ALL, "DQ - XP cases orgunits reported in all the last 12 Months", "XP all last 12"),
        out_de(DE_CONS_ANY, "DQ - XP cases orgunits reported in any of the last 12 Months", "XP any last 12"),
        out_de(DE_COMPL_ANY, "DQ - XD cases data reported for any disaggregation", "XD any disaggr"),
    ],
    "dataSets": [
        {"id": DS, "name": "Test Monthly", "shortName": "Test Monthly", "periodType": "Monthly",
         "categoryCombo": {"id": CC_DEFAULT},
         "dataSetElements": [
             {"dataSet": {"id": DS}, "dataElement": {"id": DE_PLAIN}},
             {"dataSet": {"id": DS}, "dataElement": {"id": DE_DISAG}},
         ],
         "organisationUnits": [{"id": u} for u in FAC.values()]},
    ],
    "indicatorTypes": [
        {"id": IT_PERCENT, "name": "Percent", "factor": 100, "number": False},
        {"id": IT_NUMBER, "name": "Number (factor 1)", "factor": 1, "number": True},
    ],
    "predictors": [
        predictor(PD_THRESHOLD, "DQ - XP cases outlier threshold (mean + 2 SD)", "XP outl threshold",
                  DE_THRESHOLD, f"avg(#{{{DE_PLAIN}}}) + (2 * stddevPop(#{{{DE_PLAIN}}}))", 12, "DESCENDANTS"),
        predictor(PD_NOUT_VAL, "DQ - XP cases excluding outliers", "XP excl outliers",
                  DE_NOUT_VAL, f"if(#{{{DE_PLAIN}}}<=#{{{DE_THRESHOLD}}}, #{{{DE_PLAIN}}}, 0)", 0),
        predictor(PD_NOUT_CNT, "DQ - XP cases non-outlier count", "XP non-outl count",
                  DE_NOUT_CNT, f"if(#{{{DE_PLAIN}}}<=#{{{DE_THRESHOLD}}}, 1, 0)", 0),
        predictor(PD_OUT_CNT, "DQ - XP cases outlier count", "XP outlier count",
                  DE_OUT_CNT, f"if(#{{{DE_PLAIN}}}>#{{{DE_THRESHOLD}}},1, 0)", 0),
        predictor(PD_OUT_VAL, "DQ - XP cases outliers", "XP outliers",
                  DE_OUT_VAL, f"if(#{{{DE_PLAIN}}}>#{{{DE_THRESHOLD}}}, #{{{DE_PLAIN}}}, 0)", 0),
        predictor(PD_CONS_ALL, "DQ - XP cases orgunits reported in all the last 12 Months", "XP all last 12",
                  DE_CONS_ALL, f"if(sum(if(isNotNull(#{{{DE_PLAIN}}}),1,0)) == 12,1,0)", 12),
        predictor(PD_CONS_ANY, "DQ - XP cases orgunits reported in any of the last 12 Months", "XP any last 12",
                  DE_CONS_ANY, f"if(isNotNull(sum(#{{{DE_PLAIN}}})),1,0)", 12),
        predictor(PD_COMPL_ANY, "DQ - XD cases data reported for any disaggregation", "XD any disaggr",
                  DE_COMPL_ANY, f"(if(isNotNull(#{{{DE_DISAG}}}), 1, 0))", 0),
    ],
    "indicators": [
        indicator(IN_REF_CONS, "REF XP consistency 12m (%)", "REF XP cons12",
                  f"#{{{DE_CONS_ALL}}}", f"#{{{DE_CONS_ANY}}}"),
        indicator(IN_REF_EXCLOUT, "REF XP excluding outliers (%)", "REF XP exclout",
                  f"#{{{DE_NOUT_VAL}}}", f"#{{{DE_PLAIN}}}"),
        indicator(IN_REF_OUTPROP, "REF XP values that are outliers (%)", "REF XP outprop",
                  f"if( isNotNull( #{{{DE_OUT_CNT}}}), #{{{DE_OUT_CNT}}}, 0)",
                  f"#{{{DE_OUT_CNT}}}+#{{{DE_NOUT_CNT}}}"),
        indicator(IN_REF_COMPLANY, "REF XD completeness any disaggregation (%)", "REF XD complany",
                  f"#{{{DE_COMPL_ANY}}}", f"R{{{DS}.EXPECTED_REPORTS}}"),
        indicator(IN_NEW_COMPL, "NEW XP completeness (%)", "NEW XP compl",
                  f"subExpression(if(isNotNull(#{{{DE_PLAIN}}}), 1, 0))", f"R{{{DS}.EXPECTED_REPORTS}}"),
        indicator(IN_NEW_COMPLANY, "NEW XD completeness any disaggregation (%)", "NEW XD complany",
                  f"subExpression(if(isNotNull(#{{{DE_DISAG}}}), 1, 0))", f"R{{{DS}.EXPECTED_REPORTS}}"),
    ],
}

r = api("POST", "metadata", params={"importStrategy": "CREATE_AND_UPDATE", "atomicMode": "ALL"}, body=metadata)
rep = r.json()
print("metadata import:", rep.get("status"),
      json.dumps(rep.get("stats", rep.get("response", {}).get("stats", {}))))
if rep.get("status") not in ("OK", "SUCCESS"):
    for tr in rep.get("typeReports", []):
        for orep in tr.get("objectReports", []):
            for e in orep.get("errorReports", []):
                print("ERR", tr.get("klass", "?").split(".")[-1], e.get("message"))
    sys.exit(1)

# COCs for the Sex category combo
api("POST", "maintenance/categoryOptionComboUpdate", ok=(200, 204))

# give local_admin the OU tree (data capture + data view)
me = get("me", fields="id")
api("PATCH", f"users/{me['id']}", body={
    "organisationUnits": [{"id": OU_ROOT}],
    "dataViewOrganisationUnits": [{"id": OU_ROOT}],
})

# ------------------------------------------------------------- data values
cocs = get("categoryOptionCombos", filter=f"categoryCombo.id:eq:{CC_SEX}",
           fields="id,categoryOptions[id]", paging="false")["categoryOptionCombos"]
COC_M = next(c["id"] for c in cocs if any(o["id"] == CAT_OPT_M for o in c["categoryOptions"]))
COC_F = next(c["id"] for c in cocs if any(o["id"] == CAT_OPT_F for o in c["categoryOptions"]))
print("COC M/F:", COC_M, COC_F)

dvs = []
for fac, series in PLAIN.items():
    for pe, v in series.items():
        dvs.append({"dataElement": DE_PLAIN, "period": pe, "orgUnit": FAC[fac],
                    "categoryOptionCombo": COC_DEFAULT, "value": str(v)})
for fac, months in DISAG.items():
    for pe, byc in months.items():
        for sex, v in byc.items():
            dvs.append({"dataElement": DE_DISAG, "period": pe, "orgUnit": FAC[fac],
                        "categoryOptionCombo": COC_M if sex == "M" else COC_F, "value": str(v)})

r = api("POST", "dataValueSets", body={"dataValues": dvs})
resp = r.json().get("response", r.json())
print("dataValues import:", resp.get("status"), resp.get("importCount"))
print(f"total data values sent: {len(dvs)}")
