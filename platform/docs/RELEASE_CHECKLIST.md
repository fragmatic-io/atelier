# Atelier 2.3 release checklist

1. Use the declared Node/npm and Python Playwright versions; run `npm ci` from an empty `node_modules` state.
2. Run `ATELIER_PYTHON=/private/venv/bin/python npm run acceptance`; inspect every generated log and screenshot.
3. Run `npm ci`, `npm run test:unit`, and `npm run verify` from `platform/` in a clean checkout.
4. Run the private exact live provider matrix for at least one API provider and both configured CLI trust boundaries; never replace a failed provider. Also collect real generated-workflow evidence through browser certification, visual review, approval/publication, host queries/actions, replay protection, uncertain outcomes, and revocation.
5. Build, scan, digest-pin, and exercise the service and certifier images with the target Linux kernel/runtime.
6. Perform target-infrastructure restore, key rotation, worker recovery, rollback, retention, monitoring, and bounded load drills.
7. Obtain a signed independent security report for the exact clean source/commit, dependency lock, and toolchain with no open critical/high findings. The reviewer identity/key must come from the operator's separate trust policy.
8. Assemble the four signed, hash-bound reports using [RELEASE_EVIDENCE.md](RELEASE_EVIDENCE.md), set `ATELIER_RELEASE_POLICY` and `ATELIER_RELEASE_EVIDENCE`, and run `npm run acceptance -- --profile=release`. It must report `releaseReady: true` with no missing, failed, blocked, timed-out, or skipped gate; ledger status strings cannot authorize this result.
9. Build the source archive from that commit, record SHA-256 and inventory, push, fetch, and confirm remote readback matches.

Until every step is evidenced, keep the version an RC and do not describe it as production-certified.

`npm run verify` executes the complete Node suite serially with a ten-minute budget and records TAP totals, then installs and checks the actual package in an empty consumer. A timeout remains a failed gate; the budget does not omit cases or relax their assertions. Canonical acceptance independently checks complete test totals and rejects skipped or unfinished tests.
