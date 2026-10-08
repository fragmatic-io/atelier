# Evidence-bound release promotion

Atelier's release command derives readiness from executable local gates and four
separately signed external reports. A `verified` string in the requirements
ledger cannot authorize release. The ledger remains an implementation index;
it is not an attestation store.

## Commands and scope

From `platform/`, run the normal local suite:

```sh
ATELIER_PYTHON=/private/venv/bin/python npm run acceptance
```

The `core` profile reports local success independently from blocked external
gates. Development runs can record a dirty tree, but they always have
`releaseReady: false`. Final acceptance must use the reviewed, committed tree.
The runner fingerprints source and toolchain before and after execution and
fails if either changes while the gates run. Ignored dependencies are represented
by the package lock and installed compiler/runtime versions. Ignored runtime
output is excluded from the source fingerprint.
Tracked files marked assume-unchanged or skip-worktree block a clean release
claim because those Git index flags can conceal edits from `git status`.

Produce a binding for external execution from the same clean checkout:

```sh
mkdir -p evidence/current/release
ATELIER_PYTHON=/private/venv/bin/python node scripts/release-binding.mjs > evidence/current/release/binding.json
```

This command exits nonzero on dirty source. Do not reuse the output after any
source, dependency, compiler, browser runtime, or commit change. Put execution
evidence outside Git, preferably in a private directory outside the checkout;
`platform/evidence/current/` is also ignored. A non-ignored output directory
inside the checkout would itself change the source being qualified.

For final promotion, configure the operator's trust policy and collected reports:

```sh
ATELIER_RELEASE_POLICY=/etc/atelier/release-policy.json \
ATELIER_RELEASE_EVIDENCE=/private/atelier-release/manifest.json \
ATELIER_PYTHON=/private/venv/bin/python \
npm run acceptance -- --profile=release
```

Release succeeds only when:

1. All local gates succeed with actual, nonempty evidence.
2. Required Node tests have a nonempty TAP summary and no failures,
   cancellations, skips, or TODOs.
3. The committed source and toolchain stay unchanged throughout acceptance.
4. All four external reports, their signatures, and all referenced artifacts
   match the current binding and the operator's policy.

Missing external configuration/reports are `blocked`; invalid signatures,
changed artifacts, stale evidence, wrong targets, fixture substitution, or
unsatisfied outcomes are `failed`. Neither state can yield `releaseReady: true`.
The release profile exits nonzero if readiness is false. It never changes a
requirement status, calls a fallback provider, or invents a missing report.

## Source binding

The binding is an object with these required fields:

| Field | Meaning |
| --- | --- |
| `schemaVersion` | `1` |
| `gitCommit` | Exact committed source revision |
| `gitTree` | Git tree for that revision |
| `sourceTreeSha256` | Digest of actual tracked and non-ignored untracked files, paths, link targets, and executable modes |
| `packageLockSha256` | SHA-256 of the platform lockfile bytes |
| `clean` | Must be `true` for external qualification |
| `toolchain` | Exact `node`, `npm`, `platform`, `arch`, `python`, and `playwright` versions/identities |
| `toolchain.packages` | Installed `typescript`, `esbuild`, `react`, `ajv`, and `axe-core` versions |

External reports repeat this binding exactly. A deployment may run on different
hardware from the qualification runner, but its report must separately record
the target runtime and qualify the exact promoted images. Changing the
qualification toolchain requires requalification.

## Operator trust policy

`ATELIER_RELEASE_POLICY` is a separately controlled JSON file. It is not selected
by a tenant, model response, generated component, or evidence report. Restrict
who can change this file and the release process environment. Its public keys
are not secrets; the corresponding private signing keys remain outside Git and
outside the implementation agent's authority.

Required policy fields:

| Field | Contract |
| --- | --- |
| `schemaVersion` | `1` |
| `maxAgeHours` | Positive freshness limit, at most 720 hours |
| `maxClockSkewSeconds` | Integer from 0 to 300 |
| `providers` | Exact required provider configurations, maximum 32 |
| `workflows` | Nonempty required workflow corpus and provider routing |
| `target` | Production environment, immutable images, recovery objectives, and measured load thresholds |
| `signers` | Trusted executor and separately identified independent security reviewer keys |

Each provider is `{id, kind, model, effort}`. IDs must be unique. A model must be
explicit; `account-default` and `offline-fixture` are not release configurations.
The supported kinds are `openai`, `anthropic`, `gemini`, `openai-compatible`,
`claude-cli`, and `codex-cli`. The product matrix requires at least one API
configuration, Claude CLI, and Codex CLI. There is no fallback substitution.
Claude CLI effort is one of `low`, `medium`, `high`, `xhigh`, or `max`. The other
current adapters do not apply effort configuration here and require explicit
`effort: null` so the evidence does not claim an unmeasured setting.

Each workflow is:

```json
{
  "id": "customer-workflow-id",
  "providers": {
    "architect": "configured-provider-id",
    "generate": "configured-provider-id",
    "visual-review": "configured-provider-id"
  }
}
```

These IDs identify actual required configurations/cases. They are not built-in
demo results. The policy must enumerate the corpus the operator intends to ship.

The target contains:

```json
{
  "environment": "operator-selected-production-environment",
  "serviceImage": "registry.example/atelier@sha256:EXACT_64_CHARACTER_DIGEST",
  "certifierImage": "registry.example/certifier@sha256:EXACT_64_CHARACTER_DIGEST",
  "recovery": { "maxRpoSeconds": 900, "maxRtoSeconds": 3600 },
  "load": {
    "concurrentUsers": 20,
    "sustainedMinutes": 30,
    "maxP95Ms": 500,
    "maxErrorRate": 0.01
  }
}
```

This is an illustrative configuration, not a tested capacity or recovery claim.
Replace the image placeholders with actual lowercase hexadecimal digests and
choose objectives appropriate to the supported deployment. Floating image tags
cannot satisfy this contract.

Each signer is `{id, role, identity, publicKeyPem}`. Roles are `executor` or
`security-reviewer`; keys must be Ed25519. The same key cannot appear twice, and
execution and independent review cannot share the same identity. Several keys
for one identity within one role can support key rotation. The operator must
establish that the reviewer is actually independent; cryptography verifies the
configured identity and report integrity, not a person's organisational status.
An administrator who can replace the policy and release code remains inside
the trust boundary.

## Manifest and signed report envelope

The manifest is:

```json
{
  "schemaVersion": 1,
  "kind": "atelier-release-evidence",
  "generatedAt": "ISO-8601 timestamp",
  "binding": { "...": "exact binding object from release-binding.mjs" },
  "reports": {
    "live-provider-matrix": {
      "path": "live-providers.json",
      "sha256": "SHA256_OF_EXACT_REPORT_BYTES",
      "signaturePath": "live-providers.sig",
      "signerId": "trusted-executor-id"
    },
    "generation-workflow": {
      "path": "generation-workflow.json",
      "sha256": "SHA256_OF_EXACT_REPORT_BYTES",
      "signaturePath": "generation-workflow.sig",
      "signerId": "trusted-executor-id"
    },
    "deployment": {
      "path": "deployment.json",
      "sha256": "SHA256_OF_EXACT_REPORT_BYTES",
      "signaturePath": "deployment.sig",
      "signerId": "trusted-executor-id"
    },
    "independent-security": {
      "path": "independent-security.json",
      "sha256": "SHA256_OF_EXACT_REPORT_BYTES",
      "signaturePath": "independent-security.sig",
      "signerId": "trusted-security-reviewer-id"
    }
  }
}
```

The placeholder binding/hashes above must be replaced with actual objects and
digests; this illustrative JSON is intentionally not passing evidence.

Signatures are raw, detached, 64-byte Ed25519 signatures over the exact UTF-8
report bytes. Do not base64-encode the signature file. Reformatting a signed
report changes its bytes and invalidates its digest/signature. The manifest
selects a key ID from the separately configured trust policy; it cannot supply
a new key.

Every signed report contains:

- `schemaVersion: 1`, its exact `kind`, and `generatedAt`.
- The complete `binding`.
- `passed: true` and `provenance: {execution: "live", fixture: false}`.
- Nonempty `artifacts`, each `{path, sha256}`.
- The kind-specific outcome described below.

`fixture: false` means the reported execution or model result was not replaced
with a controlled success. Synthetic customer data in an isolated acceptance
tenant is appropriate and should be labelled in the underlying evidence. It
does not permit fabricated model responses, browser executions, or deployment
drills.

All report/signature/artifact paths are relative to the manifest directory.
Traversal, absolute paths, paths resolving outside that directory, empty files,
and unsupported final file types are rejected. Reports are limited to 4 MiB,
individual artifacts to 64 MiB, and artifacts per report to 256 MiB. Artifacts
are verified against their signed digests, so replacing a screenshot or log
without changing the report cannot pass.

## Required external reports

### 1. Live provider matrix

`results` must match the policy's provider IDs/kinds/models/efforts exactly with
no missing or substituted configuration. Each result records `provider`,
`durationMs`, `passed: true`, and `fixture: false`; `provider` must match `kind`.

`node scripts/live-provider-acceptance.mjs` produces this report and an adjacent
log artifact. Supply a mode-0600 `ATELIER_LIVE_PROVIDER_MATRIX` JSON array with
the policy's provider fields plus `apiKeyEnv` for APIs, or an explicit absolute
`home`, optional `executable`, and `authMode` for CLI accounts. Scope the actual
credentials and use the already required dedicated OS/container identity. An
explicit home path alone is not an OS sandbox.

This command makes real bounded adapter calls. It does not run automatically
inside local acceptance. It fails on dirty source, missing credentials, invalid
configuration, or failed providers. A failed boundary remains failed while the
rest of the configured matrix is measured. Private provider bodies, CLI
diagnostics, credentials, and account paths are not written into the report.

The output is explicitly unsigned. The execution authority reviews and signs
it using its configured key; the implementation agent does not create that
authority. Keep its adjacent log in the manifest directory or preserve all
report-relative artifact paths when assembling the evidence bundle.

The marker probe establishes adapter/authentication availability. It cannot
satisfy the separate generation workflow gate.

### 2. Generation workflow

The signed report has `cases`, matching the policy's workflow IDs exactly.
Each case has `id`, `passed: true`, and `stages`. Each stage has `id`,
`status: "passed"`, and nonempty `artifactPaths` pointing to the report's
hash-verified artifacts. Model stages additionally carry the exact policy
`providerId` for that case.

Every case must execute:

`architect`, `generate`, `compile`, `browser-certify`, `visual-review`,
`human-approve`, `publish`, `host-mount`, and `host-query`.

Across the complete corpus, also require:

`exact-confirmation`, `host-action`, `replay-rejected`, `uncertain-outcome`, and
`revoke`.

This supports read-only cases while retaining mandatory qualification of the
product's write, recovery, and revocation boundaries. No reported stage may be
failed, skipped, blocked, or incomplete. Preserve real screenshots, quality
certification reports, action receipts, and scoped execution traces as the
hashed evidence. A source critique or API marker is not browser/task evidence.

This gate verifies a supplied report from actual scoped workflow execution; it
does not self-generate a passing workflow report when credentials, customer
integration, human approval, or browser infrastructure are unavailable.

### 3. Target deployment

`target` repeats the policy's exact `environment`, `serviceImage`, and
`certifierImage`. `runtime` records the actual target `os`, `kernel`, and `node`.
`scan` contains `openCritical: 0` and `openHigh: 0` for the promoted images.

`checks` uses the same `{id, status, artifactPaths}` structure and requires:

`image-scan`, `tls-origin`, `certifier-isolation`, `restore`, `key-rotation`,
`worker-recovery`, `rollback`, `retention`, `monitoring`, `load`, and
`documentation-review`.

`recovery` contains measured nonnegative `rpoSeconds` and `rtoSeconds` within
the policy's limits. `load` contains numeric `concurrentUsers`,
`sustainedMinutes`, `p95Ms`, and `errorRate`: workload/duration must meet or
exceed the policy, while latency/error rate must remain within its limits.
Record the workload mix and target hardware in the evidence artifacts.

Local container build results cannot replace this target-infrastructure report.
The supported SQLite topology remains one host; these checks do not add an HA
claim or silently change the data architecture.

### 4. Independent security

The report must be signed by the separately configured security reviewer and
contain an exact matching `reviewer` identity, `independent: true`,
`openCritical: 0`, and `openHigh: 0`. Its `checks` require `penetration`,
`dependencies`, and `multi-tenant`, each with hash-verified evidence artifacts.

The standalone `node scripts/independent-security-gate.mjs` now uses the same
`ATELIER_RELEASE_POLICY` and `ATELIER_RELEASE_EVIDENCE` contract. The old
report-adjacent `ATELIER_SECURITY_PUBLIC_KEY` mechanism is no longer an authority
source. For a standalone security check, the manifest may contain only that
report; full release acceptance will keep the other three gates blocked until
they are supplied.

## Tests and operational limits

`node --test tests/acceptance/*.test.mjs` exercises binding changes, source
symlinks, dirty checkouts, trust separation, stale/future reports, provider and
workflow substitution, missing browser/task coverage, signature and artifact
tampering, path escape, deployment objectives, empty gate output, skipped
tests, and process timeouts.

Those tests create explicitly synthetic reports and ephemeral keys in temporary
directories. They prove verifier behavior; they do not qualify a live provider,
target deployment, UI design outcome, or independent security assessment.
No fixture report or test key belongs in a real release evidence bundle.

Hosted CI and Dependabot remain intentionally absent. Run the canonical command
on the trusted local or self-hosted release machine. The release report records
the trusted policy/manifest digests and signer key fingerprints so reviewers can
identify exactly which authority and evidence were used.
