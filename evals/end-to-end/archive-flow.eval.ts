// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The Atelier Authors
/**
 * End-to-end eval: simulate the archive flow using the runtime's real
 * dispatcher with a stub `thread.archive` handler.
 *
 * Walks the dispatcher path:
 *   1. Modal confirmation gate fires (thread.archive declares confirmation: 'modal').
 *   2. Confirmation callback returns confirmed: true.
 *   3. Handler executes with the dispatch input.
 *   4. Reversible action pushes one undo entry.
 *   5. An action.executed audit event lands in the captured sink.
 *
 * No network, no React — pure in-process orchestration. This is what the
 * end-to-end taxonomy in docs/production-concerns.md calls a synthetic
 * intent → manifest → action → audit chain, scoped to the action half.
 */

import { defineEval } from '@atelier/evals';
import {
  ActionDispatcher,
  MapActionRegistry,
  type AuditSink,
  type ConfirmationCallback,
  type ConfirmationRequest,
} from '@atelier/runtime';
import type { AuditEvent } from '@atelier/schemas';
import { CAPABILITIES } from '../../apps/demo/lib/fake-capabilities';

interface FlowOutcome {
  ok: boolean;
  result_archived_at: string | null;
  side_effects: readonly string[];
  handler_calls: number;
  handler_input: { thread_id?: string } | null;
  confirm_calls: number;
  confirm_capability_id: string | null;
  audit_executed_count: number;
  audit_denied_count: number;
  can_undo: boolean;
  undo_stack_size: number;
}

export default defineEval({
  id: 'end-to-end/archive-flow/dispatch-confirm-undo-audit',
  description: 'thread.archive dispatch confirms, runs handler, pushes undo, emits audit.',
  kind: 'end-to-end',
  tags: ['archive', 'dispatcher'],
  input: { thread_id: 't_001' },
  run: async (input: { thread_id: string }): Promise<FlowOutcome> => {
    const handlerCalls: { input: unknown }[] = [];
    const registry = new MapActionRegistry();
    registry.register('thread.archive', (handlerInput) => {
      handlerCalls.push({ input: handlerInput });
      return Promise.resolve({ archived_at: '2026-04-29T12:34:56Z' });
    });

    const confirmCalls: ConfirmationRequest[] = [];
    const confirm: ConfirmationCallback = (req) => {
      confirmCalls.push(req);
      return { confirmed: true };
    };

    const events: AuditEvent[] = [];
    const audit: AuditSink = {
      emit(event) {
        events.push(event);
      },
    };

    const dispatcher = new ActionDispatcher({
      capabilities: CAPABILITIES,
      registry,
      confirm,
      audit,
    });

    const result = await dispatcher.dispatch('thread.archive', input, {
      user_id: 'demo-user',
      app_id: 'cir.demo',
    });

    const handlerInput = handlerCalls[0]?.input as { thread_id?: string } | undefined;
    const resultBody =
      result.result === undefined ? null : (result.result as { archived_at?: string });

    return {
      ok: result.ok,
      result_archived_at: resultBody?.archived_at ?? null,
      side_effects: result.side_effects ?? [],
      handler_calls: handlerCalls.length,
      handler_input: handlerInput ?? null,
      confirm_calls: confirmCalls.length,
      confirm_capability_id: confirmCalls[0]?.capability_id ?? null,
      audit_executed_count: events.filter((e) => e.type === 'action.executed').length,
      audit_denied_count: events.filter((e) => e.type === 'action.denied').length,
      can_undo: dispatcher.canUndo(),
      undo_stack_size: dispatcher.undoStackSize(),
    };
  },
  expected: (output: unknown): boolean => {
    const o = output as FlowOutcome;
    return (
      o.ok === true &&
      o.result_archived_at === '2026-04-29T12:34:56Z' &&
      o.side_effects.length === 2 &&
      o.side_effects.includes('archive') &&
      o.side_effects.includes('mutates:thread_state') &&
      o.handler_calls === 1 &&
      o.handler_input?.thread_id === 't_001' &&
      o.confirm_calls === 1 &&
      o.confirm_capability_id === 'thread.archive' &&
      o.audit_executed_count === 1 &&
      o.audit_denied_count === 0 &&
      o.can_undo === true &&
      o.undo_stack_size === 1
    );
  },
});
