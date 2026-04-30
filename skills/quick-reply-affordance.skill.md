---
name: quick-reply-affordance
version: 0.1.0
description: Show 3 inline suggested replies on short messages — and fall through to a full Reply form when the message is long, sensitive, or requires a non-trivial answer.
capabilities_used:
  - thread.get
  - thread.reply
when_to_use: |
  When rendering the detail view of a thread whose latest message is
  SHORT (under 280 characters of body text) AND the topic is NOT
  legal, financial, medical, or HR-sensitive (see content guard below).
  The skill surfaces three suggested-reply chips above the keyboard /
  composer, each producing a reply of at most 140 characters. If the
  user taps a chip, the reply is staged in the composer with the
  capability's standard `confirmation: 'inline'` send flow — never
  auto-sent.
when_not_to_use: |
  Long messages (latest body over 280 characters). Threads tagged with
  any of `legal`, `financial`, `medical`, `hr`, `compliance`, or
  `pii_detected` upstream — for those topics a templated reply risks
  saying something binding or wrong. Skip when the user has typed any
  characters into the composer (don't override their in-flight draft).
  Skip when the latest message is from the user themselves. Skip when
  the suggested reply text would exceed 140 characters — fall through
  to the full Reply form instead.
example_flow: |
  1. Call `thread.get` for the displayed thread.
  2. Gate checks (in order; first failing check disqualifies):
       a. Latest message length ≤ 280 chars.
       b. No content tag in the deny-list (`legal`, `financial`, ...).
       c. Composer is empty.
       d. Latest sender is not the current user.
     If any gate fails, render only the standard Reply button.
  3. Suggestion source: ask the upstream suggestion service (placeholder
     capability id `compose.suggest_reply` — declare in capabilities/
     before binding the manifest) for up to 3 candidates, each ≤ 140
     chars. Filter post-hoc: drop candidates over 140 chars; drop any
     candidate that contains words from the deny-list; deduplicate
     by leading 30-char prefix.
  4. If 0 valid candidates remain, render only the full Reply button.
  5. If 1+ remain (max 3), render a horizontal `ButtonGroup` of chips
     directly above the composer. Each chip is a Button (size: sm,
     variant: secondary). Pressing a chip stages its text in the
     composer; the user sees the text and must press Send to fire
     `thread.reply`. The send is `confirmation: 'inline'` — never
     auto-submit on chip tap.
  6. Always render the full Reply button alongside the chips. The chips
     are an accelerator, not a replacement.
known_failure_modes:
  - Auto-sending on chip tap. The chip stages text; Send fires the
    capability. Auto-send is forbidden because suggestion quality is
    not high enough to bind without a final human read.
  - Suggesting replies for sensitive topics. A "Looks good!" chip on a
    legal release is a contractual hazard. The deny-list gate must
    fire even if the latest message is short.
  - Showing a chip whose text is over 140 chars. The 140-char bound is
    the testable contract — long suggestions belong in the full Reply
    form where the user reads and edits.
  - Overriding a non-empty composer. If the user has started typing,
    the chips must not appear; if they appear and the user starts
    typing, the chips must hide on first keystroke.
  - Treating the suggestion service as deterministic. The capability
    is allowed to return zero suggestions (cold start, low confidence,
    rate limit) — the surface must degrade to "no chips, full Reply
    button" without a layout jump.
---

# Quick reply affordance

A small accelerator for high-frequency inboxes: three suggested chips
above the composer for short messages where a one-line ack is the
likely correct reply. The skill exists primarily to encode the
content-deny-list and the 140-character bound — both have bitten
real apps that shipped suggested-reply features without them.

## Why this skill exists

Suggested replies are net-positive for short messages and net-negative
for sensitive ones. The compiler does not have the context to decide
which is which. This skill encodes the heuristic so the chips appear
in the right places and stay quiet otherwise.

## Composition rules

- The chips are a `ButtonGroup` of size-sm secondary buttons, never
  primary. The Send button is the only primary in the composer area.
- The full Reply button is always rendered. The chips are additive.
- The suggestion source is a separate capability (`compose.suggest_reply`,
  not yet shipped — declare a stub in `capabilities/` before binding
  this skill into a manifest). Do not inline LLM calls in the skill
  body.

## Composition with personalization

- Read `intent.global_preferences.automation_trust`. On `strict`, the
  chips still render (they don't auto-act), but the Send confirm is
  promoted to modal. On `permissive`, behavior unchanged.
- Read `intent.global_preferences.density`. On `compact`, render two
  chips instead of three (the third is highest-overlap with the first
  two ~70% of the time anyway).

## Falling through to a full Reply form

When the gate checks fail, the surface MUST still render a full Reply
button (the standard `Form` component bound to `thread.reply`). The
quick-reply chips are an accelerator on top of that base affordance —
they never replace it. A surface that loses the Reply button when the
chips disqualify is broken.
