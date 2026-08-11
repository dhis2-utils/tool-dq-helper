"""Trigger full analytics table generation and wait for completion (robust)."""
import sys
import time
sys.path.insert(0, '.')
from common import *  # noqa

before = set(get("system/tasks/ANALYTICS_TABLE").keys())
r = api("POST", "resourceTables/analytics")
print("analytics start:", r.status_code, r.json().get("message", ""))

task = None
for _ in range(60):
    time.sleep(2)
    new = set(get("system/tasks/ANALYTICS_TABLE").keys()) - before
    if new:
        task = new.pop()
        break
if not task:
    print("no new analytics task appeared")
    sys.exit(1)

for _ in range(180):
    notes = get(f"system/tasks/ANALYTICS_TABLE/{task}")
    if notes and any(n.get("completed") for n in notes):
        print("analytics done:", notes[0].get("message"))
        break
    time.sleep(5)
else:
    print("TIMEOUT")
    sys.exit(1)
