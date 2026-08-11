"""Create the candidate predictor-free (NEW) and hybrid (HYB) indicators.

NEW = pure indicators, no predictors at all:
  consistency : counts facilities via isNotNull over periodOffset -1..-12
  outliers    : inline mean + 2*SD over the same window (population SD),
                guarded with nested if() so SQL CASE short-circuits division
HYB = keeps only the threshold predictor (1 predictor + 1 DE), replaces the
  four comparison predictors with multi-DE subExpressions.
"""
import sys
sys.path.insert(0, '.')
from common import *  # noqa

DE = DE_PLAIN
THR = "DEthresh001"

offs_notnull = "+".join(f"if(isNotNull(#{{{DE}}}.periodOffset(-{i})),1,0)" for i in range(1, 13))
sum_x = "+".join(f"if(isNotNull(#{{{DE}}}.periodOffset(-{i})),#{{{DE}}}.periodOffset(-{i}),0)" for i in range(1, 13))
sum_x2 = "+".join(
    f"if(isNotNull(#{{{DE}}}.periodOffset(-{i})),#{{{DE}}}.periodOffset(-{i})*#{{{DE}}}.periodOffset(-{i}),0)"
    for i in range(1, 13))
n = f"({offs_notnull})"
mean = f"(({sum_x})/{n})"
sd = f"((({sum_x2})/{n} - {mean}*{mean})^0.5)"
thr_inline = f"({mean} + 2*{sd})"

CONS_ALL = f"subExpression(if({offs_notnull} == 12, 1, 0))"
CONS_ANY = f"subExpression(if({offs_notnull} > 0, 1, 0))"
# nested if -> SQL CASE, so the division by {n} is never evaluated when n = 0
NEW_EXCL_NUM = f"subExpression(if({n} > 0, if(#{{{DE}}} <= {thr_inline}, if(isNotNull(#{{{DE}}}),#{{{DE}}},0), 0), 0))"
NEW_OUT_NUM = f"subExpression(if({n} > 0, if(#{{{DE}}} > {thr_inline}, 1, 0), 0))"
REPORTED_T = f"subExpression(if(isNotNull(#{{{DE}}}), 1, 0))"

HYB_EXCL_NUM = f"subExpression(if(#{{{DE}}} <= #{{{THR}}}, #{{{DE}}}, 0))"
HYB_OUT_NUM = f"subExpression(if(#{{{DE}}} > #{{{THR}}}, 1, 0))"


def indicator(uid, name, short, num, den):
    return {"id": uid, "name": name, "shortName": short, "annualized": False,
            "indicatorType": {"id": IT_PERCENT},
            "numerator": num, "numeratorDescription": short,
            "denominator": den, "denominatorDescription": "denom"}


body = {"indicators": [
    indicator("INnewcons01", "NEW XP consistency 12m (%)", "NEW XP cons12", CONS_ALL, CONS_ANY),
    indicator("INnewexcl01", "NEW XP excluding outliers (%)", "NEW XP exclout", NEW_EXCL_NUM, f"#{{{DE}}}"),
    indicator("INnewoutp01", "NEW XP values that are outliers (%)", "NEW XP outprop", NEW_OUT_NUM, REPORTED_T),
    indicator("INhybexcl01", "HYB XP excluding outliers (%)", "HYB XP exclout", HYB_EXCL_NUM, f"#{{{DE}}}"),
    indicator("INhyboutp01", "HYB XP values that are outliers (%)", "HYB XP outprop", HYB_OUT_NUM, REPORTED_T),
]}

r = api("POST", "metadata", params={"importStrategy": "CREATE_AND_UPDATE"}, body=body)
rep = r.json()
print("import:", rep.get("status"), rep.get("stats"))
print("numerator length (NEW outprop):", len(NEW_OUT_NUM), "chars")
