// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
import { describe, expect, it } from 'vitest';
import { ManifestSchema, ThreadManifestSchema, TurnDeltaSchema } from '../src/manifest.ts';

describe('ManifestSchema', () => {
  it('parses the full docs/artifacts.md §Render manifest example', () => {
    const example = {
      manifest_id: 'm_8f3a2b1c',
      user_id: 'vid',
      app_id: 'mail.example.com',
      compiled_from: {
        capability_version: '2.1.0',
        skill_versions: {
          'email-triage': '1.4.0',
          'smart-reply': '0.9.2',
        },
        component_catalog_version: '3.0.0',
        intent_profile_version: 47,
        compiler_model: 'claude-opus-4-7',
        compiled_at: '2026-04-29T12:00:00Z',
      },
      ttl: null,
      invalidates_on: [
        'capability_schema_change:mail.example.com:>=2.2.0',
        'intent_profile_change:vid:lens.email',
        'explicit_user_request:m_8f3a2b1c',
      ],
      routes: [
        {
          path: '/',
          redirect: '/today',
        },
        {
          path: '/today',
          title: 'Today',
          layout: {
            component: 'Stack',
            children: [
              {
                component: 'DecisionQueue',
                data: {
                  source: 'thread.list',
                  filter: 'requires_decision = true AND received_after = today_start',
                  sort: 'urgency desc',
                },
                actions: ['task.create_from_thread', 'thread.archive', 'draft.create'],
              },
              {
                component: 'TaskQueue',
                data: {
                  source: 'task.list',
                  filter: 'due_within = 7d AND status != done',
                  group_by: 'due_date',
                },
                actions: ['task.complete', 'task.snooze'],
              },
            ],
          },
          refresh: {
            data: 'on_focus + 60s_interval',
            structure: 'never_unless_invalidated',
          },
        },
      ],
      policies_satisfied: [
        'no_destructive_actions_without_confirm',
        'no_send_without_review',
        'data_scope_within_grant',
      ],
      rollback_to: 'm_8f3a2b1b',
    };

    const parsed = ManifestSchema.parse(example);
    expect(parsed.manifest_id).toBe('m_8f3a2b1c');
    expect(parsed.routes).toHaveLength(2);
    expect(parsed.routes[1]?.layout?.children).toHaveLength(2);
    expect(parsed.rollback_to).toBe('m_8f3a2b1b');
  });

  it('rejects a manifest with a malformed manifest_id', () => {
    const bad = {
      manifest_id: 'not-a-manifest-id',
      user_id: 'vid',
      app_id: 'mail.example.com',
      compiled_from: {
        capability_version: '1.0.0',
        skill_versions: {},
        component_catalog_version: '1.0.0',
        intent_profile_version: 1,
        compiler_model: 'claude',
        compiled_at: '2026-04-29T12:00:00Z',
      },
      invalidates_on: [],
      routes: [],
      policies_satisfied: [],
    };
    const result = ManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join('.') === 'manifest_id')).toBe(true);
    }
  });

  it('supports recursive layout nodes (3 levels deep)', () => {
    const m = {
      manifest_id: 'm_deeptest1',
      user_id: 'vid',
      app_id: 'app',
      compiled_from: {
        capability_version: '1.0.0',
        skill_versions: {},
        component_catalog_version: '1.0.0',
        intent_profile_version: 1,
        compiler_model: 'claude',
        compiled_at: '2026-04-29T12:00:00Z',
      },
      invalidates_on: [],
      routes: [
        {
          path: '/x',
          layout: {
            component: 'Stack',
            children: [
              {
                component: 'Card',
                children: [{ component: 'Markdown' }],
              },
            ],
          },
        },
      ],
      policies_satisfied: [],
    };
    expect(() => ManifestSchema.parse(m)).not.toThrow();
  });
});

describe('TurnDeltaSchema', () => {
  it('parses the docs/chat/conversation-artifacts.md turn delta example', () => {
    const delta = {
      delta_type: 'extend',
      previous_manifest: 'm_8f3a0001',
      new_manifest: 'm_8f3b0001',
      changes: [
        { op: 'add_route', path: '/booking-confirmation', spec: {} },
        { op: 'update_data_source', component_id: 'c_001', filter: 'foo' },
      ],
      tokens_used: 2400,
      model: 'claude-sonnet-4-7',
    };
    expect(() => TurnDeltaSchema.parse(delta)).not.toThrow();
  });
});

describe('ThreadManifestSchema', () => {
  it('parses the docs/chat/conversation-artifacts.md thread manifest example', () => {
    const thread = {
      conversation_id: 'conv_abc',
      thread: [
        { turn: 1, manifest_id: 'm_00000001', rendered_components: ['TravelOptions'] },
        { turn: 3, manifest_id: 'm_00000002', rendered_components: ['FlightDetail'] },
        { turn: 5, manifest_id: 'm_00000003', rendered_components: ['BookingForm'] },
        { turn: 7, manifest_id: 'm_00000004', rendered_components: ['BookingConfirmation'] },
      ],
      total_tokens: 18400,
      total_actions_executed: 3,
    };
    const parsed = ThreadManifestSchema.parse(thread);
    expect(parsed.thread).toHaveLength(4);
  });
});
