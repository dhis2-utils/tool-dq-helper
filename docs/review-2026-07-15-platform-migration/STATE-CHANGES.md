# State changes: tool-dq-config platform migration review

Date: 2026-07-15 · Reviewer: agent (Claude Code)

## Broker instances

| Instance          | Version / seed                                       | Purpose                                                          | Status                    |
| ----------------- | ---------------------------------------------------- | ---------------------------------------------------------------- | ------------------------- |
| `agent-dq-sl41`   | 2.41.9 / `dhis2-db-sierra-leone_v41`                 | full functional suite                                            | **deleted** after testing |
| `agent-dq-sl43`   | 2.43.0.1 / `dhis2-db-sierra-leone_v43`               | smoke suite + global-shell check                                 | **deleted** after testing |
| `agent-dq-laos41` | 2.41 / `lao_hmis_demo_v41`                           | smoke suite (Laos demo data)                                     | **deleted** after testing |
| `agent-dq-laos43` | 2.43 / `lao_hmis_demo_v41` (Flyway-migrated on boot) | smoke suite, 41→43 DB migration path                             | **deleted** after testing |
| `agent-dq-manual` | 2.43.0.1 / `dhis2-db-sierra-leone_v43`               | M1/M2/L3 verification + user-manual screenshots (follow-up pass) | **deleted** after testing |
| `agent-meta-rt-b` | pre-existing (not created by this review)            | —                                                                | left untouched            |

## Mutations made on test instances (all disposable, all deleted)

- Installed/reinstalled the app zip via `POST /api/apps` (several times per instance as fixes landed).
- App initialisation created: user group "DQ - DQ Config Admin", 1 data element group, 1 indicator group, 4 predictor groups, `dqConfig` dataStore namespace.
- Repeated configure/import/delete cycles for the test data element; orphaned metadata from bug reproduction was cleaned via `POST /api/metadata?importStrategy=DELETE` between runs.
- One scratch data element (`ZZ dryrun test DE`) created and deleted while proving the DHIS2 `dryRun=true` DELETE bug.

## Repository / working tree changes

- Full migration of the app from vanilla-JS/webpack to the DHIS2 App Platform (see review findings). Old `src/`, `webpack.config.js`, `manifest.webapp`, `yarn.lock`, `d2auth*.json` removed; new TypeScript sources under `src/`, platform config at repo root.
- `docs/user-manual.md`: deletion-safety-check section updated (four checks → three; dry-run removed; app-edit exemption documented).
- New e2e suite at `tests/e2e/lifecycle.sh` (parameterized by `DHIS2_URL`).
- Review reports in `docs/review-2026-07-15-platform-migration/`.
- **Nothing committed** — all changes are in the working tree on branch `platfor-migration-review`.

## Not reverted / left behind

- None on any surviving system. All `agent-dq-*` instances deleted; no changes made to non-disposable systems.
