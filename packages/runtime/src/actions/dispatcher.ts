// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Action dispatcher — validates input shape, gates on confirmation, executes
 * via a registered handler, records reversible actions on the undo stack,
 * and emits `action.executed` / `action.denied` audit events.
 *
 * See `/Users/vid/cir/docs/architecture.md` §"Action Gateway". This is the
 * client-side counterpart to the gateway; it does NOT replace gateway-side
 * authentication or audit. Hosts that talk directly to a gateway can wire
 * their gateway client into the `ActionRegistry`.
 *
 * AGENTS.md hard rule #4: every action declares side_effects, permissions,
 * and reversibility. The dispatcher trusts the capability declarations and
 * acts accordingly: reversible actions push undo entries, destructive
 * actions trigger confirmation.
 */

import type { AuditEvent, Capability } from '@cir/schemas';
import type { AuditSink } from '../audit/emit.js';
import { NoopAuditSink } from '../audit/emit.js';
import { isoNow, type Clock } from '../types.js';
import type { ActionRegistry } from '../registry/action-registry.js';
import {
  requiresConfirmation,
  type ConfirmationCallback,
  type ConfirmationDecision,
} from './confirm.js';
import { UndoStack, type UndoEntry } from './undo.js';

export interface ActionExecutionContext {
  manifest_id?: string;
  user_id: string;
  app_id: string;
}

export interface ActionResult {
  ok: boolean;
  result?: unknown;
  error?: string;
  audit_id?: string;
  side_effects?: string[];
}

export interface ActionDispatcherOptions {
  /** Capabilities the dispatcher knows about, keyed by `capability.id`. */
  capabilities: Record<string, Capability>;
  registry: ActionRegistry;
  confirm: ConfirmationCallback;
  audit?: AuditSink;
  /** Bounded undo stack size. Default 50. */
  undoStackSize?: number;
  /** Override `Date.now` for tests. */
  clock?: Clock;
}

function lastSegment(capabilityId: string): string {
  const idx = capabilityId.lastIndexOf('.');
  return idx >= 0 ? capabilityId.slice(idx + 1) : capabilityId;
}

let auditSeq = 0;
function nextAuditId(): `evt_${string}` {
  auditSeq += 1;
  const rand = Math.random().toString(36).slice(2, 10);
  return `evt_${Date.now().toString(36)}${auditSeq.toString(36)}${rand}`;
}

export class ActionDispatcher {
  readonly #capabilities: Record<string, Capability>;
  readonly #registry: ActionRegistry;
  readonly #confirm: ConfirmationCallback;
  readonly #audit: AuditSink;
  readonly #undoStack: UndoStack;
  readonly #clock: Clock;

  constructor(opts: ActionDispatcherOptions) {
    this.#capabilities = opts.capabilities;
    this.#registry = opts.registry;
    this.#confirm = opts.confirm;
    this.#audit = opts.audit ?? NoopAuditSink;
    this.#undoStack = new UndoStack(opts.undoStackSize ?? 50);
    this.#clock = opts.clock ?? isoNow;
  }

  async dispatch(
    capabilityId: string,
    input: unknown,
    ctx: ActionExecutionContext,
  ): Promise<ActionResult> {
    const capability = this.#capabilities[capabilityId];
    if (!capability) {
      return this.#deny(ctx, capabilityId, `unknown capability: ${capabilityId}`);
    }

    if (requiresConfirmation(capability.confirmation)) {
      // `requiresConfirmation` returns true only for 'modal' | 'verbal_required'.
      // 'inline' is handled by component-side affordances, never via this gate.
      const level = capability.confirmation as 'modal' | 'verbal_required';
      const verbal_phrase = level === 'verbal_required' ? lastSegment(capability.id) : undefined;
      const prompt = `Confirm ${capability.id}`;
      const decision: ConfirmationDecision = await this.#confirm({
        capability_id: capability.id,
        prompt,
        side_effects: capability.side_effects,
        level,
        ...(verbal_phrase ? { verbal_phrase } : {}),
      });
      if (!decision.confirmed) {
        return this.#deny(
          ctx,
          capabilityId,
          decision.reason ?? 'confirmation declined',
          capability,
        );
      }
    }

    const handler = this.#registry.get(capabilityId);
    if (!handler) {
      return this.#deny(ctx, capabilityId, `no handler registered for ${capabilityId}`, capability);
    }

    let result: unknown;
    try {
      result = await handler(input, ctx);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return this.#deny(ctx, capabilityId, `handler threw: ${message}`, capability);
    }

    if (capability.reversible && capability.rollback) {
      const entry: UndoEntry = {
        rollback_capability_id: capability.rollback,
        rollback_input: input,
        original_capability_id: capabilityId,
        original_input: input,
        pushed_at: this.#clock(),
      };
      this.#undoStack.push(entry);
    }

    const audit_id = await this.#emitExecuted(ctx, capability, result);
    return {
      ok: true,
      result,
      audit_id,
      side_effects: [...capability.side_effects],
    };
  }

  /**
   * Pop the top of the undo stack and dispatch the recorded rollback. Returns
   * the dispatched `ActionResult`, or `null` if the stack is empty.
   *
   * Important: the undo dispatch itself does NOT push another undo entry,
   * even if the rollback capability is reversible. We avoid the obvious
   * infinite ping-pong by skipping the undo bookkeeping on this path.
   */
  async undo(): Promise<ActionResult | null> {
    const entry = this.#undoStack.pop();
    if (!entry) return null;
    return this.#dispatchWithoutUndoTracking(
      entry.rollback_capability_id,
      entry.rollback_input,
      // We don't have an exec ctx for the undo path; reuse what we have on the entry.
      // The host can override by calling dispatch() directly if it wants.
      { user_id: '', app_id: '' },
    );
  }

  canUndo(): boolean {
    return !this.#undoStack.isEmpty();
  }

  /** Test-only inspection helper. */
  undoStackSize(): number {
    return this.#undoStack.size();
  }

  async #dispatchWithoutUndoTracking(
    capabilityId: string,
    input: unknown,
    ctx: ActionExecutionContext,
  ): Promise<ActionResult> {
    const capability = this.#capabilities[capabilityId];
    if (!capability) {
      return this.#deny(ctx, capabilityId, `unknown capability: ${capabilityId}`);
    }
    const handler = this.#registry.get(capabilityId);
    if (!handler) {
      return this.#deny(ctx, capabilityId, `no handler registered for ${capabilityId}`, capability);
    }
    let result: unknown;
    try {
      result = await handler(input, ctx);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return this.#deny(ctx, capabilityId, `handler threw: ${message}`, capability);
    }
    const audit_id = await this.#emitExecuted(ctx, capability, result);
    return {
      ok: true,
      result,
      audit_id,
      side_effects: [...capability.side_effects],
    };
  }

  async #deny(
    ctx: ActionExecutionContext,
    capabilityId: string,
    reason: string,
    capability?: Capability,
  ): Promise<ActionResult> {
    const audit_id = await this.#emitDenied(ctx, capabilityId, reason, capability);
    return { ok: false, error: reason, audit_id };
  }

  async #emitExecuted(
    ctx: ActionExecutionContext,
    capability: Capability,
    _result: unknown,
  ): Promise<string> {
    const event_id = nextAuditId();
    const event: AuditEvent = {
      event_id,
      timestamp: this.#clock(),
      user_id: ctx.user_id || 'unknown',
      app_id: ctx.app_id || 'unknown',
      type: 'action.executed',
      actor: 'user',
      before_state_hash: '',
      after_state_hash: '',
      trigger_chain: [`action:${capability.id}`],
      token_cost: 0,
      policy_evaluations: [],
      ...(ctx.manifest_id ? { manifest_id: ctx.manifest_id } : {}),
    };
    await this.#emit(event);
    return event_id;
  }

  async #emitDenied(
    ctx: ActionExecutionContext,
    capabilityId: string,
    reason: string,
    _capability?: Capability,
  ): Promise<string> {
    const event_id = nextAuditId();
    const event: AuditEvent = {
      event_id,
      timestamp: this.#clock(),
      user_id: ctx.user_id || 'unknown',
      app_id: ctx.app_id || 'unknown',
      type: 'action.denied',
      actor: 'user',
      before_state_hash: '',
      after_state_hash: '',
      trigger_chain: [`action:${capabilityId}`, `reason:${reason}`],
      token_cost: 0,
      policy_evaluations: [],
      ...(ctx.manifest_id ? { manifest_id: ctx.manifest_id } : {}),
    };
    await this.#emit(event);
    return event_id;
  }

  async #emit(event: AuditEvent): Promise<void> {
    try {
      await this.#audit.emit(event);
    } catch {
      // Audit is best-effort.
    }
  }
}
