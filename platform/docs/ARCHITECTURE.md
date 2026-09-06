# Architecture

## Three surfaces and five trust domains

**Build/control plane:** Studio/API → authorized project scope → immutable source snapshot → isolated build worker → repository scanner + TypeScript extractor → project model → authorized task → model or deterministic design → independent critique and repair → project-native kit → human review → signed staged/production release.

**Runtime plane:** existing host session → server HostBridge → scoped current-release resolution → signature/activation checks → host loader/object permission → field projection → browser surface. Action collection is followed by server authorization, a context/input-bound confirmation ticket and durable effect dispatch. A published screen does not call a model on ordinary render or interaction.

**Coding-agent plane:** private project configuration → protocol-pinned stdio MCP → current scoped HTTP reads → project model, published component source and versioned coding/design skills. MCP never exposes drafts or accepts tenant/project IDs as tool input.

**Trust domains:** the control plane stores and approves capabilities/artifacts; the host application owns business data and authority; project-bound CLI workers own isolated model accounts; the source certifier executes without network or control-plane credentials; coding agents receive only an explicitly scoped read token. No control-plane bearer token is a browser credential. No compiler prompt can acquire host permissions.

## Core records

All durable project records use `(tenant_id, project_id, …)` keys and foreign keys. Workspaces have members and project quotas. Projects have their own model, source snapshot, slots, connection selection, stage routing, settings revision, signing keys, releases and telemetry. Workspace membership does not automatically grant project visibility except for owners/admins.

Artifacts are immutable canonical JSON identified by content hash and scoped even when two tenants upload identical bytes. Project-model versions exclude timestamps/absolute temporary paths. Security reviews survive a rescan only when capability input/output/operation/kind fingerprints match. Changing an endpoint invalidates its prior review.

Build jobs are durable and lease-fenced. A late worker cannot complete an expired/cancelled/reclaimed job. Progress checkpoints reauthorize the creating user. Source parsing runs in a dedicated worker process in the production profile so it cannot block HTTP service. Inference tasks independently fence project-runner leases and validate exact JSON output before acceptance.

## Models and caching

A provider-neutral gateway owns scoping, retries, accounting, schema validation and provenance. Its artifact key includes tenant/project, connection revision, model, schema, system instructions, actual input and image hashes. Caches never cache an authorization decision. Token reservations apply across a tenant's projects and are conservatively settled when provider usage is absent or outcome is uncertain. They are not a dollar invoice or a perfect provider spend cap.

The persistent control plane serves an already published release. The preserved local runtime library also supports structural cache cohorts, bounded patches and last-known-good artifacts. A last-known-good UI is **not** an excuse to retain revoked action authority: the host bridge requires current authorization and falls back when the control plane is unavailable.

## Designs and generated code

The original bounded experience compiler remains available for structured screens. V2.3's Source Forge adds project-native React TSX/CSS with explicit project modules, data contracts, actions and task tests. Generated source is typechecked and bundled against the lockfile, evaluated in a sandbox document across a fixed browser matrix, independently reviewed, then human approved and signed. Reuse of a compatible published component precedes new generation. Source checks and model critique are not an OS sandbox; production browser evaluation requires the isolated container mode.

## Publication

Staging drafts require human preview confirmation. Promotion creates a production draft, not automatic exposure. The production review policy defaults to different creator/approver. Review rows are immutable and bind the artifact hash. Publication rechecks the current model, reviewer access, signature and deployment revision. Rollout percentages use stable subject cohorts; rollback is similarly revision-checked. Revoked signing keys cannot authorize new resolution.

## Fail-closed behavior

Missing provider → explicit configuration error. Failed model critique → no new approved release. Missing/changed model or invalid signature → host fallback. Missing permission → deny. Unknown component/capability/field → compilation/validation failure. Business effect interruption → uncertain, no automatic replay. Unknown schema constraint → explicit validation rejection rather than pretending it was enforced.
