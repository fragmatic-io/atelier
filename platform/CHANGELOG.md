# Changelog

## Unreleased — hosted runtime and intelligent design

Replaces framework-specific generated bridges with one origin-bound hosted module script. Atelier serves the signed surface, configured chatbot and approved design contract; the customer browser executes every reviewed API tool through its existing same-origin application session. Hosted conversation state uses a sealed short-lived install session that grants no customer API authority. The runtime denies unknown capabilities and cross-origin URLs, requires explicit command confirmation, forwards host CSRF for reviewed mutations, and requires no customer API credential, package or server bridge.

Adds an optional agentic Design Genome synthesis after deterministic human approval. Model guidance must cite exact role/property/value evidence from the immutable approved contract, fails on invented evidence, and requires a separate human review before generation consumes it. Fixes React StrictMode remount lifecycle fencing and adds a regression test.

Adds a deterministic OpenAPI 3.1 exporter for current project-model HTTP capabilities and a locally served, authenticated Redoc reference inside each Studio project. The generated document preserves contract provenance, review state, permissions, risk, confirmation, side effects, idempotency, reversibility and PII metadata. Documentation does not make an unreviewed capability callable.

Adds self-service Studio signup with name, email and password. New accounts receive an authenticated browser session immediately without email verification and start with no access to existing workspaces.

Adds atomic bulk capability review in Studio with select-visible and approve-all-pending controls. Review approval remains separate from agent exposure, is pinned to the exact project-model version, and never enables tools implicitly. Reviewers can also reopen selected decisions without erasing the append-only audit history.

Makes `npm run test:browser` select `ATELIER_PYTHON` or the documented project virtual environment explicitly and pass that same interpreter into nested component certification. Missing Playwright environments now fail with a setup-specific error instead of a generic child-process exit.

Adds a decision-complete coding-agent handoff for installing Atelier into another application, wiring host authority, enabling the embedded agent and rich components, registering project MCP, and verifying the integration without provider fallback.

Restores the embedded agent, client, journal, artifact, chat and source-forge package subpath exports found during RC2 comparison; adds current declarations, scoped standalone chat styles, external-consumer typechecking, and a credential-free project-skill exporter.

## 2.3.0-rc.1 — source forge, embedded agent and coding-agent MCP

Adds project-native React source generation with locked compiler dependencies, actual browser state/task certification, explicit human approval and signed component publication. Adds durable private conversations, reviewed host tools, exact-input confirmation, attachments, interactive artifact revisions and the integrated Studio/host agent journey.

Adds a read-only project-scoped MCP server using the stable v2 SDK and pinned 2026-07-28 protocol, plus live versioned coding/design skill resources and published-component source retrieval. Fixes the component HTTP router contract and unregistered-tool failure persistence.

Adds a canonical nested-test/package/audit/browser acceptance runner, dependency lock and zero-vulnerability production audit, production-only container certifier requirement, explicit live-provider/container/independent-security gates, and a requirement ledger. The local Linux application and certifier image gates pass; the release remains an RC while live API-provider and independent-security gates are blocked.

## 2.1.0-rc.1 — audited multi-tenant platform

This source release adds a persistent platform around the original local V2 modeling utilities. It does not merely change the UI or relabel old PASS markers.

### Isolation and durability

Tenant/project composite identities, branded access scopes, explicit project membership, scoped API credentials, separate provider-runner boundaries, durable jobs with lease fencing and cancellation, permission-aware cache identities, checksummed migrations, full-synchronous SQLite WAL, immutable artifacts, online backup and integrity checks.

### Accounts and action safety

Scrypt with shared resource admission, race-safe password changes, TOTP/recovery flows, session revocation, CSRF and origin validation, immediate token revocation, default production separation of duties, signed releases, exact-artifact review binding, rollback revisions, server-side object authorization, field projection, HMAC-bound confirmations and durable action replay prevention. The host demo records operation IDs in the same transaction as business changes.

### Provider portability

OpenAI Responses, Anthropic Messages, Gemini, approved HTTPS compatible endpoints, isolated Codex CLI and Claude Code CLI runners; schema-checked artifacts, bounded network/process output, cancellation, timeout and environment isolation. Real-provider/account calls remain external acceptance checks.

### Product and design

Interactive multi-project Studio, source upload and capability review, actual TypeScript AST analysis, three candidate surfaces, token-based native source exports, state previews, optional image-critique job, staging/production release management, responsive light/dark UI, actual host-app extension and typed server/browser/React exports.

### Audit fixes

Wired missing host actions; removed cross-tenant cache ambiguity; replaced static-only Studio; corrected source-version instability; prevented inferred commands from becoming authorized actions; bound review to immutable bytes; removed false-positive visual quality claims; repaired archive input schema; tested concurrent password changes, revoked sessions, worker lifecycle and duplicate business actions; verified real offline npm packaging.

### Release boundaries

Single-host operational deployment, not HA/PostgreSQL. Generated surfaces use a bounded operations grammar, not arbitrary unrestricted component invention. External React 18/19 integration, live provider account behavior, target deployment recovery/load testing and independent security/user-quality evaluation must be completed for a production rollout. See IMPLEMENTATION_STATUS and RELEASE_CHECKLIST.
