# Operations: single Linux host

## Supported topology

Use one host with a local persistent filesystem for SQLite WAL. Run the HTTP API and build worker as separate supervised processes. Never share WAL files over NFS or mount the same database into unrelated hosts. Horizontal application/database HA is not implemented. Node 22.16.0 is the release floor; local acceptance also records the exact runtime used. Pin and requalify the runtime and OS on upgrades.

A browser calls the HTTPS Studio/API. A dedicated worker reads its durable queue from the same local database. Project-scoped CLI runners connect outbound over HTTPS and do not mount the control-plane database. The host application owns its own authenticated endpoints, business store and action ledger.

## Provision secrets and service accounts

Install the source read-only under `/opt/atelier` (or a versioned release symlink). Create a non-root `atelier` service user, a mode-0700 `/var/lib/atelier`, and `/etc/atelier` readable only by root/service group. Create a master-key file **outside the database backup directory**:

```sh
umask 077
node --input-type=module -e "import{randomBytes}from'node:crypto';console.log(JSON.stringify({primary:randomBytes(32).toString('base64')}))" > /etc/atelier/master-keys.json
```

Use `ops/platform.env.example` as your environment file. Production requires `NODE_ENV=production`, an HTTPS `ATELIER_PUBLIC_ORIGIN`, a master-key file, and persistent data directory. Bind the API to loopback. Set `ATELIER_WORKER=false` in the API process; use `scripts/worker.mjs` in a separate process. Disable sample imports. Do not boot `--demo` in production.

Create the first administrator in an empty database with the same environment:

```sh
node scripts/admin.mjs bootstrap --email=owner@example.com --name=Owner --tenant=Company
```

The generated password is shown once. Save it securely, sign in and enroll TOTP. Signed-out users may also create an account at `/signup`; no email-verification message or code is sent. A self-created account starts without access to any existing workspace. Existing workspace access still requires a single-use invitation, whose delivery is manual/private rather than a bundled email service. Bootstrap occurs before optionally setting `ATELIER_ALLOW_TENANT_CREATION=false` for a closed deployment.

## HTTPS proxy and service supervision

Example systemd units and Caddy configuration are in `ops/`. The local Docker application/certifier build and isolated certifier run passed, but systemd and TLS deployment were **not executed** in this environment. Review paths, users, domains, resource limits and your proxy version before installing.

Preserve the configured public Host header, pass HTTPS to clients, and overwrite—not append—`X-Real-IP`. `ATELIER_TRUST_LOOPBACK_PROXY=true` accepts a single syntactically valid real-IP header only from a loopback peer. Without it, login throttling uses the direct peer address. Do not expose the loopback service directly or let untrusted local users inject arbitrary trusted proxy requests. For a non-loopback/container proxy, leave this flag off and use a separately reviewed proxy-auth design rather than enabling broad forwarded-header trust.

The API has body/header timeouts, body caps and request IDs. Structured logs avoid request bodies, keys and model prompts. `/healthz` reports liveness; `/readyz` checks the database. Readiness does not mean a model account or worker is healthy; monitor queued job age, failed jobs, runner last-seen time, disk space, memory, backup age and provider usage.

The worker defaults to concurrency one. Use OS memory/CPU/process limits; malformed/expensive source is parsed in this worker, not executed or evaluated in the API process. A killed worker's jobs become reclaimable when their leases expire. External side effects remain host-only.

Production browser certification requires `ATELIER_CERTIFIER_MODE=docker` and a reviewed `ATELIER_CERTIFIER_IMAGE` digest. Build `ops/certifier.Dockerfile`, scan it, and run it with the existing no-network, read-only, capability-dropped invocation. The application refuses local certifier mode when `NODE_ENV=production`. `node scripts/container-acceptance.mjs` fails explicitly if Docker is unavailable; it does not substitute the local browser.

Run the canonical local gates with `ATELIER_PYTHON=/path/to/venv/bin/python npm run acceptance`. Release promotion additionally requires the live-provider matrix, immutable production images, deployment recovery/load evidence, and a signed independent security report for the exact commit. These remain separate gates because repository fixtures cannot establish them.

## Backups and restore

Use SQLite's online backup API, not an arbitrary copy of a live `.sqlite` file without its WAL:

```sh
node scripts/admin.mjs backup --out=/secure-backups/atelier-2026-09-06.sqlite
node scripts/admin.mjs verify
```

Encrypt backups, restrict permissions and store them off-host. Back up the master-key file **separately** under different access controls. Without the relevant master keys, restored API/signing/MFA secrets cannot be decrypted. Keep old keys while backups referencing them remain in retention.

Restore drill: stop API/worker; retain the old database and WAL for forensics; restore the online-backup file into a new private directory; set `ATELIER_DB_PATH`/`ATELIER_DATA_DIR` to it and supply matching master keys; run `admin verify`; boot on a private staging origin; test login, one scoped resolution and an audit chain; only then switch traffic. Restore the host's business database and action ledger according to its own recovery/idempotency policy. Database restore/integrity is tested in the offline suite; your infrastructure disaster-recovery drill is not.

## Upgrade and rollback

Back up before upgrading. Run verification against a clean extracted distribution. Keep database and keys outside the code release. SQL migrations are checksummed, transactional and forward-only; never edit an already applied migration. Start one migration-capable process first, verify, then start workers. Do not roll older code onto a newer schema without an explicit compatibility check; restore the matching database snapshot if an incompatible rollback is necessary.

Screen rollback is independent of software rollback. Publish a prior reviewed compatible release through the revision-checked deployment API/Studio. A stale or revoked signature/model is not resurrected as a shortcut.

## Rotation and revocation

API connections, project tokens, runner tokens and signing keys have explicit revocation. Scope changes are checked at use. To rotate encryption keys, add a fresh named key, set `ATELIER_ACTIVE_KEY_ID`, restart processes, run `admin rewrap-keys`, verify, then retain old keys until backup retention permits removal. Rotate project signing keys through the project key API; revoke compromised keys. The host bridge fails closed on revoked/unavailable authorization even if it has rendered an old UI.

`admin reset-password --email=...` is an audited operator recovery action. It revokes sessions/tokens and **does not remove MFA**. There is no unauthenticated MFA-reset API.

## Retention and limits

Defaults: 50 active projects/workspace, 40 queued/running jobs/workspace, two active jobs/workspace, snapshots of at most 1,200 files / 8 MB total / 512 KB each, 10 MB HTTP JSON bodies, 12 MB artifact cap, model cache seven days and bounded entries/project, telemetry 30 days. Token reservations are workspace-wide across projects. Project/API keys have limited token lifetimes; plan rotation.

Source, model, generated/released and screenshot artifacts are retained intentionally for provenance. There is no automatic destructive tenant purge, billing retention tier or legal-hold product in this release. Define customer-data retention and encrypted-volume policies before accepting real source/data. Project archive denies further access; it is not a claim of physical erasure.

## Host business recovery

A timed-out command might have committed upstream. `SqliteActionLedger` marks it uncertain and refuses automatic replay. Reconcile the stored operation ID with the authoritative business transaction. Only after checking that result may an operator call `reconcile()`. The host demo has a business idempotency table committed atomically with each update; use the equivalent in your application. Re-generating a confirmation ticket is a new intentional action, not a safe retry of an unknown prior effect.
