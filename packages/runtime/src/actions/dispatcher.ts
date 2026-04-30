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
import { UndoStack, type UndoEntry, type UndoExecutionContext } from './undo.js';

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
        // Preserve the caller's full execution context so the rollback's
        // audit event and policy checks replay with the original identity
        // (user_id, app_id) and manifest_id. Spread to defensively copy.
        ctx: { ...ctx },
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
    // Replay the ORIGINAL execution context that was supplied when the
    // forward action was dispatched. This keeps audit trails consistent
    // (same user_id, app_id, manifest_id) and lets policy checks scope
    // correctly. ETHOS principle 8: reversibility is a primitive, not
    // a feature — synthesizing empty identity here is a correctness bug.
    return this.#dispatchWithoutUndoTracking(
      entry.rollback_capability_id,
      entry.rollback_input,
      entry.ctx,
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

  /**
   * Emit `action.optimistic_applied`. Internal — called by the
   * `optimisticDispatch()` helper. The trigger chain carries only the
   * capability id; the synthesized outcome is intentionally NOT included so
   * the audit log stays free of host-side speculative state.
   */
  async _emitOptimisticApplied(ctx: UndoExecutionContext, capability: Capability): Promise<string> {
    const event_id = nextAuditId();
    const event: AuditEvent = {
      event_id,
      timestamp: this.#clock(),
      user_id: ctx.user_id || 'unknown',
      app_id: ctx.app_id || 'unknown',
      type: 'action.optimistic_applied',
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

  /**
   * Emit `action.optimistic_rolled_back`. Internal — called by the
   * `optimisticDispatch()` helper when the underlying dispatch fails. The
   * `redactedReason` argument MUST already be sanitized by the caller —
   * never include input payloads (which may contain API keys, PII, etc).
   */
  async _emitOptimisticRolledBack(
    ctx: UndoExecutionContext,
    capability: Capability,
    redactedReason: string,
  ): Promise<string> {
    const event_id = nextAuditId();
    const event: AuditEvent = {
      event_id,
      timestamp: this.#clock(),
      user_id: ctx.user_id || 'unknown',
      app_id: ctx.app_id || 'unknown',
      type: 'action.optimistic_rolled_back',
      actor: 'user',
      before_state_hash: '',
      after_state_hash: '',
      trigger_chain: [`action:${capability.id}`, `reason:${redactedReason}`],
      token_cost: 0,
      policy_evaluations: [],
      ...(ctx.manifest_id ? { manifest_id: ctx.manifest_id } : {}),
    };
    await this.#emit(event);
    return event_id;
  }
}

// -----------------------------------------------------------------------------
// optimisticDispatch — the auto-optimistic UI helper
// -----------------------------------------------------------------------------

/**
 * Options for `optimisticDispatch()`.
 *
 * Generic over the capability's input shape (`I`) and the synthesized
 * outcome shape (`O`). The host produces the speculative outcome via
 * `optimisticOutcome(input)`; the runtime hands that outcome to `onApply`
 * synchronously (BEFORE the network call) and to `onRollback` if the
 * subsequent `dispatch()` resolves with `ok: false` or throws.
 *
 * The runtime opts into the optimistic path ONLY when the capability has
 * BOTH `reversible: true` AND `low_stakes: true`. Without both flags the
 * helper is a transparent passthrough to `dispatch()` — neither
 * `optimisticOutcome` nor `onApply` nor `onRollback` is invoked.
 */
export interface OptimisticDispatchOptions<I, O> {
  /** The capability the host is invoking — must include the runtime flags. */
  capability: Capability;
  /** Input forwarded to `dispatch()` verbatim. */
  input: I;
  /** Identity to attach to the dispatch call + audit events. */
  ctx: UndoExecutionContext;
  /**
   * Synthesize the expected outcome from the input. Called once at the
   * top of `optimisticDispatch()` (before the network round-trip). Pure
   * function — no side effects beyond computing the outcome.
   */
  optimisticOutcome: (input: I) => O;
  /**
   * Apply the synthesized outcome to UI state. Runs synchronously, before
   * `dispatch()` is called. Hosts use this to snap the UI to the predicted
   * post-action state.
   */
  onApply: (outcome: O) => void;
  /**
   * Roll the UI back to its pre-apply state. Runs after `dispatch()`
   * resolves with `ok: false` OR throws. The error is passed through so
   * hosts can format their toast message.
   */
  onRollback: (outcome: O, err: Error) => void;
}

/**
 * Redact noisy / sensitive substrings from a thrown error message before it
 * lands in the audit log. We strip:
 *  - `Bearer <token>` → `Bearer [REDACTED]`
 *  - Anthropic-style key prefixes (`sk-ant-...`, `sk-...`)
 *  - any `key=...` / `token=...` query params
 *
 * The list is intentionally short — we trust the underlying SDK / fetch
 * client not to embed credentials in error messages, and these patterns
 * cover the most-likely accidents.
 */
function redactErrorMessage(message: string): string {
  return message
    .replace(/Bearer\s+[A-Za-z0-9._\-+/]+/gu, 'Bearer [REDACTED]')
    .replace(/sk-ant-[A-Za-z0-9_-]+/gu, '[REDACTED_API_KEY]')
    .replace(/\bsk-[A-Za-z0-9_-]{16,}/gu, '[REDACTED_API_KEY]')
    .replace(/(\b(?:api[_-]?key|key|token|auth)=)[^&\s]+/giu, '$1[REDACTED]');
}

/**
 * Auto-optimistic dispatch entrypoint.
 *
 * Behavior:
 *  - When `capability.reversible === true && capability.low_stakes === true`:
 *    1. Synthesize the outcome via `optimisticOutcome(input)`.
 *    2. Call `onApply(outcome)` synchronously — UI snaps to post-action state.
 *    3. Emit `action.optimistic_applied` to the dispatcher's audit sink.
 *    4. Call `dispatcher.dispatch(capability.id, input, ctx)`.
 *    5. On `ok: false` OR thrown error: call `onRollback(outcome, err)`,
 *       emit `action.optimistic_rolled_back`, and return the failed result.
 *  - Otherwise: pass through to `dispatcher.dispatch()` directly. The
 *    `optimisticOutcome` / `onApply` / `onRollback` callbacks are NOT invoked.
 *
 * Concurrency: each call carries its own synthesized outcome in a closure,
 * so multiple in-flight optimistic dispatches do NOT clobber each other —
 * the rollback handler always sees the outcome it was paired with.
 *
 * Audit events on rollback include `capability_id` + a redacted error
 * message ONLY. The input payload is never included — see
 * `redactErrorMessage()` for the redaction patterns.
 */
export async function optimisticDispatch<I, O>(
  dispatcher: ActionDispatcher,
  opts: OptimisticDispatchOptions<I, O>,
): Promise<ActionResult> {
  const { capability, input, ctx, optimisticOutcome, onApply, onRollback } = opts;
  const isOptimistic = capability.reversible === true && capability.low_stakes === true;

  if (!isOptimistic) {
    // Transparent passthrough; optimistic callbacks are intentionally ignored.
    return dispatcher.dispatch(capability.id, input, ctx);
  }

  // Bind the synthesized outcome in a per-call closure so concurrent
  // dispatches don't clobber each other's rollback payload.
  const outcome = optimisticOutcome(input);
  // Apply BEFORE the dispatch — the user-visible mutation lands first; the
  // network round-trip happens in the background. Any throw from `onApply`
  // bubbles up to the caller (we don't try to "rollback" something that
  // never landed).
  onApply(outcome);
  // Best-effort audit; failures inside the sink never block the user path.
  void dispatcher._emitOptimisticApplied(ctx, capability);

  let result: ActionResult;
  try {
    result = await dispatcher.dispatch(capability.id, input, ctx);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    onRollback(outcome, error);
    void dispatcher._emitOptimisticRolledBack(ctx, capability, redactErrorMessage(error.message));
    return { ok: false, error: error.message };
  }

  if (!result.ok) {
    const error = new Error(result.error ?? 'dispatch failed');
    onRollback(outcome, error);
    void dispatcher._emitOptimisticRolledBack(ctx, capability, redactErrorMessage(error.message));
  }

  return result;
}

/**
 * Test-only export — the redactor used by `optimisticDispatch()` for
 * `action.optimistic_rolled_back` audit messages. Exposed so unit tests
 * can pin the exact redaction shapes without reaching into module privates.
 */
export const _redactErrorMessageForTest = redactErrorMessage;
