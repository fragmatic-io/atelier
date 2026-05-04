// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

import { describe, expect, it, vi } from 'vitest';
import type { AuditEvent, Capability, ComponentDefinition, Manifest } from '@atelier/schemas';
import {
  createBaselineManifestValidator,
  MemoryManifestStore,
  ServerManifestResolver,
  type CompileInput,
  type CompileResult,
  type CompilerService,
} from '@atelier/compiler';
import { ActionDispatcher, MapActionRegistry } from '@atelier/runtime';

const capability: Capability = {
  id: 'pilot.mark_seen',
  kind: 'action',
  version: '1.0.0',
  input: { thread_id: 'string' },
  output: { marked: 'boolean' },
  side_effects: ['mutates:thread_state'],
  permissions: ['thread:write'],
  confirmation: 'none',
  reversible: false,
};

const components: ComponentDefinition[] = [
  {
    id: 'Container',
    props_schema: 'ContainerProps',
    data_sources: [],
    actions_supported: [],
    responsive_targets: ['web'],
    design_tokens: '@atelier/demo/brand@0.1.0',
    examples: [],
    text_render: true,
  },
  {
    id: 'Button',
    props_schema: 'ButtonProps',
    data_sources: [],
    actions_supported: ['pilot.mark_seen'],
    responsive_targets: ['web'],
    design_tokens: '@atelier/demo/brand@0.1.0',
    examples: [],
    text_render: true,
  },
];

function manifest(): Manifest {
  return {
    manifest_id: 'm_pilot001',
    user_id: 'demo-user',
    app_id: 'cir.demo',
    compiled_from: {
      capability_version: '1.0.0',
      skill_versions: {},
      component_catalog_version: '1.0.0',
      intent_profile_version: 1,
      compiler_model: 'stub',
      compiled_at: '2026-05-04T00:00:00Z',
    },
    ttl: null,
    invalidates_on: [],
    policies_satisfied: [],
    routes: [
      {
        path: '/pilot',
        title: 'Pilot',
        layout: {
          component: 'Container',
          props: {},
          children: [
            {
              component: 'Button',
              props: { label: 'Mark seen' },
              actions: ['pilot.mark_seen'],
              children: [],
            },
          ],
        },
        refresh: { data: 'manual', structure: 'never_unless_invalidated' },
      },
    ],
  };
}

describe('pilot readiness golden path', () => {
  it('validates, caches, dispatches, and audits one manifest-referenced action', async () => {
    const auditEvents: AuditEvent[] = [];
    const compiler: CompilerService = {
      id: 'pilot-stub',
      compile: async (): Promise<CompileResult> => ({
        manifest: manifest(),
        token_cost: 7,
        duration_ms: 2,
        model: 'pilot-stub',
        diff_mode: false,
      }),
    };
    const input: CompileInput = {
      user_id: 'demo-user',
      app_id: 'cir.demo',
      route: '/pilot',
      capabilities: { [capability.id]: capability },
      components,
    };
    const store = new MemoryManifestStore();
    const resolver = new ServerManifestResolver({
      compiler,
      store,
      audit: (event) => auditEvents.push(event),
      validate: createBaselineManifestValidator({
        grantedFields: [],
        actionSlots: { Button: ['onClick'] },
      }),
    });

    const resolved = await resolver.resolve(input);

    expect(resolved.source).toBe('fresh_compile');
    expect(await store.get(resolved.key)).not.toBeNull();
    expect(auditEvents[0]?.type).toBe('manifest.compiled');
    expect(auditEvents[0]?.policy_evaluations.some((row) => !row.passed)).toBe(false);

    const registry = new MapActionRegistry();
    const handler = vi.fn(async () => ({ marked: true }));
    registry.register(capability.id, handler);
    const dispatcher = new ActionDispatcher({
      capabilities: { [capability.id]: capability },
      registry,
      confirm: async () => ({ confirmed: true }),
      audit: { emit: (event) => auditEvents.push(event) },
    });
    const actionId = resolved.manifest.routes[0]?.layout.children?.[0]?.actions?.[0];

    const result = await dispatcher.dispatch(
      actionId!,
      { thread_id: 't_1' },
      {
        user_id: 'demo-user',
        app_id: 'cir.demo',
        manifest_id: resolved.manifest.manifest_id,
      },
    );

    expect(result.ok).toBe(true);
    expect(handler).toHaveBeenCalledWith(
      { thread_id: 't_1' },
      {
        user_id: 'demo-user',
        app_id: 'cir.demo',
        manifest_id: resolved.manifest.manifest_id,
      },
    );
    expect(auditEvents.map((event) => event.type)).toEqual([
      'manifest.compiled',
      'action.executed',
    ]);
  });
});
