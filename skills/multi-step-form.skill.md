---
name: multi-step-form
version: 0.1.0
description: Decide when to break a single Form into a Wizard, name the steps consistently, save a draft on every step transition, and recover an in-progress draft on accidental refresh via sessionStorage with a TTL.
capabilities_used:
  - dummyjson.cart.add
when_to_use: |
  When a recipe needs to collect input that meets either threshold:
  (a) four or more logical sections, OR (b) a sequential dependency
  between fields (the value of a later field is only meaningful given
  an earlier choice — e.g. "Shipping country" gates "State/Province").
  Pair with `<Wizard>`, `<Stepper>`, `<Form>`, and `<Progress>`.
when_not_to_use: |
  Two- or three-section forms with no dependencies — render a single
  `<Form>` with grouped fieldsets instead. Wizard is a heavy affordance
  and users penalise it on short flows. Single-question survey steps
  ("rate this 1–5") — those are a different pattern. Anything that
  must succeed atomically with no partial submit (legal consent forms)
  — those reject the draft-save semantics this skill assumes.
example_flow: |
  1. Inspect the form schema. Count logical sections (groups of fields
     that share a header). If `sections >= 4` OR any field declares a
     `depends_on` reference, switch to multi-step.
  2. Render `<Wizard>` with one step per section. Step names use the
     imperative voice and stay under 24 chars: "Your details",
     "Shipping address", "Choose payment", "Review & confirm".
  3. Number the steps explicitly in the `<Stepper>` (1 of 5) — never
     hide the count; users navigating mid-flow need to know how far
     they have to go.
  4. On every step transition (Next or Back), persist the partial form
     state to `sessionStorage` under
     `cir.draft.<recipe_id>.<form_id>` with a TTL of 30 minutes
     (store a `saved_at` ISO timestamp; reject anything older on
     read). Do not write to `localStorage` — drafts must not survive
     a logout or a tab close.
  5. On mount, if a draft exists and is within TTL, surface a
     non-blocking `<Alert>` "Resume where you left off?" with two
     actions: Resume (rehydrates state, jumps to last completed step
     +1) and Start over (clears the draft). Never auto-rehydrate
     silently; the user may have intended a fresh start.
  6. Final step submits via the bound capability. On success, clear
     the draft entry from `sessionStorage` so a re-visit starts clean.
known_failure_modes:
  - Promoting a 3-section form to a wizard because "it might grow" —
    over-engineering. Apply the threshold to the schema as it is now.
  - Persisting drafts to `localStorage` and leaking PII across logouts.
    Always use `sessionStorage` for in-progress form data.
  - Forgetting the TTL check; a 4-day-old draft rehydrates against a
    schema that has since changed, producing silent validation drift.
  - Auto-rehydrating without prompting the user — surprising and
    indistinguishable from a security incident on a shared device.
  - Hiding the step count to "reduce cognitive load" — measurably
    increases abandonment in long flows.
---

# Multi-step form

A form that is too long to scan becomes a wizard, and a wizard that
loses your work on a refresh becomes the reason a user abandons the
flow. This skill encodes the fork (single vs multi-step), the step
naming convention, and the draft-recovery contract.

## Why this skill exists

The compiler will otherwise default to either "one massive form" (which
breaks on mobile) or "wizard everything" (which adds friction to short
flows). The 4-sections-or-dependency rule gives a clean threshold the
compiler can apply without per-recipe tuning, and the sessionStorage
recovery flow keeps users from losing 90 seconds of typing to a
mistimed Cmd+R.

## Composition rules

- Step naming: imperative verb + short noun phrase, under 24 chars.
  Never reuse a step name across two steps in the same wizard.
- Draft persistence: `sessionStorage`, key
  `cir.draft.<recipe_id>.<form_id>`, 30-minute TTL keyed off
  `saved_at`. Reject older drafts on read.
- Recovery is an explicit prompt, not an auto-rehydrate. The user
  approves the resume.
- Going back is always allowed; previously-entered values are
  preserved verbatim. Do not validate-on-back.
