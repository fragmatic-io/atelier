# Source UI quality and review

Atelier source generation now binds an approved host design context and a caller-supplied task oracle to the compiled artifact. Browser certification retains the exact image bytes that were rendered. A configured vision provider reviews an explicit selection of those captures, and failed findings can drive a bounded new source attempt. Passing automated checks produces a reviewable draft; human approval and signing remain separate.

This policy applies to Source Forge components. The structured experience pipeline has its own artifact format and visual-review workflow. Neither pipeline should describe source validation or a model opinion as a complete production or accessibility certification.

## Quality profiles

| Requirement | `standard` | `production` |
| --- | --- | --- |
| Locked compilation and declared actions | Required | Required |
| Current resolved design context | Bound when imported/generated | Approved host contract required |
| Base state/theme/viewport browser matrix | 17 cases | Required, plus narrow/tablet/RTL cases |
| Retained source-bound screenshots | Required for new source certification | Required |
| Caller-supplied independent scenarios | Optional | At least one |
| Exact scenario action payloads and fixture outcomes | Checked when supplied | Every declared action must be covered |
| Actual axe-core accessibility analysis | Native smoke checks | Required in every case |
| Actual screenshot model review | Explicitly selectable | Required |
| Network-disabled Docker certification | Required when server runs in production | Required when server runs in production |
| Human source, preview, task and publication review | Required | Required |

The process environment is a hard boundary: `NODE_ENV=production` rejects the standard profile and refuses local-process browser certification. A request cannot opt out by passing `profile: "standard"` or `visualReviewRequired: false`.

A local production-profile run is useful development evidence. It does not substitute for execution in the deployed isolated certifier, scoped live-provider acceptance, or independent security review.

## Supply the task contract before generation

`POST /api/tenants/:tenant/projects/:project/components/generate` accepts a `qualityContract` beside the existing `goal` and `actions` fields. The service stores the normalized contract before requesting model output. The source model receives it as evidence and cannot replace it with its own `kit.tasks`. If the contract supplies a `goal`, it must match the requested generation goal after trimming surrounding whitespace. An expanded or changed task cannot retain the old oracle and reuse its source certificate.

The same contract can accompany an import as `{ "kit": { ... }, "qualityContract": { ... } }`. For an import, an explicit `qualityContract.goal` defines the task being certified; it may differ from the kit's descriptive copy. When no explicit task goal is supplied, the kit description or name is the fallback. Raw source-kit imports use the standard development profile and are rejected on a production server unless they include the required production contract.

Example of a read-only filtering task using synthetic data:

```json
{
  "goal": "Help an operator filter the supplied delivery records while preserving record identity",
  "actions": [],
  "qualityContract": {
    "profile": "production",
    "goal": "Help an operator filter the supplied delivery records while preserving record identity",
    "dataPolicy": "synthetic",
    "visualReviewRequired": true,
    "maxRepairAttempts": 2,
    "scenarios": [
      {
        "id": "filter-records",
        "name": "Filter by a visible delivery label",
        "data": {
          "records": [
            { "id": "synthetic-1", "label": "North delivery", "status": "Ready" },
            { "id": "synthetic-2", "label": "South delivery", "status": "Waiting" }
          ]
        },
        "steps": [
          { "op": "fill", "selector": "[data-testid=record-filter]", "value": "North" }
        ],
        "assertions": [
          { "kind": "count", "selector": "[data-testid=delivery-record]", "count": 1 },
          { "kind": "text", "selector": "[data-testid=delivery-record]", "text": "North delivery" }
        ],
        "calls": []
      }
    ]
  }
}
```

Use field names and shapes that match the application's actual approved data contracts. The example is an oracle format, not a new application capability or a universal delivery schema. The generated component's data schema must accept the declared scenario data.

### Contract fields

- `profile`: `standard` or `production`.
- `goal`: a nonempty task description, at most 4,000 characters.
- `dataPolicy`: `synthetic` or `redacted`. It is mandatory for supplied scenarios and screenshot-provider review. This is the caller's explicit statement about fixture data, not an automatic redaction system.
- `visualReviewRequired`: boolean; production requires `true`.
- `maxRepairAttempts`: one to three total source attempts; default two. This is a bounded budget, not a promise that every defect can be repaired.
- `scenarios`: up to six independent task scenarios. Production requires at least one.

The service adds `version`, the exact approved `actionIds`, and a canonical `hash`. Clients do not need to calculate these fields. Changing the goal, fixture data, action inputs, outcomes, assertions, or policy creates a different contract and requires new compilation and evidence.

Each scenario has a stable lowercase `id`, a descriptive `name`, a `data` object, one to fifteen `steps`, one to twelve `assertions`, and zero to eight expected `calls`. The total normalized contract is limited to 160 KB. A scenario's data object is limited to 40 KB.

Supported step operations are `click`, `fill`, `select`, and `press`. Selectors must resolve unambiguously inside the sandboxed component. Keyboard scenarios can use `press` with values such as `Tab`, `Enter`, or `Escape`.

Supported assertions are:

| `kind` | Additional value | Meaning |
| --- | --- | --- |
| `text` | `text` | The selected node contains the expected text |
| `visible` | None | The selected node is visible |
| `hidden` | None | The selected node exists and is not visible |
| `count` | `count` | Exact number of matching nodes; use zero for removal |
| `value` | `value` | Exact input value |
| `disabled` | None | Control is disabled |
| `enabled` | None | Control is enabled |

Generated `kit.tasks` remain supplementary smoke checks. They do not replace these immutable task assertions.

### Exact action outcomes

To exercise an already approved command, include it in `actions` and supply its expected call in the scenario:

```json
{
  "capabilityId": "case.create",
  "input": { "subject": "Synthetic support request" },
  "outcome": "success",
  "result": { "id": "synthetic-case-1" }
}
```

For a recoverable error, use an explicit error outcome:

```json
{
  "capabilityId": "case.create",
  "input": { "subject": "Synthetic support request" },
  "outcome": "error",
  "error": "The supplied subject is not accepted by this fixture"
}
```

The certifier compares the ordered capability IDs and exact input objects with the oracle. A missing, extra, reordered, or changed call fails. It returns only the specified fixture outcome; no customer business operation is executed. Assertions should check meaningful post-action behavior, including preserved input or actionable recovery when a call fails. Production requires scenario coverage for every declared action, but coverage count alone does not establish the adequacy of the chosen scenarios.

## Approved host design

Source Forge resolves the same context for model input, compilation, browser rendering and evidence. That context includes the current project version, normalized host-role styles, semantic tokens and approved design synthesis. The resolver/compiler contract also supports explicitly supplied reviewed component contracts; loading those from a live catalog remains follow-on work. Its canonical `hash` is included in the compiled digest.

Production requires an approved browser design contract. Changing approved host design evidence invalidates the old source context; rebuild and recertify instead of applying stale approval to new styling. The source generator cannot expand the approved action set or rewrite host CSS by changing its own design instructions.

The no-source observer captures bounded computed styles, not a complete brand or UX system. A contract observed in one color scheme is not proof of a complete host dark-theme design. Browser theme cases test rendering under the specified document theme; reviewers must confirm that the approved host evidence represents the intended themes.

Task-aware pattern guidance is authored guidance with an explicit provenance and bounded retrieval. It suggests useful hierarchy and interactions while retaining the host's design context. It is not a measured aesthetic score or permission to introduce unsupported application features.

## Browser evidence and screenshot review

Standard certification checks ready, loading, empty and error at 390 and 1280 pixels in light and dark, plus a desktop RTL case. Production adds ready states at 320 and 768 pixels in both themes and additional mobile/dark RTL cases. Every independent scenario runs from a fresh browser page at 390 and 1280 pixels. Scenarios do not inherit state from another scenario.

The browser reports runtime errors, unexpected network attempts, viewport overflow, accessible-button and tabindex smoke findings, exact task results, action results, and readiness/duration measurements. Layout and accessibility are inspected before interaction and again after completed tasks, so removing a defective control cannot hide its initial failure. Production runs the pinned local `axe-core` engine against WCAG A/AA tags and requires the applicable initial/completed phase evidence. Any reported violation in either phase fails that case. Axe findings that need manual judgment remain visible as `incomplete`; they require explicit human accessibility review before production-profile approval.

Each case produces a retained viewport JPEG capture. Successful interactions also produce a completed-state capture. Capture metadata includes case, phase, width, height, theme, state, direction, byte count and SHA-256 hash. A viewport image does not establish the quality of content outside that viewport.

The certifier's versioned protocol binds the report to:

- Compiled source digest.
- Resolved `designContextHash`.
- Immutable `qualityContractHash`.
- Exact browser case coverage and task counts.
- Python runner hash, browser version and Playwright version.
- Accessibility engine hash where applicable.
- Exact retained image bytes and their hashes.

The host verifies these bindings before storing scoped evidence. Images are retained in a separate `component-captures` artifact. `SourceRegistry.get()` returns `captures` beside `compiled` and `evidence` for the review interface. `evidence.captures` contains metadata, while `captureArtifactId` references the scoped byte artifact.

The configured `visual` stage receives actual retained bytes in batches of at most four. Its explicit representative set covers mobile/desktop, dark, loading/empty/error, additional production layout cases, and completed independent scenarios. The result records `reviewedCaptureHashes` and `totalRetainedCaptures`; it never claims that unselected captures were reviewed by the model. Issues must cite a capture actually supplied to that batch. A blocker or major issue prevents acceptance even if the model also returns `acceptable: true`.

The model's critique covers observable hierarchy, readability, spacing, host fit, responsive composition, states and task clarity. It cannot certify keyboard behavior, real API authorization, complete accessibility compliance, or real user success from pixels.

## Repair, approval and publication

Generation with an independent scenario or required screenshot review runs browser and visual checks before returning a successful reviewable draft. A rejected attempt retains its source and evidence. The next permitted source attempt receives the prior digest, exact findings, and the unchanged task/design contracts. It cannot rewrite the oracle to make the test pass.

Provider errors stay explicit failures. A missing or unsupported vision provider does not fall back to a fixture, a source-only critic, or a passing label. Available browser captures are retained with non-approvable evidence when a vision call fails.

Imports and basic source generation can still be certified through the explicit certification action. Certification never silently changes their source. Review the retained findings and create a new source candidate when changes are needed.

Human approval requires the exact digest, a reviewed source/preview/task, a review note, passing current evidence, and applicable screenshot/accessibility checks. Production-profile `incomplete` accessibility findings additionally require `accessibilityReviewed: true`. Existing separation-of-duties policy still applies. Publication rechecks the current context and evidence before signing. No successful model or browser result automatically publishes a component.

The existing seven-day evidence freshness rule applies when human source approval is recorded. An approved artifact does not gain a new time-based publication expiry. Current design, task contract, authorization, signing and project review policy are still checked at their lifecycle boundaries; release qualification has its own evidence requirements. If project policy is tightened to require screenshot review, older contracts that omit it cannot be approved, published, certified unchanged, or resolved at runtime. Rebuild under the current policy and obtain new evidence instead of silently grandfathering an old contract.

## Local and production execution

Use the locked npm and Python dependencies. The Python browser driver can use `PLAYWRIGHT_NODEJS_PATH` when the environment requires an existing Node executable. `ATELIER_PYTHON` still selects the Python interpreter. Missing browsers, accessibility dependencies, or configured providers are errors.

The network-disabled, read-only production certifier exports image bytes through bounded stdout. It receives no writable evidence mount or provider credentials. Rebuild its image whenever `scripts/certify-source.py` changes: a stale runner hash is rejected. Existing image/deployment isolation requirements remain in force.

Supplying `evidenceDir` to the standalone certifier writes verified JPEGs and a capture manifest on the host after the report is checked. Do not put real project evidence or fixture data in Git.

## Verification scope

The executable tests distinguish privileged protocol/model doubles from real browser runs. Unit fixtures are not usable production certificates. The release ledger's external provider, isolated deployment and independent security gates remain independent requirements.

Current automated rendering coverage is Chromium, bounded viewport cases, supplied synthetic/redacted data, and the declared scenario operations. It does not establish Firefox/Safari behavior, every locale or input method, arbitrary performance targets, complete WCAG conformance, or broad user-research outcomes. Add task-specific scenarios and human review where those requirements apply; retain honest evidence of what actually ran.
