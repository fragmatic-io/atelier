# Operational UI Coverage Strategy

Atelier is no longer pursuing "90% of web apps" as the product promise. That
claim is too broad and invites weak demos. The production target is narrower:

**Operational UI generated from capabilities, policies, intent, and a strong
component/composition system.**

---

## The target taxonomy

Atelier should cover most operational workflows that sit on top of real systems
of record:

| Pattern                    | First-market examples                           | Atelier coverage target                                  |
| -------------------------- | ----------------------------------------------- | -------------------------------------------------------- |
| Exception review           | Refund exceptions, compliance holds, SLA risk   | `Queue` + `DetailView` + policy gate + audit timeline    |
| Account/customer context   | Support account view, sales account brief       | `CustomerContextPanel` + `Timeline` + related actions    |
| Approval workflow          | Refund approval, access request, risk signoff   | `ApprovalCommandCenter` + confirmation policy            |
| Ops dashboards             | Support load, marketplace health, incident KPIs | `KPIRow` + `Chart` + `Table` + trigger-aware refresh     |
| Investigation / triage     | Issue inbox, alert triage, fraud review         | `Queue` + `DiffView` + `Evidence` / attachment patterns  |
| Bulk operational actions   | Reassign, archive, close, refund batches        | Selection + `BulkActionBar` + undo / rollback middleware |
| Audit / compliance surface | Action history, policy validation, grants       | `PolicyAuditTimeline` + manifest/audit event views       |

Out-of-scope categories are still valid software, just not the first Atelier
market: consumer landing pages, games, canvas-heavy editors, creative suites,
bespoke marketing pages, and highly choreographed brand experiences.

---

## What "coverage" means now

For an operational workflow to be "covered," all of this must be true:

- The app exposes typed data and action capabilities.
- Every action declares side effects, permissions, confirmation, and reversibility.
- Policies can validate the rendered manifest before it is served.
- The component catalog has enough primitives and composites to express the flow.
- Brand kit tokens make the generated surface look on-brand without route CSS.
- The runtime can dispatch actions and write audit events.
- Storybook or E2E coverage proves the workflow is usable, not merely rendered.

The old question was "can the compiler draw the UI?" The production question is
"can the operator safely finish the job?"

---

## The fallback guarantee

For any route the compiler cannot generate a valid manifest for — policy
failure, capability missing, ambiguous intent, component mismatch — the system
serves the default recipe. The user never sees a broken interface. The
customize flow surfaces the reason: "Couldn't customize this route — here's
why."

This guarantee is what makes Atelier safe to deploy. Worst case: the operator
sees the known-good default workflow. Best case: the interface adapts to their
role, queue, policy grants, and intent without forking the frontend.
