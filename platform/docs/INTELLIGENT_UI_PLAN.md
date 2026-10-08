# Atelier: production UI and Intelligent UI plan

Updated 8 October 2026. Scope: the supported `platform/` product in `fragmatic-io/atelier`.

## Product goal

Atelier should turn a user's task into an appropriate interface that fits the host application, preserves the user's work, uses authorized data and actions, and carries enough evidence to review and release it. A useful answer may be a sentence, a comparison, a small interactive tool, or a persistent workspace. The system must make that choice deliberately.

Production quality has four independent dimensions: completing the intended task, coherent visual and interaction design, correct authorization and data handling, and reliable operation in the target environment. A good score in one dimension cannot compensate for a failure in another.

## What the new OpenAI announcement contributes

OpenAI's [7 October Intelligent UI announcement](https://openai.com/index/gpt-6-for-everyone/) describes choosing among text, visuals and interaction; a native component library compiled during generation; evaluation of clarity, usefulness and completeness; and useful responses appearing while work continues. It also says this rollout changes ChatGPT Chat, while Work and Codex retain their existing models. The announcement does not publish an implementation that Atelier can assume is available as an SDK.

The following architecture, contracts and targets are proposals for Atelier. They are not claims about OpenAI's private implementation or measured Atelier performance. [OpenUI](https://www.openui.com/docs/openui-lang/architecture) remains a candidate composition language to evaluate behind Atelier's own contracts.

## Delivery order

| Phase | Deliverable | Exit condition |
| --- | --- | --- |
| A — quality foundations | One resolved host design context; immutable task expectations; real render evidence; structured repair; evidence-based release gate; Studio review | Regression tests pass; exact-artifact browser evidence is available; external release blockers remain explicit |
| B — appropriate interface selection | Response-format policy; approved component catalog; native compositions; deterministic interactive tools | Representative tasks choose a useful format and complete using only allowed contracts |
| C — responsive interaction | Progressive composition; stable state and focus; typed edits; cancellation and resumption | Malformed, interrupted and stale streams remain safe; valid edits preserve user work |
| D — demonstrated taste and operation | Human-calibrated evaluations; provider routing; latency and cost budgets; target deployment and recovery | Held-out tasks and live workflows meet the agreed bar on the exact release artifact |

Phase A is the focus of the current implementation branch. Phases B–D are follow-on work. A code change or passing fixture does not by itself satisfy an exit condition requiring real browsers, live providers, target infrastructure or an independent reviewer.

## Phase A: establish evidence that can be trusted

### A1. One approved design context

Resolve host tokens, semantic roles, viewport evidence, approved synthesis and reviewed component contracts where supplied. Give the same versioned context to the architect, designer, compiler, sandbox, visual critic and exported host source. Include its hash in the compiled artifact and certification evidence. The current live resolver loads the project model, approved host contract and approved synthesis; ingestion from a reviewed component catalog belongs to IU-02.

Changing typography, spacing, color roles, a component contract or the host project version must invalidate the applicable certification. Unreviewed observations remain evidence to review; they cannot become approved styling by appearing in a prompt. Keep the shared role/property vocabulary consistent so accepted navigation, logical padding and gap values survive rendering.

Acceptance: test propagation of approved values, changed-context invalidation, tampered hash/token relationships, unsafe CSS rejection and scoped host rendering. Verify computed styles in an actual browser before treating the visual path as executed.

### A2. Independent task expectations

The person requesting or reviewing a production component supplies a quality contract before source generation. It fixes safe fixture data, interactions, assertions and exact expected action calls. Tests written by the source-generating model remain supplementary smoke checks.

A production profile requires independent scenarios, scenario coverage for every declared action, actual captures and visual review. Expected action identifiers and arguments are compared to observed bridge calls. A successful fixture cannot prove a real backend write; provider and host integration evidence remain separate.

See [PRODUCTION_UI.md](PRODUCTION_UI.md) for the supported schema and operator workflow.

### A3. Render, inspect and repair

Compile and mount source in the existing restricted environment. Exercise loading, empty, error and ready states; narrow and desktop sizes; both themes; right-to-left layout; and independent task scenarios. Retain bounded screenshots with the exact source, design and quality contract hashes.

Run native checks and the pinned accessibility engine. Send real retained images to the configured visual provider with the task and host context. Record which captures were reviewed. Blocking findings and major defects require repair; every repair recompiles and reruns certification against the unchanged task oracle. A source-only critique is not a visual inspection.

Automated accessibility findings that require human judgment are exposed in Studio. Manual keyboard, focus, assistive-technology and task review remain part of approval. This workflow cannot certify arbitrary hosts or every WCAG criterion automatically.

### A4. Repair the right candidate

Structured designer retries receive compiler or critic feedback, the previous candidate and its hash, and the unchanged authorized coverage. Include those inputs in the normal scoped model cache key. This prevents a rejected cached request from being replayed as its own repair. Record each deliberate attempt and the candidate judged.

Source Forge separately supports bounded regeneration from critique issues or the prior source digest, retained evidence and measured findings, under unchanged task/design contracts. Passing the full prior source kit for targeted edits is a follow-on improvement; it is not part of the current source repair input.

### A5. Review and release from evidence

Studio should distinguish draft source, smoke checks, independent task checks, visual findings, human review and publication. Show the exact artifact binding and retained captures. Make production the deliberate quality profile for new production work; keep development smoke output clearly identified.

Follow-on operator UX should provide a guided form for task expectations, representative data and expected outcomes, with a readable review before those expectations are fixed. JSON import remains available for coding agents and advanced workflows. Keep technical evidence inspectable while making the current result, the reason for a failure and the next corrective action clear to a reviewer.

Release readiness requires executed local gates and externally trusted evidence bound to the clean commit, source tree, lockfile and toolchain. Required external reports cover the configured live provider matrix, complete generation-to-host workflows, target deployment/recovery/load behavior and independent security review. Missing or stale evidence blocks a release. No status string or test fixture can substitute for it.

## Phase B: choose and compose the right interface

### IU-01. Response-format planning

Add a constrained response plan before choosing a layout. Its contract should include user intent, audience, allowed information, intended interaction, presentation mode, selected approved components, success criteria and a concise reason for the choice.

Initial modes: `text`, `summary`, `comparison`, `collection`, `form`, `analysis`, `simulation` and `workspace`. Modes describe presentation needs; they do not grant capabilities. A mode is available only when the host supports the required components and the task has appropriate data and permissions.

Examples: a single status question becomes a concise answer; comparing accounts becomes an aligned comparison; investigating many incidents becomes a queue and detail view; exploring a capacity assumption becomes a deterministic local tool. Users should be able to request a simpler format without losing information or state.

Acceptance: a reviewer labels suitable formats for representative tasks; assess agreement and task completion. Include simple questions for which extra UI makes the task slower. Fail plans that invent fields, actions, historical series or calculation inputs.

### IU-02. A certified native component catalog

Prioritize a small, high-quality catalog of task primitives: structured facts, comparable rows, bounded tables, status, timelines, number inputs, labelled fields, inline validation, confirmations, progress, empty/error states and accessible disclosure. Add charts and simulations only with explicit data and behavior contracts.

Each component needs a version, typed props, semantic roles, data expectations, interaction states, keyboard/focus behavior, narrow-layout rules and evidence. Defaults should use the host's approved typography, spacing and colors. Composition should choose information order and task structure while preserving those foundations.

Use three generation paths: select an existing published component; compose reviewed primitives; generate new source for a missing capability. New source enters the full build/review/publication lifecycle. The first two paths should reuse established behavior and require the appropriate composition checks.

Acceptance: every catalog primitive passes its independent scenarios and state matrix. Run identical tasks through native composition and new-source generation to compare completion, repair rate, latency and cost. Evaluate an OpenUI adapter against the same criteria before adopting its language.

### IU-03. Small interactive tools with exact calculations

Make filtering, selection, comparisons and what-if controls local when they operate on already authorized data. Extend the existing constrained calculation machinery with explicit units, precision, bounds and missing-value behavior. Do not have a model invent a fresh result on each slider change.

Distinguish exploratory state from backend commands. Moving a capacity slider changes a local scenario; applying a staffing change invokes a separately authorized and confirmed host action. Show assumptions and the available data scope in the interface.

Acceptance: independent expected outputs cover boundary values, empty inputs, invalid inputs, units and arithmetic limits. Local adjustments require no model call and create no backend side effect. Real mutation execution is verified separately through the host contract.

## Phase C: make progress useful and preserve work

### IU-04. Progressive rendering of verified structure

Stream a typed composition protocol containing request identity, sequence, base revision and bounded component updates. Validate each complete update before applying it. Render implementation-owned placeholders while a component is incomplete. Never execute partial generated source or grant authority from a partially received action description.

Separate visible progress from action activation. Read-only, validated content can become useful while another bounded step runs. A command control becomes active only when its complete schema, input, scope and current permission are validated. Cancellation must not replay writes. The last valid view remains available if the stream fails, accompanied by a factual failure state.

Acceptance: inject truncated JSON, unknown component IDs, oversized updates, repeated/out-of-order sequences, changed schemas, stale revisions, permission revocation and transport disconnects. No case should cause an unauthorized request, lost input or false completion message. Test layout stability and meaningful progress in the actual browser.

### IU-05. Stable state and typed edits

Give each relevant component and state field a stable identity. Separate host data, local exploratory state, unsaved edits and command status. Use typed patch operations with a required base revision rather than rebuilding the entire surface for each follow-up.

A user changing a number directly and a user asking to change the same number should update the same state contract. Preserve focus, selected records, scroll position and unsaved values where their semantics remain valid. Reject or explicitly reconcile stale patches; never overwrite a newer human edit silently. Clear scoped state on project/account transitions and enforce fresh permission checks before any command.

Acceptance: concurrent direct edits and conversational patches; dirty forms; schema changes; source revocation; browser refresh; reordered components; focus during streaming; tenant switching. Include a task in which the user corrects requirements while generation is in progress.

### IU-06. Measure time until useful work

Instrument request receipt, first valid information, first useful interaction, final validated composition, task completion, retries and cancellation. A spinner is not first useful output. Report p50/p95, cold/warm paths, task family, provider/model and success rate alongside costs.

Initial proposed targets for reuse/composition: p95 first useful information within 2.5 seconds, p95 validated interaction within 8 seconds, and local input feedback within 100 ms. These are engineering targets to baseline and revise; they are not achieved measurements. New-source generation has a separate budget that includes compilation, browser checks and review.

Acceptance: measure under a documented target workload and report cost per successful task. Investigate any speed improvement that increases wrong-format choices, stale content, layout movement or incomplete task outcomes.

## Phase D: demonstrate taste and sustained reliability

### IU-07. Evaluate design judgment

The current authored guidance starts with twelve patterns across triage, entity detail, create/edit, monitoring/analysis, comparison/approval and settings. Expand it into a reviewed corpus of 40–60 original or appropriately licensed references annotated with task, data shape, density, hierarchy, responsive behavior and failure modes. Keep screenshot references distinct from prose guidance.

Score task completion, content hierarchy, readability, host fit, interaction clarity, responsive behavior, state completeness and unnecessary complexity. Use blind pairwise human comparisons; calibrate visual judges against those decisions. Store the criterion and reason for edits rather than a bare star rating.

Start with 60 development tasks and 60 held-out tasks across different host design systems. Repeat each configured provider path at least three times; report distributions and failures by family. Do not tune to the held-out set or accept one aggregate score that conceals a broken action or unreadable mobile state. Provider choice, prompt changes and eventual fine-tuning require a measured improvement on this evaluation.

Acceptance: all deterministic safety/task gates pass. Agree a human preference and completion bar after establishing the baseline, then record exact versions, task sets and sample counts for each comparison.

### IU-08. Route models by measured workload

Use stage-scoped configuration for format planning, architecture, component generation, source critique and visual review. Evaluate model/effort combinations separately on the tasks they will handle. A small model may suit bounded selection; novel composition or repair may need more reasoning. Actual results decide.

Keep stable approved context cacheable, with changing task and repair information scoped correctly. Include tenant, project, authorization, source revision and design/quality context in relevant cache boundaries. Provider outages remain explicit. Any operator-approved alternate path must preserve the same contract and produce its own evidence.

OpenAI's [model guide](https://openai.com/index/practical-guide-building-gpt-6/) recommends clear completion criteria, matching models to workloads, measuring success/latency/cost and managing long-running work with scoped context and independent tasks. Apply those practices without assuming a ChatGPT announcement changes Atelier's configured provider identifiers or API capabilities.

### IU-09. Prove failure and recovery behavior

Expand tests beyond successful generation: source or screenshot prompt injection, multi-turn attempts to expand authority, revoked permissions during a stream, outdated tool schemas, source revocation, duplicate confirmations, ambiguous write outcomes, missing provider credentials, a failed browser runner and lost infrastructure connections.

For every scenario, specify what users see, what state is retained, which side effects are impossible and how recovery works. Measure API/worker health, queue behavior, backups/restores and load on the actual single-host deployment. Maintain a separate target-environment report; local browser and fixture evidence do not establish production operations.

OpenAI's [October system card](https://deploymentsafety.openai.com/gpt-6-october) discusses both improvements and regressions, including tests of multi-turn attacks and honesty under blockers. The relevant product discipline is to report failures and limitations alongside strengths, and to test the whole deployed system.

## Proposed milestones and ownership

| Milestone | Primary ownership | Reviewable evidence |
| --- | --- | --- |
| Quality foundation | Platform + source generation + design systems | Exact source/design/task bindings, regression tests, browser matrix, screenshots, review UI |
| Native response pilot | Product design + runtime + host integration | Three complete tasks: concise status, record comparison and a local what-if tool |
| Streaming and edits | Runtime + security + UX | Protocol/state tests, interrupted-stream recordings, keyboard/focus evidence, latency report |
| Design evaluation | Product design + evaluation engineering | Annotated corpus, held-out results, human pairwise decisions, provider comparisons |
| Release qualification | Operations + independent security reviewer | Signed provider/workflow/deployment/security reports bound to the release |

Use these evidence milestones to schedule delivery. Calendar estimates should follow a confirmed team size, supported host/browser matrix and access to live providers and target infrastructure. No universal production certification or cross-browser claim follows from this roadmap.

## Definition of done for a production component

- The interface fits the actual task and approved host design context.
- Independent scenarios pass against the exact compiled artifact and exact expected action inputs.
- Required viewport/state captures, automated accessibility checks and visual critique are retained and bound to that artifact.
- A reviewer has inspected task behavior, visual output and manual accessibility findings.
- Current host authorization, confirmation, idempotency and revocation hold through real integration tests.
- Target operations and applicable external release gates are satisfied by trusted, current evidence.
- The handoff identifies the source, contracts, versions, executed checks, remaining limitations and rollback procedure.

An artifact can be implemented and reviewable while release qualification remains blocked. The product and release tooling must present those states accurately.
