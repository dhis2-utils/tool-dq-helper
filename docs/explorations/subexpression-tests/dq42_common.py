"""Shared config for the agent-dq42 (2.42 + Laos demo) validation."""
import sys
import requests

BASE = "http://dhis2-agent-dq42:8080/api"
S = requests.Session()
S.auth = ("local_admin", "district")


def api(method, path, params=None, body=None):
    r = S.request(method, f"{BASE}/{path}", params=params, json=body)
    if r.status_code >= 400:
        print(f"!! {method} {path} -> {r.status_code}\n{r.text[:1500]}", file=sys.stderr)
    return r


def get(path, **params):
    return api("GET", path, params=params).json()


# source data elements (Laos HMIS demo, same lineage as dqtest)
SRC = {
    "ANC": ("qqc4NnWVFL9", "ANC 1"),
    "DPT": ("TWWbtMMWD51", "DPT 3"),
    "MAL": ("KV1LlPytf4f", "Malaria confirmed cases"),
}
