# Security model and deployment boundary

## Boundaries enforced in code

Every project read/mutation begins with authenticated workspace and project authorization. Artifacts, jobs, caches, releases, signing keys and telemetry carry both tenant and project IDs. Project and runner bearer tokens are exact-scope, expire and recheck current membership. API credentials are AES-256-GCM encrypted with scope-bound associated data. Signed releases are verified again on resolution and by the host bridge.

Sessions are HttpOnly/SameSite=Strict (Secure in production), with absolute/idle expiry and CSRF tokens. Mutating browser requests need an exact Origin. Unrecognized Host and cross-site mutations are rejected. Password operations use scrypt and share an expensive-work concurrency limit. TOTP counters and recovery-code consumption are transactional. Password changes revalidate the session after asynchronous hashing and revoke sessions and tokens.

Snapshots have size/file/type limits, reject traversal and likely secret material, and never execute application code, installation scripts, imported modules or server actions. Schema/keyword and static extraction are not permission authorities. Unknown command safety requires explicit review. Source, retrieved documentation and model output are untrusted data; a schema-valid model answer still cannot introduce capabilities, fields or executable code outside the approved task.

Model API egress allows HTTPS operator-approved hosts, rejects private IPs, pins DNS resolution and forbids redirects. CLI executables/account homes are operator configuration, never tenant-supplied commands. Subprocesses use no shell, private temporary directories, byte/time limits and process-group cancellation. **A different HOME is not an OS sandbox.** Use separate accounts/containers and no mount of unrelated repositories, host secrets, SSH agents or the control-plane database.

Generated React source has explicit import, syntax, data, CSS-egress and output-size policy. Local browser evaluation is a development path only. In production the certifier refuses local mode and invokes a network-disabled, read-only, capability-dropped container with bounded CPU, memory and processes. A reviewed immutable image digest and deployment sandbox test are still required.

The stdio MCP server is read-only and binds tenant/project identity in its private configuration rather than tool arguments. It pins the 2026-07-28 protocol and refuses legacy negotiation. Every tool/resource read goes back to the HTTP API, so token expiry/revocation and membership/project changes take effect immediately. Only published components are returned. Project text and generated skills are untrusted evidence and confer no capability authority.

Runtime queries/actions must use the host's current server-side identity. The host bridge re-resolves the active signed release and checks permissions and caller-defined object authorization on every operation. Confirmation tickets bind user, project, environment, action, entity context, input, release and expiry. Tickets prove an authorized two-step request, not that a human actually read a dialog. Host authentication, authorization and business preconditions remain mandatory.

Durable action keys prevent duplicate delivery. There is no invented distributed exactly-once guarantee: an interrupted effect is uncertain until reconciled with the system of record. Propagate the provided operation ID into that system's transactional idempotency mechanism. The host demo does this for its business update.

## Important limitations

- The same authorized workspace administrator can configure projects and shared API connections. For mutually untrusted operational administrators, use separate deployments/master keys.
- SQLite, source artifacts, prompts/structured inference tasks and uploaded redacted screenshots live on local disk. Secret values are encrypted, but the whole database is not. Use encrypted volumes, encrypted backups, restricted service accounts and a retention policy.
- PII/secret detection is conservative heuristic support, not a DLP certification. Review snapshots and use semantic route templates; arbitrary names or short identifiers cannot reliably be classified.
- Append-only triggers/hash chains reveal accidental or ordinary API tampering. A root/database administrator who controls the program and keys can rewrite storage; export audit chain heads to independently controlled storage for stronger tamper evidence.
- No SSO/SAML/OIDC, SMTP delivery, billing/entitlements, enterprise directory or independent pen-test certification is claimed. Invitations are one-time links delivered by the administrator. Password recovery is an audited operator procedure; MFA is not silently removed.
- Node's `node:sqlite` API is experimental in the tested Node 22.16.0 runtime. Pin and requalify the runtime on upgrades.
- Native generated TSX is build-time source for a developer-reviewed merge. Static source checking is not a JavaScript security sandbox. Never load fresh generated code into the live browser based solely on a successful lint or model critique.

## Reporting and response

Do not post credentials, customer snapshots or private traces in public issues. Contact the deployment/repository owner through their private security channel. Retain request/job IDs, affected versions and a redacted reproduction. Revoke affected tokens/connections/signing keys, pause publication, rotate master keys as needed, and verify audit chains and backups. There is no vendor-hosted incident response or support SLA bundled with this source archive.
