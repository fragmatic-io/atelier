# Security Policy

Atelier ships infrastructure that compiles and serves user interfaces from typed capabilities. Security in Atelier is layered — see [`docs/production-concerns.md`](docs/production-concerns.md) §Security and [`docs/chat/production-concerns.md`](docs/chat/production-concerns.md) for the full threat model.

## Reporting a vulnerability

**Do not open a public issue.** Instead:

1. Open a [private security advisory](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability) on the GitHub repository, **or**
<!-- TODO: switch to a shared security@ mailbox once the team grows beyond one person. -->
2. Email **v@fragmatic.io** (monitored maintainer mailbox).

Please include:

- Affected artifact (capability, skill, component, policy, runtime, compiler, manifest)
- Affected version or commit SHA
- Reproduction steps and (if applicable) a `manifest_id` and audit log excerpt
- Your assessment of impact and exploitability
- Whether you would like credit in the advisory

## Response timeline

- **Acknowledgement:** within 72 hours
- **Triage and severity assessment:** within 7 days
- **Mitigation or fix plan for high/critical:** within 14 days
- **Public disclosure:** coordinated with the reporter; default 90 days from initial report or upon fix availability, whichever is sooner

## Scope

In scope:

- Vulnerabilities in the runtime, compiler, policy engine, action gateway, manifest store, and trigger bus
- Vulnerabilities in default-shipped capability schemas, skills, components, and policies
- Authentication and authorization bypasses
- Cross-tenant data leakage
- Prompt injection that bypasses the policy engine or causes invalid manifests to be served
- Cache key collisions that serve one user's manifest to another

Out of scope:

- Vulnerabilities in user-supplied skills, capabilities, or recipes (those are the responsibility of whoever ships them)
- Issues in third-party integrations not maintained in this repo
- Denial-of-service via legitimate but expensive customization (mitigated by per-user budgets, not security-graded)
- Findings that require physical access to the user's device

## Disclosure

When a fix lands, a security advisory will be published with:

- The vulnerability description and affected versions
- Mitigation and upgrade guidance
- Credit to the reporter (unless they request anonymity)
- A reference to the relevant entry in the audit log schema if behavior was observable

## Hardening checklist for operators

If you are deploying Atelier in production, see the [security threat model in `docs/production-concerns.md`](docs/production-concerns.md#security) for the full list. The non-negotiables:

1. Sign capability and skill artifacts at publish time; verify signatures on load
2. Treat user-supplied content as untrusted in compiler prompts (sandboxed sections)
3. Re-authorize every action call at the Action Gateway against the user's grants
4. Validate every manifest against the policy engine before serving
5. Encrypt the intent vault at rest with a user-derived key
6. Maintain a tamper-evident audit log of every state transition
