// Test fixtures shared across @cir/react tests. Mirrors the runtime's
// fixture style.

import type { Capability, Manifest } from '@cir/schemas';

export function makeManifest(overrides: Partial<Manifest> = {}): Manifest {
  return {
    manifest_id: 'm_test_001',
    user_id: 'test-user',
    app_id: 'test-app',
    compiled_from: {
      capability_version: '1.0.0',
      skill_versions: {},
      component_catalog_version: '1.0.0',
      intent_profile_version: 1,
      compiler_model: 'test',
      compiled_at: '2026-04-29T12:00:00Z',
    },
    ttl: null,
    invalidates_on: [],
    routes: [
      {
        path: '/today',
        title: 'Today',
        layout: {
          component: 'Stack',
          children: [
            {
              component: 'Greeting',
              props: { message: 'hello' },
            },
          ],
        },
      },
    ],
    policies_satisfied: [],
    ...overrides,
  };
}

export function archiveCapability(): Capability {
  return {
    id: 'thread.archive',
    kind: 'action',
    version: '1.0.0',
    input: { thread_id: 'string' },
    output: {},
    side_effects: ['archive'],
    permissions: ['thread:write'],
    confirmation: 'none',
    reversible: true,
    rollback: 'thread.unarchive',
  };
}

export function unarchiveCapability(): Capability {
  return {
    id: 'thread.unarchive',
    kind: 'action',
    version: '1.0.0',
    input: { thread_id: 'string' },
    output: {},
    side_effects: ['mutates:thread_state'],
    permissions: ['thread:write'],
    confirmation: 'none',
    reversible: true,
    rollback: 'thread.archive',
  };
}

export function deleteCapability(): Capability {
  return {
    id: 'task.delete',
    kind: 'action',
    version: '1.0.0',
    input: { task_id: 'string' },
    output: {},
    side_effects: ['delete'],
    permissions: ['task:write'],
    confirmation: 'modal',
    reversible: false,
  };
}
