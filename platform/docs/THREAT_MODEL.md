# Threat model

## Assets and trust domains

Atelier separates the control plane, host application, model providers/project runners, browser clients, and generated-source certifier. Protected assets include customer source snapshots, project models, conversations, API credentials, signing/encryption keys, published artifacts, business data, and durable action receipts.

The control plane may describe capabilities but cannot grant host business authority. The host server owns the current subject, object-level authorization, data loaders, command executors, and transactional idempotency. A provider or generated artifact is untrusted. A coding agent's MCP token is project-scoped read access, not an application-user credential.

## Primary threats and controls

| Threat                        | Control                                                                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Cross-tenant/project access   | Composite database keys, branded scopes, project-bound bearer tokens, independent same-tenant/cross-project tests                     |
| Prompt/source injection       | Treat source and retrieved text as data, schema validation, reviewed capability allowlists, no unrestricted tools/fetch               |
| Generated-code escape         | Import and syntax policy, bounded compiler child, sandboxed preview document, production-only network-disabled certifier container    |
| Secret exposure               | Server-side encrypted provider keys, private mode-0600 configs, filtered runner environments, no browser bearer token                 |
| Unauthorized/replayed writes  | Current host authorization, exact-input one-time confirmation, lease fencing, durable operation IDs, uncertain-state reconciliation   |
| Stale/revoked artifact use    | Current token/member/project/version/signing-key checks on read and execution; no authority cached in the client                      |
| Provider/runner abuse         | Host allowlist and DNS pinning, no redirects/private IPs, dedicated runner identity, bounded time/output/budget/process groups        |
| Evidence forgery              | Content digests, evaluator binding, human approval, signed publication, canonical fresh acceptance logs                               |
| Browser observation poisoning | Ingest-only public key, exact origin allowlist, rate limit, contract/context hashes, observed-only confidence, mandatory human review |
| Sample privacy leakage        | Samples off by default, browser-side projection, server-side reprojection, safe categorical allowlist, bounded schemas and sizes      |

## Explicit residual risks

Static source policy and a subprocess are not a complete hostile-code sandbox. Production source certification therefore refuses local mode, but the container image and runtime configuration still require deployment-specific build, scan, and penetration evidence. SQLite offers durable single-host operation, not multi-host HA. Administrators controlling the process, database, and keys are inside the trust boundary. Heuristic PII/secret detection is not DLP certification. A browser key is visible and Origin can be forged outside a browser, so browser observations are untrusted evidence and never grant capability or agent authority.

Live model behavior, real customer SSO/object authorization, deployment load/recovery, visual quality on held-out applications, and independent penetration testing cannot be self-certified by repository tests. The release profile remains failed until signed evidence for those exact external gates is supplied.
