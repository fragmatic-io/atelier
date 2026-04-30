// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Shared fixtures for `@cir/compiler` tests. The Manifest fixture matches
 * `apps/demo/lib/fake-manifests.ts` shape so all tests exercise a real,
 * schema-valid Manifest without re-deriving it in each file.
 */

import type {
  BrandKit,
  Capability,
  ComponentDefinition,
  IntentProfile,
  Manifest,
  Skill,
  Trigger,
} from '@cir/schemas';
import type { CompileInput } from '../src/types.ts';

const COMPILED_FROM = {
  capability_version: '1.0.0',
  skill_versions: {},
  component_catalog_version: '1.0.0',
  intent_profile_version: 1,
  compiler_model: 'gemini-2.5-pro',
  compiled_at: '2026-04-29T12:00:00Z',
};

export function fixtureManifest(overrides: Partial<Manifest> = {}): Manifest {
  return {
    manifest_id: 'm_demotoday',
    user_id: 'demo-user',
    app_id: 'cir.demo',
    compiled_from: COMPILED_FROM,
    ttl: null,
    invalidates_on: ['capability_schema_change:cir.demo:>=1.1.0'],
    policies_satisfied: ['data_access_within_grant'],
    routes: [
      {
        path: '/today',
        title: 'Today',
        layout: {
          component: 'Container',
          props: { maxWidth: 'md' },
          children: [
            { component: 'Alert', props: { severity: 'info', title: 'Hi' }, children: [] },
            { component: 'UndoBar', children: [] },
          ],
        },
        refresh: {
          data: 'on_focus + 60s_interval',
          structure: 'never_unless_invalidated',
        },
      },
    ],
    ...overrides,
  };
}

export function fixtureCapability(): Capability {
  return {
    id: 'thread.archive',
    kind: 'action',
    version: '1.0.0',
    input: { thread_id: 'string' },
    output: { archived_at: 'string' },
    side_effects: ['archive', 'mutates:thread_state'],
    permissions: ['thread:write'],
    confirmation: 'none',
    reversible: true,
    rollback: 'thread.unarchive',
  } as unknown as Capability;
}

export function fixtureComponent(): ComponentDefinition {
  return {
    props_schema: 'AlertProps',
    data_sources: [],
    actions_supported: [],
    responsive_targets: ['web'],
    design_tokens: '@app/tokens/v1',
    examples: [],
    text_render: true,
  };
}

export function fixtureSkill(): Skill {
  return {
    name: 'email-triage',
    version: '1.0.0',
    description: 'Triage incoming email into decision queues.',
    capabilities_used: ['thread.archive'],
    when_to_use: 'When the user opens /today and has unread threads.',
    when_not_to_use: 'Do not auto-triage marketing email.',
    example_flow: '1. fetch unread\n2. archive newsletters\n3. surface decisions',
    known_failure_modes: ['Mistakes calendar invites for newsletters'],
  };
}

export function fixtureBrandKit(): BrandKit {
  return {
    id: 'demo-brand',
    version: '1.2.3',
    tokens: {
      colors: { brand: '#abcdef', surface: '#ffffff' },
      spacing: { sm: '4px', md: '8px' },
      typography: {
        font_stack: 'Inter, system-ui, sans-serif',
        scale: { body: '14px', h1: '32px' },
      },
    },
    variants: { Button: ['primary', 'secondary'] },
    voice: {
      tone: 'direct',
      do: ['be specific'],
      dont: ['be cute'],
    },
  };
}

export function fixtureIntent(): IntentProfile {
  return {
    user_id: 'demo-user',
    profile_version: 7,
    updated_at: '2026-04-29T12:00:00Z',
    global_preferences: { density: 'compact' },
    lenses: { email: 'founder_inbox' },
    rules: [{ scope: '*', rule: 'Investor mail above newsletters', version: 1 }],
    vocabulary: {},
  };
}

export function fixtureTrigger(): Trigger {
  return {
    type: 'intent.lens_switched',
    user_id: 'demo-user',
    domain: 'email',
    new_lens: 'founder_inbox',
  } as unknown as Trigger;
}

export function fixtureCompileInput(overrides: Partial<CompileInput> = {}): CompileInput {
  return {
    user_id: 'demo-user',
    app_id: 'cir.demo',
    route: '/today',
    capabilities: { 'thread.archive': fixtureCapability() },
    components: [{ ...fixtureComponent(), id: 'Alert' } as unknown as ComponentDefinition],
    ...overrides,
  };
}
