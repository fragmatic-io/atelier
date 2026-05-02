# The Trigger System

Triggers are the nervous system of Atelier. They are how the world tells the cache to invalidate.

For chat / agent surfaces, five additional trigger families apply (turn-level, tool result, topic shift, context threshold, sub-agent emit, schedule). See [`chat/triggers.md`](chat/triggers.md).

---

## Trigger taxonomy

### Schema triggers (app-emitted)

- `capability.added`, `.changed`, `.removed`, `.version_bumped`
- `component.added`, `.changed`, `.removed`, `.version_bumped`
- `skill.added`, `.changed`, `.removed`
- `policy.changed`

### Intent triggers (user-emitted)

- `intent.preference_changed { scope }`
- `intent.lens_switched { app, lens }`
- `intent.rule_added`, `.removed`, `.modified`
- `intent.vocabulary_updated`

### Behavioral triggers (system-detected, optional)

- `behavior.workaround_detected` — user does the same multi-step thing 3+ times → suggest a recompile
- `behavior.feature_unused` — user never uses 80% of the surface → suggest a simplification recompile
- `behavior.error_pattern` — repeated dead-ends → suggest a different layout

### Explicit triggers (user-initiated)

- `user.recompile_route { route }`
- `user.recompile_all`
- `user.revert_manifest { manifest_id }`
- `user.try_lens { lens_name }`

### System triggers (rare)

- `system.compiler_upgraded` — only invalidates if eval shows divergence
- `system.security_revocation` — emergency invalidation of an action or capability

---

## Trigger pipeline

```
Trigger emitted
  ↓
Trigger Bus
  ↓
Routing rules:
  - which manifests does this affect?
  - which users are subscribed?
  - which routes are hot vs cold?
  ↓
Invalidation:
  - hot routes → recompile immediately, push update
  - warm routes → mark stale, recompile on next access
  - cold routes → mark stale, no action until accessed
  ↓
Notification:
  - clients with active sessions get a manifest_updated event
  - runtime fetches new manifest, swaps in atomically
  - user sees subtle "Updated" indicator (optional)
```

---

## Behavioral triggers — the subtle but powerful one

A user repeatedly does the same workaround. Example:

- User opens email
- User clicks "Create task from this"
- User pastes the email subject as task title
- User sets due date matching the email's mention of "Friday"

If this pattern repeats 3+ times within a week, the system can emit:

```
behavior.workaround_detected {
  user_id, app_id,
  pattern: "thread_to_task_with_extracted_date",
  occurrences: 4,
  proposed_capability: "task.create_from_thread",
  proposed_recompile: ["/today", "/inbox"]
}
```

The agent surfaces a one-line suggestion: _"Want me to set this up automatically? I noticed you've done this 4 times this week."_ The user accepts → intent profile updated → manifest recompiled. The workflow gets faster.

This is how the system learns without spying. Behavioral signals are observed but not stored beyond the suggestion; once the user decides, the signal is discarded.
