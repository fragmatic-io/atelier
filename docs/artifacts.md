# The Three Artifacts

Atelier splits everything into three things: capabilities + skills (public), intent (private), render (ephemeral). The rest of the framework follows from this split.

---

## 1. Capabilities + Skills (PUBLIC)

Owned by the app. Signed. Versioned. Cacheable at the edge.

### Capability

A **capability** is a typed action or data resource the app exposes:

```json
{
  "id": "thread.archive",
  "kind": "action",
  "version": "2.1.0",
  "input": { "thread_id": "string" },
  "output": { "archived_at": "datetime" },
  "side_effects": ["mutates:thread_state"],
  "permissions": ["thread:write"],
  "confirmation": "none",
  "rate_limit": "100/min/user",
  "reversible": true,
  "rollback": "thread.unarchive"
}
```

### Skill

A **skill** is a capability plus the knowledge required to use it well:

```yaml
# /skills/email-triage.skill.md
name: email-triage
version: 1.4.0
description: Categorize an email thread by urgency and required action
capabilities_used:
  - thread.read
  - thread.classify
  - task.create
  - calendar.suggest_event
when_to_use: |
  When the user opens a thread that contains explicit asks,
  deadlines, or commitments. Not for newsletters or notifications.
when_not_to_use: |
  Marketing emails. Auth codes. Receipts.
  System notifications. Anything from no-reply addresses.
example_flow: |
  1. Read thread content + sender context
  2. Classify: action_required | informational | scheduling | follow_up
  3. If action_required, propose task.create with extracted ask
  4. If scheduling, propose calendar.suggest_event with extracted date
  5. Always present as suggestion, never auto-execute
known_failure_modes:
  - Confusing FYI emails for action items
  - Misreading scheduling polls as confirmed events
  - Treating thread quotes as new asks
```

### Component catalog

A **component catalog** is also public. It lists the UI primitives the app supports:

```json
{
  "TaskQueue": {
    "props_schema": "TaskQueueProps",
    "data_sources": ["task.list", "thread.list"],
    "actions_supported": ["task.complete", "task.snooze", "task.assign"],
    "responsive_targets": ["web", "mobile", "tablet"],
    "design_tokens": "@app/tokens/v3",
    "examples": ["/examples/task-queue-basic.json"]
  }
}
```

These three things — capability registry, skill library, component catalog — are the **complete public surface** of an app in Atelier. Everything else (default UI, marketing pages, onboarding) is built on top of them, including by the company itself.

See [`component-catalog.md`](component-catalog.md) for the 83-component baseline that covers most web app patterns.

---

## 2. Intent (PRIVATE)

Owned by the user. Encrypted. Portable. Cross-app.

An **intent profile** is a structured representation of how the user wants software to behave:

```json
{
  "user_id": "vid",
  "profile_version": 47,
  "updated_at": "2026-04-29T12:00:00Z",
  "global_preferences": {
    "density": "compact",
    "color_mode": "system",
    "modal_tolerance": "low",
    "automation_trust": "drafts_only",
    "primary_workflow": "task_queue",
    "decision_separation": true
  },
  "lenses": {
    "email": "founder_inbox",
    "calendar": "deep_work_blocks",
    "github": "review_queue",
    "linear": "this_week_only"
  },
  "rules": [
    {
      "scope": "email",
      "rule": "Investor and customer emails surface above newsletters",
      "version": 12
    },
    {
      "scope": "*",
      "rule": "Never auto-send. Drafts only. Always confirm.",
      "version": 1,
      "locked": true
    }
  ],
  "vocabulary": {
    "the team": ["alice", "bob", "charlie"],
    "investors": ["@gp1.vc", "@gp2.vc"],
    "deep work": "9am-12pm weekdays"
  },
  "cross_app_workflows": [
    {
      "name": "weekly_review",
      "trigger": "friday 4pm",
      "uses": ["linear.completed", "calendar.past_week", "email.starred"]
    }
  ]
}
```

### The vault

The intent profile lives in a **vault** — a user-owned store. The vault can be:

- Cloud-hosted by a neutral provider (the user's "interface agent" service)
- Self-hosted (Local-first, CRDT-backed, à la Automerge)
- Held by a privacy-respecting platform (Apple, Bluesky/AT Protocol PDS, Solid Pod)

Apps request scoped read access to slices of the profile via a permission flow. The user grants `email_lens` access; the app never sees `calendar_lens` or `github_lens`. Apps cannot write to the vault — only the user (via their agent) can.

In chat contexts, the persistent intent profile is supplemented by a **conversation overlay** that captures preferences expressed in a single conversation. See [`chat/conversation-artifacts.md`](chat/conversation-artifacts.md).

---

## 3. Render (EPHEMERAL)

The output of compilation. Cached, versioned, disposable.

A **manifest** is a declarative interface program:

```json
{
  "manifest_id": "m_8f3a2b1c",
  "user_id": "vid",
  "app_id": "mail.example.com",
  "compiled_from": {
    "capability_version": "2.1.0",
    "skill_versions": {
      "email-triage": "1.4.0",
      "smart-reply": "0.9.2"
    },
    "component_catalog_version": "3.0.0",
    "intent_profile_version": 47,
    "compiler_model": "claude-opus-4-7",
    "compiled_at": "2026-04-29T12:00:00Z"
  },
  "ttl": null,
  "invalidates_on": [
    "capability_schema_change:mail.example.com:>=2.2.0",
    "intent_profile_change:vid:lens.email",
    "explicit_user_request:m_8f3a2b1c"
  ],
  "routes": [
    {
      "path": "/",
      "redirect": "/today"
    },
    {
      "path": "/today",
      "title": "Today",
      "layout": {
        "component": "Stack",
        "children": [
          {
            "component": "DecisionQueue",
            "data": {
              "source": "thread.list",
              "filter": "requires_decision = true AND received_after = today_start",
              "sort": "urgency desc"
            },
            "actions": ["task.create_from_thread", "thread.archive", "draft.create"]
          },
          {
            "component": "TaskQueue",
            "data": {
              "source": "task.list",
              "filter": "due_within = 7d AND status != done",
              "group_by": "due_date"
            },
            "actions": ["task.complete", "task.snooze"]
          }
        ]
      },
      "refresh": {
        "data": "on_focus + 60s_interval",
        "structure": "never_unless_invalidated"
      }
    }
  ],
  "policies_satisfied": [
    "no_destructive_actions_without_confirm",
    "no_send_without_review",
    "data_scope_within_grant"
  ],
  "rollback_to": "m_8f3a2b1b"
}
```

The manifest is plain JSON. The runtime knows how to interpret it. The compiler produced it once. Until something invalidates it, every render is a cache hit.

See [`caching.md`](caching.md) for how manifests are stored and invalidated, and [`triggers.md`](triggers.md) for what causes invalidation.
