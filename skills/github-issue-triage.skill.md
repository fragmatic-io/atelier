---
name: github-issue-triage
version: 0.1.0
description: Review a user's GitHub repos, surface stale or noisy issues, file new tracking issues for unresolved threads, and close issues that have already been resolved elsewhere.
capabilities_used:
  - github.repo.list
  - github.issue.create
  - github.issue.close
when_to_use: |
  When a maintainer wants a daily or weekly pass over their repos to:
  (a) catch issues that should have been closed, (b) file follow-up issues
  for ongoing work that lives in chat or a meeting, or (c) get a single
  view of "what across all my repos needs my attention this morning."
when_not_to_use: |
  Bulk issue migrations across orgs (use the GitHub CLI instead). Spam
  triage on a public open-source project — the rate limits and
  confirmation policy here assume one human reviewing a small queue.
  Anything requiring writing or editing PR review comments — out of scope.
example_flow: |
  1. Call `github.repo.list` for the user to enumerate active repos.
  2. For each repo, fetch open issues (out of scope for v0.1; deferred to
     `github.issue.list`) and rank by `updated_at` ascending — oldest first.
  3. Present a queue to the user. For each item, propose one of:
     - Close (calls `github.issue.close` with reason `not_planned`/`completed`).
     - File a tracking issue (`github.issue.create`) on a related repo.
     - Skip.
  4. Never auto-execute. Issue creation requires a modal confirm; close
     requires inline confirm — the capability declares both.
  5. After every action, surface the rollback affordance
     (`github.issue.reopen` for closes; `github.issue.close` for creates).
known_failure_modes:
  - Treating a label like `wontfix` as already-closed and double-closing it.
  - Filing a duplicate tracking issue when the original is in a private repo
    the compiler does not have read scope for.
  - Closing an issue that is the target of an open PR — always check linked
    PRs before recommending close.
---

# GitHub issue triage

This skill orchestrates the three GitHub capabilities to give a maintainer
one focused queue of issues that need a decision. The compiler should
read this body when binding the skill into a manifest — the frontmatter
is the structured contract, but the prose below is the institutional
context that keeps the agent honest.

## Why this skill exists

Maintainers do not read every notification. They do an asynchronous
sweep, ideally once per day. A good triage interface concentrates the
five or ten issues that genuinely need a human into one queue, and
provides reversible affordances for the action the maintainer takes.

## Composition rules

- Never call `github.issue.create` without first showing the maintainer
  the title and body. The capability requires `confirmation: modal` and
  the runtime enforces this; the skill must not try to bypass it.
- `github.issue.close` is reversible — surface the rollback button in
  the UI for at least 30 seconds after a close, and emit
  `audit.action_executed` with the rollback handle.
- The list of repos comes from `github.repo.list` only; never hard-code
  repo names in the manifest.
