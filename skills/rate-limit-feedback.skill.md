---
name: rate-limit-feedback
version: 0.1.0
description: When the dispatcher returns 429 / rate-limited — show a countdown affordance, a suggested wait, and (commercial) a link to the upgrade flow.
capabilities_used:
  - dummyjson.product.search
  - github.issue.create
when_to_use: |
  Any capability invocation that may return a rate-limit error from the
  dispatcher (HTTP 429, or framework-level throttle). Particularly write
  capabilities that are bursted from a UI button.
when_not_to_use: |
  Generic server errors — those go through the `error-prose` skill.
  Rate-limit errors that originate inside the user's own debouncer
  (those should be invisible; the input is already debounced).
example_flow: |
  1. On a 429 response, read `Retry-After` (seconds) or the framework
     `retry_after_ms`. Default to 10s if neither is present.
  2. Render a `<Toast variant=warning>` with prose: "Too many requests —
     retry in 12s." Title ≤ 60 chars, body ≤ 120 chars.
  3. Replace the trigger's label with a live countdown ("Retry in 11s")
     instead of greying it out ambiguously. The button stays visually
     active so the user understands it will return.
  4. If the brand kit declares a commercial tier, append a `<Button
     variant=link>` "Upgrade for higher limits" pointing at the
     upgrade route surfaced in `intent.global_preferences`.
  5. After the countdown finishes, restore the original label and
     re-enable the trigger. Do not auto-retry — the user pulls.
known_failure_modes:
  - Greying out the button with no countdown — user assumes the action
    is forbidden, not throttled.
  - Auto-retrying in the background and burning the budget the user
    can't see.
  - Showing the upgrade link to users on a tier that already has the
    highest quota — check `intent.global_preferences.tier` first.
---

# Rate-limit feedback

A micro-skill: turn a 429 into a clear, time-boxed wait — never an
ambiguous dead button.

## The rule

Countdown on the trigger. Suggested wait in a `<Toast>`. Upgrade link
only when an upgrade exists. Never auto-retry.
