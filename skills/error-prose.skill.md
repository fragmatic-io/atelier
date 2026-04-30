---
name: error-prose
version: 0.1.0
description: Error message rules — never just "Error", always say what failed and what to try; client errors specific, server errors apologetic; never expose stack traces.
capabilities_used:
  - github.issue.create
  - dummyjson.cart.add
when_to_use: |
  Any failure surface — `<Alert variant=error>`, `<Toast variant=error>`,
  inline form-field errors, full-page error screens, the empty failure
  state of a list whose fetch threw.
when_not_to_use: |
  Rate-limit feedback (use `rate-limit-feedback`). Empty-but-not-error
  states (use `empty-state-prose`). Validation hints on fields the user
  has not yet attempted to submit — those are help text, not errors.
example_flow: |
  1. Never render the bare word "Error" as the title. Always name what
     failed: "Couldn't save changes", "Couldn't load PRs", "Card
     declined".
  2. Always include "what to try". Client errors → specific actionable
     prose: "Use a number between 1 and 99." Server errors → apologetic
     and bounded: "Something on our end. Try again or contact support."
  3. Never expose stack traces, framework error names, or raw HTTP
     status codes to end users. Surface those only in the dev console.
  4. Title ≤ 60 chars. Body ≤ 160 chars. Prefer one CTA: "Retry" for
     transient, "Contact support" for persistent, "Edit" for validation.
  5. Log the underlying error to the audit stream (`audit.action_failed`)
     with the trace id; surface only that trace id to the user, not the
     full stack ("Reference: evt_a8c91f2e").
known_failure_modes:
  - Showing a raw exception (TypeError, Cannot read property of
    undefined) to an end user.
  - Generic "Something went wrong" with no path forward — leaves the
    user stranded.
  - Blaming the user for a server error ("Your request was invalid"
    when the server is the one in trouble).
  - Surfacing the same error multiple times (toast + inline + modal) —
    pick one channel per error.
---

# Error prose

A micro-skill: every error names the failure and the next step.

## The rule

Never bare "Error". Always what + what-to-try. No stack traces. Server
errors apologetic; client errors specific. One channel per error.
