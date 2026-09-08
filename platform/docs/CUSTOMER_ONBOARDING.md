# Customer onboarding and capability discovery

Atelier SaaS does not require a customer to upload application source code. The default onboarding path learns API capability contracts from a privacy-safe browser observer and customer-supplied API specifications. Source scanning remains an explicit developer option for self-hosted or separately authorized projects.

## Guided Studio flow

Create a project and open **Setup**. Studio shows five fact-derived stages:

1. **Connect discovery** creates an ingest-only browser key restricted to exact application origins and generates the snippet to paste before the closing `body` tag.
2. **Collect evidence** records new operation/schema revisions or imports an OpenAPI 3.x file or public HTTPS URL.
3. **Review capabilities** shows evidence provenance, a deterministic recommendation, editable purpose and safety fields, and separate approval and chatbot-exposure decisions.
4. **Configure delivery** offers two explicit outputs from the same reviewed inventory: custom additive surfaces and an optional chatbot agent. A human reviews the computed host design contract before **Install hosted UI** generates one script for a new route, existing-page mount or drawer. Chatbot setup binds selected tools, voice, retention, bounded specialist roles and a real model connection to the current project-model version.
5. **Verify and publish** tests both delivery tracks: customer API authorization, unreviewed action/tool denial, rich query rendering, exact command confirmation and explicit provider/network failure behavior. Setup remains incomplete until there is both a current published surface and a factual installation receipt proving the reviewed design contract, mount, hosted runtime and browser API client initialized.

The status API is `GET /api/tenants/{tenant}/projects/{project}/onboarding`. It derives every step from active discovery sources, stored observations, the current model, recorded review decisions, a current agent profile, a live provider/runner, current published releases and verified surface-install receipts. A UI checkbox cannot mark a step complete.

## Browser snippet

Studio generates a project-specific snippet:

```html
<script
  src="https://atelier.example/observe/v1.js"
  data-project-key="atl_obs_REDACTED"
  data-environment="production"
  defer
></script>
```

The key is public and ingest-only. It cannot read the project, run tools, generate artifacts or publish releases. Exact allowed-origin checks and rate limits reduce abuse, but browser evidence is never treated as authoritative because non-browser clients can forge an Origin header. It remains `observed` evidence and always requires human review.

The customer application Content Security Policy must allow the Atelier script origin in `script-src` and the collector origin in `connect-src`. A blocked browser policy produces an explicit console error and the Studio dashboard remains waiting for contact.

To learn host-native presentation without source access, mark one approved shell and optional representative controls:

```html
<div data-atelier-design-root>
  <nav data-atelier-design-role="nav">...</nav>
  <section data-atelier-design-role="card">...</section>
  <button data-atelier-design-role="button">...</button>
  <input data-atelier-design-role="input" />
</div>
```

Enable **Learn the host design contract** when creating the snippet. The observer reads a fixed allowlist of computed typography, color, spacing, radius, control-size and shadow properties. It does not send page text, HTML, selectors, form values or user data. Studio shows the observed values for human correction and approval. A new fingerprint never silently replaces the approved contract.

After approval, **Synthesize design** can ask the configured project model to interpret those sanitized values into semantic density, hierarchy, interaction tone and component-pattern guidance. This is an explicitly separate agentic stage. Every pattern cites exact approved evidence and remains a reviewable draft; invented or mismatched evidence fails the job. A human must approve the synthesis before surface generation can consume it, and the deterministic contract remains the rendering boundary.

For role-specific evidence, set only a non-personal cohort label after authentication changes:

```js
window.AtelierObserver.setContext({ userRole: 'reviewer' });
```

Do not pass an email, account ID or display name. Atelier stores a contract revision once and records each new environment, role and application-page context separately.

## What is collected

The default schema-only lane sends:

- HTTP method and normalized path template
- input and output field names and JSON-compatible types
- status-code class
- environment, normalized application page and configured role cohort
- a SHA-256 fingerprint of method, path and schemas

It never sends source code, headers, cookies, credentials, query strings, raw request/response bodies or entity URLs. The observer wraps same-origin `fetch` and `XMLHttpRequest` without changing their returned values. It replaces numeric IDs, UUIDs, long opaque path segments and undecodable path segments with `{id}` before transmission.

The browser keeps successful delivery keys in local storage, so the same contract/context is not sent again. The control plane independently deduplicates across browsers and sessions. A payload-free page-session heartbeat updates source contact status without resending capability data.

## Optional semantic samples

Semantic samples are disabled until the customer explicitly enables them while creating the source. When enabled:

- redaction happens in the customer page before the collector request;
- credential-shaped fields are removed;
- PII-shaped fields and values become typed redaction markers;
- free text becomes a short/medium/long marker;
- identifiers become redaction markers;
- exact numbers become magnitude buckets;
- arrays retain at most one projected shape sample;
- only explicitly allowlisted short categorical fields may retain their value.

Example configuration:

```html
<script
  src="https://atelier.example/observe/v1.js"
  data-project-key="atl_obs_REDACTED"
  data-environment="production"
  data-semantic-samples="true"
  data-safe-sample-fields="status,severity,plan"
  defer
></script>
```

The server applies the projection again and rejects samples when the discovery source does not permit them. The browser dispatches an `atelier:observation-preview` event containing the exact sanitized envelope immediately before transmission, allowing customer developers to inspect what leaves the page.

Heuristic redaction is not a DLP guarantee. High-risk customers should keep semantic samples disabled or use a customer-controlled server collector with organization-specific DLP before sending evidence to Atelier.

## OpenAPI evidence

Studio accepts an OpenAPI 3.x JSON/YAML file or a public HTTPS URL. URL import rejects credentials, redirects, IP literals, local/private hostnames, private DNS answers, oversized responses and specifications above 2 MB. Production deployments must also enforce outbound network policy at the infrastructure layer.

For a local development API or any private-network service, use the file-upload control. A blocked URL is an SSRF-policy result, not an API-documentation failure: after a valid file is accepted, Atelier generates the authenticated Redoc reference from the resulting project model.

OpenAPI is `declared` evidence. Runtime calls are `observed` evidence. Studio shows both and does not silently replace one with the other:

- declared and observed: high-confidence operation existence;
- declared but not observed: unverified usage;
- observed but not declared: undocumented operation;
- changed input/output fingerprint: contract drift and renewed review required.

## Custom surfaces and chatbot boundary

Every capability has independent states:

```text
discovered != approved != chatbot enabled != published
```

Studio recommendations are deterministic starting points based on operation kind, declared/observed provenance and PII-shaped fields. They never grant authority. A reviewer can edit the name, purpose, risk, confirmation rule, permission scopes, PII paths and reversibility; approve or reject the capability; and separately choose chatbot exposure.

Reviewers can filter and select operations, approve the selection, or approve every pending operation in one atomic action. The server binds that decision to the exact project-model version and rejects the entire request if the inventory changed or any selected operation violates a safety invariant. Bulk approval never enables agent access. Agent exposure is a separate bulk action for already-approved capabilities. Reopening a review returns it to pending, disables its agent access and appends recovery records without deleting the original audit events.

An approved capability may be composed into a custom rail, queue, dashboard, form or rich response component. That does not publish it: generated surface source must pass browser certification, human review, signing and slot-scoped publication. Conversely, checking chatbot exposure does not create or publish a custom surface.

The agent profile accepts only capabilities that are both security reviewed and explicitly chatbot enabled. The hosted setup registers every selected primary-agent tool for execution in the signed-in customer browser; specialists keep read-only subsets and cannot delegate again. A model-selected unknown or disabled tool fails before browser execution, and commands retain explicit confirmation. The customer backend remains responsible for current tenant, user, object and business-rule authorization on every call.

### Primary agent and bounded specialists

Studio configures the user-facing primary assistant and optional research, workflow and explanation specialists. Each specialist is a separate provider turn with reviewed instructions and a non-empty subset of the primary agent's approved read-only tools. Specialists cannot receive commands, widen permissions, render an artifact directly or delegate recursively. The profile caps consultations per answer and the existing total round limit still applies.

Delegation requests, specialist tool steps and evidence briefs are encrypted with the conversation and omitted from the customer transcript. Audit events identify which configured specialist ran. The primary agent receives the evidence brief and must synthesize the final response; it alone may select a certified rich component. A specialist cannot make an unavailable API callable or turn model output into host authority.

## Where markup and components run

Custom surfaces render in a customer-owned mount while Atelier serves the versioned UI/runtime. Reviewed HTTP calls execute directly from the customer page under its origin, existing authenticated browser session and Content Security Policy. The customer API remains authoritative for tenant, permission, object and business-rule checks.

Atelier's control plane serves Studio, discovery, API documentation, reviewed capability metadata, signed releases and their certified UI. It does not stream arbitrary model-authored HTML into the customer page. Model output cannot grant an action, register a component, choose an arbitrary URL or bypass the reviewed operation registry.

A full-page surface requires an explicit customer-owned route and, if desired, a navigation link. An embedded card, rail, drawer or chatbot requires only an approved mount container on an existing page. The discovery observer never creates a route, inserts a link or changes the DOM. Studio may serve a sandboxed preview for review, but that preview is not the production host integration.

## One-script hosted surface installation

Choose **Install hosted UI** after publishing an approved slot. Supply the exact customer origin, placement, page path, navigation label, slot and environment. Studio returns one snippet containing a customer-owned mount and an Atelier-hosted module script. There are no framework-specific files, packages, server bridge or API credentials. The origin-bound public key selects only this install's current signed UI/chat manifest and reports installation facts. When a current reviewed chatbot profile and real provider exist, the same mount includes the assistant automatically.

The customer page CSP must allow the exact Atelier origin in `script-src`, `connect-src`, `style-src` and `frame-src`. The last directive is required for signed sandboxed rich-component frames; omitting it leaves the artifact pane visibly blocked rather than substituting local markup.

For a full page, the customer applies the generated route and consciously places the generated navigation component. For an inline or drawer placement, the recorded route identifies the existing host page and the customer places the generated mount there. Atelier does not guess or mutate an unknown application file.

The mounted client reports the current bundle hash while Studio verifies four facts: reviewed design binding, customer mount, hosted UI load and reviewed browser API-client initialization. Studio records `waiting`, `partial` or `verified` from those facts. The receipt is not proof that the customer API authorizes correctly and never grants authority; customer authorization tests and human review remain mandatory.

Entity pages can provide a minimal synchronous `window.AtelierHost.context()` object containing only reviewed identifiers or coarse state required by tool inputs. This is optional client context, not a server bridge. It must not expose credentials, full records or arbitrary DOM content.

Atelier will compose a required-input query into a surface only when the selected slot contract guarantees those inputs through `contextSchema.required`. Otherwise the query remains usable as an approved chatbot tool, where the model must first obtain or request the exact identifier. This prevents a dashboard from eagerly issuing invalid detail requests while preserving deeper multi-step investigation.

Re-publishing an improved Atelier surface does not require a new route. The host keeps the same approved slot while signed release resolution selects the current compatible experience. Changes outside an Atelier-owned slot remain customer-owned code changes and must be delivered as an explicit reviewable patch.

## Product intelligence and personalization boundary

Atelier's product loop has distinct evidence and decision layers:

1. API discovery establishes what the application can do and where operations are used.
2. Separately enabled semantic workflow telemetry can establish cohort-level friction such as repeated route transitions, filters, copies, failures and abandonment. API observation alone does not prove user intent or friction.
3. The opportunity miner proposes evidence-backed goals and insertion points; a human approves the capability, slot, data projection and release.
4. The chatbot may call only its independently approved tool allowlist and render only certified rich components.
5. A published surface may reorder, prioritize or change density only within its declared adaptation level and approved Atelier slot. Atelier never silently rewrites arbitrary host UI.

Cohort- and task-level adaptation is the safe default. Per-user personalization additionally requires the customer's explicit policy, consent basis, retention controls and audit rules. Do not send email addresses, account identifiers or display names as behavior labels.

## Tests required before customer publication

- foreign origins and revoked observer keys are rejected;
- duplicate contracts and contexts do not create duplicate inventory entries;
- PII, credentials, free text and identifiers do not survive sample projection;
- a changed contract fingerprint invalidates its previous review;
- rejected and unreviewed capabilities cannot enter the agent profile;
- an approved capability remains unavailable to chat until separately enabled;
- host tenant and object authorization deny unauthorized calls;
- commands require exact input-bound confirmation and idempotency;
- provider failure remains explicit and does not publish a new artifact.
- generated framework files compile and server modules pass syntax checks;
- a foreign origin, stale bundle hash or revoked install key cannot verify a mount;
- install status stays partial until design, mount, hosted runtime and browser API-client facts are all true;
- unsafe design values are rejected and no installer is generated before human design approval;
- specialists cannot receive commands or tools outside the primary reviewed allowlist;
- internal specialist notes stay encrypted and only the primary synthesized answer enters the customer transcript.
