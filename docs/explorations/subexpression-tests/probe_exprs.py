"""Probe which candidate expressions the running version accepts.
POST /api/indicators/expression/description validates numerator/denominator syntax.
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
threshold_inline = f"({mean} + 2*{sd})"

CASES = {
    "single-item subExpression": f"subExpression(if(isNotNull(#{{{DE}}}),1,0))",
    "power operator ^": f"#{{{DE}}}^0.5",
    "sqrt function": f"sqrt(#{{{DE}}})",
    "periodOffset outside subExpression": f"#{{{DE}}}.periodOffset(-1)",
    "periodOffset inside subExpression": f"subExpression(if(isNotNull(#{{{DE}}}.periodOffset(-1)),1,0))",
    "multi-DE subExpression": f"subExpression(if(#{{{DE}}} > #{{{THR}}}, 1, 0))",
    "consistency all-12 subExpression": f"subExpression(if({offs_notnull} == 12, 1, 0))",
    "consistency any-12 subExpression": f"subExpression(if({offs_notnull} > 0, 1, 0))",
    "inline outlier count subExpression": (
        f"subExpression(if(if(isNotNull(#{{{DE}}}),#{{{DE}}},0) > {threshold_inline}"
        f" && {n} >= 3, 1, 0))"),
    "inline non-outlier value subExpression": (
        f"subExpression(if(isNotNull(#{{{DE}}}) && ({n} < 3 || #{{{DE}}} <= {threshold_inline}), #{{{DE}}}, 0))"),
}

print(f"expression lengths: outlier-count={len(CASES['inline outlier count subExpression'])} chars")
for name, expr in CASES.items():
    r = S.post(f"{BASE}/api/indicators/expression/description",
               data=expr, headers={"Content-Type": "text/plain"})
    j = r.json()
    status = j.get("status")
    msg = j.get("message", "")
    desc = (j.get("description") or "")[:60]
    print(f"{'OK ' if status=='OK' else 'ERR'} | {name:42s} | {msg[:80] if status!='OK' else desc}")
