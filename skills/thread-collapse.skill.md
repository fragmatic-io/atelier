---
name: thread-collapse
version: 0.1.0
description: Collapse long, stale, or single-sender threads to the latest unread message plus a count of prior — and trim quoted-text from message bodies.
capabilities_used:
  - thread.get
when_to_use: |
  When opening a detail view of a thread that meets ANY of:
    - more than 5 messages,
    - oldest message is older than 24 hours,
    - all messages from the same sender (likely a self-CC chain or a
      one-way notification stream).
  The skill replaces a flat render of every message with a collapsed
  view that focuses on the latest unread message and provides a single
  "show N earlier" affordance to expand the rest in place.
when_not_to_use: |
  Threads with 5 or fewer messages AND younger than 24 hours — those
  fit on screen, collapsing them is a regression. Active back-and-forth
  conversations where the user is mid-reply (the compose surface needs
  the full context). Legal / compliance contexts where every message
  must be visible by default — declare a `policy: full_render` override
  on those threads upstream and the skill will pass through.
example_flow: |
  1. Call `thread.get` for the requested thread id.
  2. Decide collapse — true when ANY of the three triggers above fire.
     Compute once and cache on the Card; do not recompute on scroll.
  3. If collapse is true:
       a. Render the latest unread message in full (or, if all are read,
          the latest message overall).
       b. Above it, render a single inline affordance:
          "Show N earlier messages" (Button, secondary).
       c. Below the latest message, append a faint footer:
          "N messages, M senders, oldest from {relative-time}."
  4. Quoted-text trimming: in any rendered message body, fold runs of
     `> ` quoted lines into a single inline "Show quoted text" affordance.
     The trim is purely cosmetic — never alter `thread.get` output, never
     re-send the trimmed body. The capability output is truth-of-record.
  5. Expansion: clicking "Show N earlier" replaces the affordance with
     the full message list rendered as a `Stack` of `Card` (one per
     message). Do NOT animate height — instant swap reads as faster
     and avoids motion-pref violations.
known_failure_modes:
  - Collapsing a thread where the latest message is itself a quote of
    the prior. The collapsed view then reads as zero new content. Detect
    "this message is >50% quoted" and fall through to expanded render.
  - Hiding the message that contains the actual ask. If the latest
    message is a thank-you or "+1" the user has no context — never
    collapse when the latest message is shorter than 80 characters AND
    older messages contain longer bodies.
  - Permanently dropping quoted text from server-side data. The trim is
    a render-only fold; the underlying message body must survive copy
    / forward / reply unmodified.
  - Misclassifying a thread as "single-sender" when the sender is the
    user themselves replying to their own draft. Check sender identity
    against the current user id before applying that trigger.
---

# Thread collapse

Long threads waste vertical space and bury the latest message. This
skill encodes the collapse heuristics and the quoted-text trim — both
purely render-side, no mutations.

## Why this skill exists

A naive thread render is "list every message, oldest first, no fold."
That works for 3-message threads and breaks for 30. The compiler does
not know when to collapse on its own — it errs toward "show everything"
because hiding is risky. This skill encodes the three triggers (count,
age, single-sender) so the decision is deterministic.

## Composition rules

- The skill is render-only. It does NOT mutate `thread.get` output. The
  copy-to-clipboard, reply, and forward affordances must operate on the
  full underlying body, not the trimmed view.
- The "Show N earlier" affordance is a single Button, not a Tabs and
  not a Drawer. Drawers move the conversation off-screen and break the
  reading flow.
- Quoted-text fold uses the same affordance pattern: a single Button
  inline at the position of the quoted block, expanding in place.

## Composition with personalization

- Read `intent.global_preferences.density`. On `compact`, also collapse
  threads with 3 or more messages (lower the threshold from 5).
- Read `intent.global_preferences.motion_preference`. On `reduced`, the
  expansion is instant (no transition); on `subtle`, fade-in 150ms; on
  `rich`, height transition 250ms ease-out.
- Read `intent.global_preferences.modal_tolerance`. On `low`, never
  open expansion in a modal — always inline.
