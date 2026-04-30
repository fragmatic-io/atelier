---
name: motion-respect-reduced
version: 0.1.0
description: Respect `prefers-reduced-motion` and `intent.global_preferences.motion_preference === 'reduced'`. No auto-play, no parallax, no large translation; cross-fade only, ≤200ms.
capabilities_used:
  - dummyjson.product.list
  - github.repo.list
when_to_use: |
  Any manifest that includes motion — page transitions, list re-orders,
  toast slide-ins, modal entrances, hover micro-interactions, anything
  driven by the brand kit's `motion` tokens.
when_not_to_use: |
  Non-decorative animation that conveys state and has no static
  equivalent (e.g. a `<Progress>` bar — its motion IS the information).
  Even then, cap duration aggressively in reduced mode.
example_flow: |
  1. Read the OS preference via the CSS `@media (prefers-reduced-motion:
     reduce)` query. Read the intent override at
     `intent.global_preferences.motion_preference`. Either being
     "reduced" wins.
  2. In reduced mode: no auto-play (videos, carousels, ambient
     animation), no parallax, no large translations (anything > 8px),
     no rotation, no scale > 1.05x.
  3. Acceptable in reduced mode: cross-fade (opacity-only), instant
     state changes, color transitions ≤ 200ms.
  4. Cap all animation durations at 200ms in reduced mode regardless
     of the brand kit's declared duration scale.
  5. Apply motion tokens from `brand_kit.motion.duration_scale` only
     after the reduced-motion check; never bypass it.
known_failure_modes:
  - Reading the media query but ignoring the intent override (or vice
    versa).
  - Auto-playing a hero video that respects volume preferences but not
    motion preferences.
  - Fading + sliding together — even a small slide is "translation"
    and should be removed in reduced mode.
  - Animating focus rings — the focus ring must appear instantly even
    in non-reduced mode; movement misleads about where focus landed.
---

# Motion: respect reduced

A micro-skill: motion is a courtesy. The user's preference is the
ceiling, not the floor.

## The rule

OS pref OR intent override of "reduced" → cross-fade only, no
translation > 8px, no auto-play, ≤ 200ms.
