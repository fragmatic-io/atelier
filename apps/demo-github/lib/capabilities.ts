// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Capability metadata loaded by the demo's manifest endpoint. Mirrors
 * `apps/demo/lib/fake-capabilities.ts` — each entry is a typed
 * `Capability` from `@cir/schemas`.
 *
 * The set is deliberately small:
 *  - `github.repo.list`, `github.issue.list`, `github.issue.get` — data
 *    capabilities the resolver wires to fixture or real GitHub
 *  - `github.issue.create`, `github.issue.close`, `github.issue.bulk_close` —
 *    actions exercised by the showcase
 *
 * We re-declare the existing JSON capabilities as TS literals here to
 * mirror `apps/demo`'s convention; the canonical source-of-truth is
 * `capabilities/github/*.json` (which is what `validate:data` enforces).
 */

import type { Capability } from '@cir/schemas';

export const CAPABILITIES: Record<string, Capability> = {
  'github.repo.list': {
    id: 'github.repo.list',
    kind: 'data',
    version: '0.1.0',
    input: { username: 'string' },
    output: { repos: 'array<repo>' },
    side_effects: ['reads:github_repos'],
    permissions: ['github:read'],
    confirmation: 'none',
    rate_limit: '60/min/user',
    reversible: true,
  },
  'github.issue.list': {
    id: 'github.issue.list',
    kind: 'data',
    version: '0.1.0',
    input: { owner: 'string', repo: 'string', state: 'string' },
    output: { issues: 'array<issue>' },
    side_effects: ['reads:github_issues'],
    permissions: ['github:read'],
    confirmation: 'none',
    rate_limit: '60/min/user',
    reversible: true,
    salience_default: 'urgency * recency + assigned_to_me * 2',
    // P-9: triage queues are the user's primary surface — the data
    // resolver auto-emits `emphasis: 'high'` so every row in the queue
    // surfaces `data-emphasis="high"` for host-stylesheet treatment.
    salience_level: 'high',
  },
  'github.issue.get': {
    id: 'github.issue.get',
    kind: 'data',
    version: '0.1.0',
    input: { owner: 'string', repo: 'string', number: 'number' },
    output: { issue: 'issue' },
    side_effects: ['reads:github_issues'],
    permissions: ['github:read'],
    confirmation: 'none',
    rate_limit: '60/min/user',
    reversible: true,
  },
  'github.issue.create': {
    id: 'github.issue.create',
    kind: 'action',
    version: '0.1.0',
    input: {
      owner: 'string',
      repo: 'string',
      title: 'string',
      body: 'string',
      labels: 'array<string>',
    },
    output: {
      number: 'number',
      html_url: 'string',
      created_at: 'datetime',
    },
    side_effects: ['mutates:github_issues', 'post'],
    permissions: ['github:write'],
    confirmation: 'modal',
    rate_limit: '20/min/user',
    reversible: true,
    rollback: 'github.issue.close',
  },
  'github.issue.close': {
    id: 'github.issue.close',
    kind: 'action',
    version: '0.1.0',
    input: {
      owner: 'string',
      repo: 'string',
      issue_number: 'number',
      reason: 'string',
    },
    output: { number: 'number', state: 'string', closed_at: 'datetime' },
    side_effects: ['mutates:github_issues'],
    permissions: ['github:write'],
    confirmation: 'inline',
    rate_limit: '30/min/user',
    reversible: true,
    rollback: 'github.issue.reopen',
    undoable: true,
    undo_window_ms: 5000,
    low_stakes: true,
    // P-9: closing an issue is a destructive-but-reversible decision the
    // user should see clearly amongst the queue. The data resolver and
    // the salience-aware container surface high-priority issues with a
    // visible emphasis flag.
    salience_level: 'high',
  },
  'github.issue.archive': {
    // Client-only convenience capability used by the optimistic-archive
    // flow. The dispatcher stores the row's archived flag locally and
    // emits an undo toast for 5s.
    id: 'github.issue.archive',
    kind: 'action',
    version: '0.1.0',
    input: { owner: 'string', repo: 'string', issue_number: 'number' },
    output: { archived_at: 'datetime' },
    side_effects: ['mutates:client_view_state'],
    permissions: ['github:read'],
    confirmation: 'none',
    reversible: true,
    rollback: 'github.issue.unarchive',
    undoable: true,
    undo_window_ms: 5000,
    low_stakes: true,
    // P-9: matches `github.issue.close` — both are the user's main triage
    // levers and deserve hierarchy in the queue.
    salience_level: 'high',
  },
  'github.issue.bulk_close': {
    // Wraps github.issue.close. The bulk path requires verbal confirmation
    // because it amplifies the blast radius.
    id: 'github.issue.bulk_close',
    kind: 'action',
    version: '0.1.0',
    input: { issue_ids: 'array<string>', reason: 'string' },
    output: { closed_count: 'number' },
    side_effects: ['mutates:github_issues'],
    permissions: ['github:write'],
    confirmation: 'verbal_required',
    rate_limit: '5/min/user',
    reversible: true,
    rollback: 'github.issue.bulk_reopen',
  },
  // Rollback / inverse capabilities so reversibility_surfaced has a target
  // to point at and confirmation_required_for_destructive can resolve them.
  'github.issue.reopen': {
    id: 'github.issue.reopen',
    kind: 'action',
    version: '0.1.0',
    input: {
      owner: 'string',
      repo: 'string',
      issue_number: 'number',
    },
    output: { number: 'number', state: 'string', reopened_at: 'datetime' },
    side_effects: ['mutates:github_issues'],
    permissions: ['github:write'],
    confirmation: 'none',
    rate_limit: '30/min/user',
    reversible: true,
    rollback: 'github.issue.close',
  },
  'github.issue.unarchive': {
    id: 'github.issue.unarchive',
    kind: 'action',
    version: '0.1.0',
    input: { owner: 'string', repo: 'string', issue_number: 'number' },
    output: { unarchived_at: 'datetime' },
    side_effects: ['mutates:client_view_state'],
    permissions: ['github:read'],
    confirmation: 'none',
    reversible: true,
    rollback: 'github.issue.archive',
  },
  'github.issue.bulk_reopen': {
    id: 'github.issue.bulk_reopen',
    kind: 'action',
    version: '0.1.0',
    input: { issue_ids: 'array<string>' },
    output: { reopened_count: 'number' },
    side_effects: ['mutates:github_issues'],
    permissions: ['github:write'],
    confirmation: 'modal',
    rate_limit: '5/min/user',
    reversible: true,
    rollback: 'github.issue.bulk_close',
  },
  // Rate-limit visibility — the chip on every route binds this so
  // rate_limited_actions_show_state passes. Output mirrors GitHub's
  // X-RateLimit-* response headers so the proxy can populate it.
  'github.api.rate_limit': {
    id: 'github.api.rate_limit',
    kind: 'data',
    version: '0.1.0',
    input: {},
    output: {
      remaining: 'number',
      limit: 'number',
      reset_at: 'datetime',
    },
    side_effects: ['reads:github_meta'],
    permissions: ['github:read'],
    confirmation: 'none',
    reversible: true,
  },
  // Aggregate counts surfaced in <KPIRow> on /today. Read-only.
  'github.issue.summary': {
    id: 'github.issue.summary',
    kind: 'data',
    version: '0.1.0',
    input: {},
    output: {
      open_issues: 'number',
      assigned_to_me: 'number',
      high_priority: 'number',
    },
    side_effects: ['reads:github_issues'],
    permissions: ['github:read'],
    confirmation: 'none',
    reversible: true,
  },
  // Per-issue events surfaced in <Timeline> on the detail route.
  'github.issue.events': {
    id: 'github.issue.events',
    kind: 'data',
    version: '0.1.0',
    input: { owner: 'string', repo: 'string', number: 'number' },
    output: {
      events: 'array<event>',
    },
    side_effects: ['reads:github_issues'],
    permissions: ['github:read'],
    confirmation: 'none',
    reversible: true,
  },
};
