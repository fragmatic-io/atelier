// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The Atelier Authors
/**
 * Manifest eval: the demo's `/today` manifest passes the full baseline
 * policy bundle plus the @atelier/components composition rules.
 *
 * Mirrors the live `validate` callback assembled in
 * `apps/demo/lib/atelier-providers.tsx`. If a policy fails here, the resolver
 * would refuse to serve the manifest in the demo — surface that on every
 * eval run instead of waiting for a Next.js dev hit.
 *
 * NOTE: Composition rules are inlined to mirror @atelier/components/registry.ts.
 * Importing the package directly pulls in 'use client' React TSX files that
 * fail to load under plain Node + tsx. Phase 5c can split a pure-data
 * `RULES` export out of the registry to drop this duplication.
 */

import { defineEval } from '@atelier/evals';
import {
  BASELINE_POLICIES,
  composesAccordingTo,
  validateManifest,
  type CompositionRules,
} from '@atelier/policies';
import { todayManifest } from '../../apps/demo/lib/fake-manifests';
import { CAPABILITIES } from '../../apps/demo/lib/fake-capabilities';
import { DEMO_BRAND_KIT } from '../../apps/demo/lib/brand-kit';

// Subset of @atelier/components/registry.ts COMPOSITION_RULES sufficient for
// the components used in the /today manifest plus the demo extensions.
const COMPOSITION_RULES: CompositionRules = {
  Stack: { can_contain: '*', min_children: 1, max_children: 50 },
  Container: { can_contain: '*' },
  Grid: { can_contain: '*' },
  Card: { can_contain: ['Stack', 'Grid', 'Markdown', 'Table', 'EmptyState'] },
  Tabs: { can_contain: '*' },
  Accordion: { can_contain: '*' },
  Modal: { can_contain: '*' },
  Drawer: { can_contain: '*' },
  Table: { can_contain: 'leaf' },
  List: { can_contain: '*' },
  Markdown: { can_contain: 'leaf' },
  EmptyState: { can_contain: 'leaf' },
  Button: { can_contain: 'leaf' },
  TextInput: { can_contain: 'leaf' },
  Select: { can_contain: 'leaf' },
  Alert: { can_contain: 'leaf' },
  Spinner: { can_contain: 'leaf' },
  DetailView: { can_contain: 'leaf' },
  StatCard: { can_contain: 'leaf' },
  Toast: { can_contain: 'leaf' },
  Progress: { can_contain: 'leaf' },
  Skeleton: { can_contain: 'leaf' },
  ConfirmDialog: { can_contain: 'leaf' },
};

const GRANTED_FIELDS = [
  'thread.list.*',
  'task.list.*',
  'thread.id',
  'thread.sender',
  'thread.subject',
  'thread.snippet',
  'thread.received_at',
  'thread.requires_decision',
];

export default defineEval({
  id: 'manifest/today/policies-pass',
  description:
    '/today manifest passes BASELINE_POLICIES + composition rules with the demo grant set.',
  kind: 'manifest',
  tags: ['today', 'policies'],
  input: null,
  run: () => {
    const result = validateManifest(
      {
        manifest: todayManifest(),
        capabilities: CAPABILITIES,
        intent: {
          user_id: 'demo-user',
          global_preferences: {},
          granted_fields: GRANTED_FIELDS,
        },
        rate_limited_capability_ids: new Set<string>(),
        pii_fields: new Set(['email']),
        brand_kit: DEMO_BRAND_KIT,
      },
      {
        policies: [...BASELINE_POLICIES, composesAccordingTo(COMPOSITION_RULES)],
      },
    );
    return {
      ok: result.ok,
      error_violations: result.violations
        .filter((v) => v.severity === 'error')
        .map((v) => `${v.policy_id}: ${v.message}`),
    };
  },
  expected: (output: unknown): boolean => {
    const o = output as { ok: boolean; error_violations: string[] };
    return o.ok === true && o.error_violations.length === 0;
  },
});
