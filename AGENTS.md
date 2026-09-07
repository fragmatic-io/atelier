# Working on Atelier

The only supported product is `platform/`, an independent npm project implementing Atelier 2.3. Do not restore or depend on the removed root pnpm/CIR prototype.

## Product invariants

- Fail closed. Missing providers, credentials, review, authorization, design evidence, or browser certification are explicit failures; never substitute another path.
- Browser discovery never sends source code, headers, cookies, credentials, query strings, raw identifiers, or unrestricted request/response bodies.
- Observed API evidence, declared OpenAPI evidence, human capability review, chatbot exposure, and publication are separate states.
- The customer application owns authentication, object authorization, business data, idempotency, routes, navigation, and rendered markup.
- Atelier supplies reviewed contracts and generated source. It does not silently inject navigation or arbitrary host UI.
- Provider configuration is project/stage scoped. Claude CLI defaults to exact model `claude-opus-4-8` with `high` effort; Codex CLI and API providers use the same validated contract.
- Specialists are bounded, read-only, and may use only an explicit subset of the primary agent's approved query tools.
- Commands require current authorization and exact confirmation. Interrupted side effects remain uncertain and are not silently replayed.
- Credentials, project data, runner homes, evidence containing customer data, and private MCP configuration stay outside Git.

## Repository map

- `platform/packages/` — product modules; keep files small and split by responsibility.
- `platform/apps/studio/` — operator UI.
- `platform/apps/host-demo/` and `platform/apps/agent-demo/` — supported integration examples.
- `platform/migrations/` — append-only SQLite migrations.
- `platform/tests/` — unit, security, HTTP, provider, installer, and browser contracts.
- `platform/scripts/` — supported CLI, operations, packaging, and acceptance entrypoints.
- `platform/docs/` — current product and operating documentation.

## Change requirements

1. Add or update tests for every behavior change. State explicitly when a path cannot be covered.
2. Preserve tenant/project scoping, audit records, encryption boundaries, and fail-closed behavior.
3. Never weaken a confirmation, permission, origin, signature, or human-review gate for convenience.
4. JavaScript source files outside tests/generated/vendor content begin with the SPDX and Atelier copyright headers used by neighboring modules.
5. Keep implementation modules cohesive; split files when responsibilities diverge.
6. Update the corresponding current document when behavior or setup changes.
7. Do not commit runtime databases, credentials, tokens, local evidence, virtual environments, archives, or package tarballs.

## Required validation

From `platform/`:

```sh
npm run test:unit
npm run verify
ATELIER_PYTHON="$PWD/.venv/bin/python" npm run acceptance
```

Acceptance must be run against a committed tree because its report binds the Git commit and package-lock hash. External release gates remain external; do not mark them verified without the required evidence and authority.
