# Customer onboarding and capability discovery

Atelier SaaS does not require a customer to upload application source code. The default onboarding path learns API capability contracts from a privacy-safe browser observer and customer-supplied API specifications. Source scanning remains an explicit developer option for self-hosted or separately authorized projects.

## Guided Studio flow

Create a project and open **Setup**. Studio shows five fact-derived stages:

1. **Connect discovery** creates an ingest-only browser key restricted to exact application origins and generates the snippet to paste before the closing `body` tag.
2. **Collect evidence** records new operation/schema revisions or imports an OpenAPI 3.x file or public HTTPS URL.
3. **Review capabilities** shows evidence provenance, a deterministic recommendation, editable purpose and safety fields, and separate approval and chatbot-exposure decisions.
4. **Configure delivery** offers two explicit outputs from the same reviewed inventory: custom additive surfaces and an optional chatbot agent. Surface design creates a certifiable project-native experience; chatbot setup binds selected tools, voice, retention and a real model connection to the current project-model version.
5. **Verify and publish** tests both delivery tracks: host authorization, unreviewed action/tool denial, rich query rendering, exact command confirmation and explicit provider/network failure behavior before a signed surface release or agent rollout.

The status API is `GET /api/tenants/{tenant}/projects/{project}/onboarding`. It derives every step from active discovery sources, stored observations, the current model, recorded review decisions, a current agent profile, a live provider/runner and current published releases. A UI checkbox cannot mark a step complete.

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

An approved capability may be composed into a custom rail, queue, dashboard, form or rich response component. That does not publish it: generated surface source must pass browser certification, human review, signing and slot-scoped publication. Conversely, checking chatbot exposure does not create or publish a custom surface.

The agent profile accepts only capabilities that are both security reviewed and explicitly chatbot enabled. A model-selected unknown or disabled tool fails before host execution. The customer backend remains responsible for current tenant, user, object and business-rule authorization on every call.

## Where markup and components run

Custom surfaces render inside the customer application, under its origin, authentication, routing and Content Security Policy. The normal host integration installs Atelier's scoped renderer and approved components, or checks generated project-native component source into the customer repository. The host server resolves a signed, slot-scoped experience contract and supplies only currently authorized projected data.

Atelier's control plane serves Studio, discovery, API documentation, reviewed capability metadata and signed release artifacts. It does not stream arbitrary model-authored HTML into the customer page. Model output cannot grant an action, register a component or bypass the host component registry. A rich chatbot response uses the same boundary: the model selects an approved artifact/tool contract, while the customer app renders the corresponding local component and the customer backend performs every authorized data read or command.

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
