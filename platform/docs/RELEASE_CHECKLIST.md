# Atelier 2.3 release checklist

1. Use the declared Node/npm and Python Playwright versions; run `npm ci` from an empty `node_modules` state.
2. Run `ATELIER_PYTHON=/private/venv/bin/python npm run acceptance`; inspect every generated log and screenshot.
3. Run `npm ci`, `npm run test:unit`, and `npm run verify` from `platform/` in a clean checkout.
4. Run the private live provider matrix for at least one API provider and both configured CLI trust boundaries; never replace a failed provider.
5. Build, scan, digest-pin, and exercise the service and certifier images with the target Linux kernel/runtime.
6. Perform target-infrastructure restore, key rotation, worker recovery, rollback, retention, monitoring, and bounded load drills.
7. Obtain a signed independent security report for the exact commit with no open critical/high findings.
8. Run `npm run acceptance -- --profile=release`; it must report `releaseReady: true` with no missing, failed, blocked, timed-out, or skipped gate.
9. Build the source archive from that commit, record SHA-256 and inventory, push, fetch, and confirm remote readback matches.

Until every step is evidenced, keep the version an RC and do not describe it as production-certified.
