# What Graduates to Product

Some patterns that emerge from user customization should graduate into product features. The system should make this visible.

---

## The PM dashboard

```
Observability dashboard (for the company):

Top 10 user-generated lenses this month:
  1. "Investor decisions" (used by 12% of founder users)
  2. "Vendor follow-ups" (used by 8% of ops users)
  3. "Standup digest" (used by 15% of eng managers)
  ...

Top 10 user-requested capabilities not yet supported:
  1. "Group threads by company" (requested 340 times)
  2. "Auto-categorize by sentiment" (requested 220 times)
  ...

Top 10 user-built workflows:
  1. "Email + calendar + task triage" (built by 8% of users)
  ...
```

The company's PM team uses this to:

- Promote the most popular lenses to default-recipe status
- Build first-class capabilities for the most-requested features
- Pre-warm caches for popular workflows

---

## The feedback loop

This is the productive feedback loop: every user is a forward-deployed engineer for the company. Their customizations are signal. The best ones become product.

The signal pathway:

1. User customizes their interface via the customize flow
2. Manifest is logged with provenance (which intent, which capabilities, which components)
3. Aggregated patterns surface in the PM dashboard
4. PM team picks winners
5. Winners become default recipes (no engineering needed)
6. Highly-used capabilities get first-class treatment (skill polish, faster paths, dedicated UI)
7. New capabilities land for the things users keep wanting but cannot express

---

## Wave 6 V-4: the first real detector

Step 3 above ("aggregated patterns surface") used to be hand-wavy. As of
Wave 6 / track V-4, it lands behind a real seam:

- `SequenceDetector` in `@cir/policies` keeps a per-user sliding window
  of recent `ObservedAction`s, hashes sub-sequences, and only surfaces
  candidates when at least two distinct users converge on the same chain
  (cross-user dedup — a single user repeating a workflow is a habit, not
  a graduation candidate).
- `BehavioralTap` in `@cir/runtime` subscribes to a `StreamingAuditSink`
  and forwards every `action.executed` event to the detector. Privacy
  contract: only the audit `event_id` is used as the `args_fingerprint`,
  raw inputs never enter the detector.
- The demo's `/admin/patterns` route renders the snapshot and exposes a
  "Promote to recipe" button that scaffolds a stub at
  `recipes/_proposed/<pattern_id>.json` for human review.

The "Promote to recipe" workflow is intentionally minimal — the stub
still requires a human to convert it into a real recipe. Closing the loop
end-to-end (auto-generate the manifest fragment, run the compile path on
the proposed recipe, notify an owner) is V-6 territory.

See `packages/policies/src/behavioral/sequence-detector.ts` for the
algorithm and `evals/end-to-end/sequence-detector.eval.ts` for a
deterministic 100-event replay that asserts the expected candidates
surface.
