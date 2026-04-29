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
