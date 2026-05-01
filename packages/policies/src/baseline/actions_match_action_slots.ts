// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Policy: `actions_match_action_slots`
 *
 * Phase 2 #2 — capability dispatch is first-class (ethos principle #8).
 * Components declare their action slots via `ComponentBinding.actionSlots`
 * (e.g. `['onPrimaryAction', 'onSecondaryAction']`). The render-node maps
 * `node.actions[i]` to `actionSlots[i]`; capabilities beyond the slot
 * count have nowhere to land.
 *
 * This policy fires when a manifest node carries `actions: [...]` AND the
 * host has surfaced an `action_slots` entry for that componentId on
 * `PolicyContext.action_slots`. Excess capabilities (more than the
 * binding's declared slot count) emit an `error` violation.
 *
 * Bindings WITHOUT an `action_slots` entry are unconstrained — the
 * renderer falls back to the legacy capability-id-as-prop dispatch and
 * emits a one-shot `console.warn` so devs migrate. We mirror that
 * tolerance here: the policy is silent for bindings that haven't
 * declared their slots yet, instead of forcing a pre-flag-day cutover.
 *
 * Severity: `error`. A manifest declaring 3 capabilities on a 1-slot
 * Button button isn't ambiguous — it's authorial drift, and the second
 * and third capabilities will silently never fire.
 */

import type { LayoutNode } from '@cir/schemas';
import type { NamedPolicy, PolicyResult, PolicyViolation } from '../result.js';
import { walkManifest } from '../internal/walk-layout.js';

const POLICY_ID = 'actions_match_action_slots';

export const actionsMatchActionSlots: NamedPolicy = {
  id: POLICY_ID,
  description:
    'A manifest node with `actions: [...]` and a registered binding that declares `actionSlots` may not carry more capabilities than the binding has slots for. Bindings without declared slots are unconstrained (legacy fallback).',
  applies_to: 'manifest',
  severity: 'error',
  evaluate(ctx): PolicyResult {
    const violations: PolicyViolation[] = [];
    const slotMap = ctx.action_slots;
    if (!slotMap) return { ok: true, violations };

    walkManifest(ctx.manifest, (node: LayoutNode, path) => {
      const actions = node.actions;
      if (!actions || actions.length === 0) return;
      const slots = slotMap[node.component];
      if (!slots) return; // Unknown / unconstrained binding — see policy doc.
      if (actions.length <= slots.length) return;
      violations.push({
        policy_id: POLICY_ID,
        severity: 'error',
        message: `${node.component} at ${path} declares ${String(actions.length)} action(s) but binding has only ${String(slots.length)} action slot(s) (${slots.join(', ')}). Excess capabilities (${actions.slice(slots.length).join(', ')}) cannot be dispatched.`,
        path,
        hint: `Reduce node.actions to ${String(slots.length)} entries, or extend the binding's actionSlots if the component can route more.`,
      });
    });

    return { ok: violations.length === 0, violations };
  },
};
