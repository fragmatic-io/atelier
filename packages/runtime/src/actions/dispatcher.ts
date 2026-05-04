// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
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

import type { AuditEvent, Capability } from '@atelier/schemas';
import { z } from 'zod';
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
  /**
   * Present only when the dispatched capability declared `undoable: true`
   * and dispatch succeeded. Hosts pass this token to
   * `dispatcher.undoFromToken(token)` within `expires_at` to reverse the
   * action. After the window closes the token is invalidated and any call
   * with it throws `UndoExpiredError`.
   */
  undo_token?: string;
  /** ISO 8601 timestamp at which `undo_token` expires. */
  undo_expires_at?: string;
  /** Capability-declared (or default-5000) window in milliseconds. */
  undo_window_ms?: number;
}

/**
 * Outcome of a successful `undoFromToken()` call. Mirrors `ActionResult` for
 * the rolled-back dispatch but adds the original event id for correlation.
 */
export interface UndoResult extends ActionResult {
  /** The undo token that was redeemed. */
  undo_token: string;
  /** Audit id of the original (now-undone) `action.executed` event. */
  original_event_id: string;
}

/**
 * Default window (in milliseconds) when an undoable capability omits
 * `undo_window_ms`. Mirrors Linear's 5-second toast window — long enough for
 * a reasonable undo, short enough that the action effectively commits.
 */
export const DEFAULT_UNDO_WINDOW_MS = 5000;

/**
 * Thrown when a `dispatch()` call's `input` does not match the capability's
 * declared input shape. Distinct from a denial (`ok: false`, recorded in
 * audit) because validation is a contract failure between the caller and
 * the dispatcher — the host should fix its call site rather than retry.
 */
export class DispatchInputError extends Error {
  readonly capability_id: string;
  readonly issues: readonly string[];
  constructor(capability_id: string, issues: readonly string[]) {
    super(
      `Dispatch input failed validation for ${capability_id}${
        issues.length ? `: ${issues.join('; ')}` : ''
      }`,
    );
    this.name = 'DispatchInputError';
    this.capability_id = capability_id;
    this.issues = issues;
  }
}

/**
 * Synthesize a Zod schema from the descriptor record on `Capability.input`.
 *
 * Capabilities declare inputs as a flat `{ field: '<type-name>' }` record
 * (see `docs/artifacts.md` §Capability and `@atelier/schemas` Capability).
 * The runtime previously trusted the host to honor that contract; we now
 * enforce it on dispatch.
 *
 * Recognized type-name strings produce strict checks; anything else collapses
 * to `z.unknown()` so the gate is additive — capabilities using shapes the
 * synthesizer cannot reason about (nested objects, custom JSON Schema) still
 * dispatch, and only the recognized primitive declarations gain the check.
 *
 * Empty input descriptors permit anything (matches existing dispatch tests
 * for `task.complete: input: {}`).
 */
function buildDispatchInputSchema(input: Capability['input']): z.ZodTypeAny {
  const keys = Object.keys(input);
  if (keys.length === 0) return z.unknown();
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const k of keys) {
    const decl = input[k];
    shape[k] = leafSchemaFor(decl);
  }
  return z.object(shape);
}

function leafSchemaFor(decl: unknown): z.ZodTypeAny {
  if (typeof decl !== 'string') return z.unknown();
  switch (decl) {
    case 'string':
      return z.string();
    case 'number':
      return z.number();
    case 'integer':
      return z.number().int();
    case 'boolean':
      return z.boolean();
    case 'string[]':
    case 'string_array':
      return z.array(z.string());
    case 'number[]':
    case 'number_array':
      return z.array(z.number());
    case 'datetime':
      // ISO 8601 with offset — matches the rest of the schema package's
      // datetime conventions.
      return z.string().datetime({ offset: true });
    default:
      return z.unknown();
  }
}

/**
 * Thrown by `undoFromToken()` when the token is unknown or its window has
 * already expired. Hosts catch this to render a "Undo expired" or "already
 * undone" affordance.
 */
export class UndoExpiredError extends Error {
  constructor(
    public readonly undo_token: string,
    message = `undo window expired (token=${undo_token})`,
  ) {
    super(message);
    this.name = 'UndoExpiredError';
  }
}

/**
 * Test-only injection seam for the expiry timer. Mirrors the shape of
 * `setTimeout` / `clearTimeout` so callers can swap a fake scheduler in
 * tests without globally replacing timers. Defaults to global `setTimeout`.
 */
export interface UndoTimer {
  setTimeout: (handler: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

const DEFAULT_TIMER: UndoTimer = {
  setTimeout: (handler, ms) => globalThis.setTimeout(handler, ms),
  clearTimeout: (handle) => {
    globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>);
  },
};

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
  /** Override `Date.now()` (epoch ms) for undo-window math. Default `Date.now`. */
  nowMs?: () => number;
  /** Override the expiry timer (`setTimeout` / `clearTimeout`). */
  timer?: UndoTimer;
  /** Override the undo-token generator. Default: `crypto.randomUUID()`. */
  generateUndoToken?: () => string;
}

/**
 * Internal record for an open undo window. Holds the bookkeeping needed by
 * `undoFromToken()` and the expiry-fired audit emission.
 */
interface OpenUndoToken {
  capability_id: string;
  expires_at: string;
  expires_at_ms: number;
  original_event_id: string;
  entry: UndoEntry;
  timerHandle: unknown;
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

function defaultUndoTokenGenerator(): string {
  // `crypto.randomUUID()` is available on Node 19+ and all modern browsers.
  // Falls back to a manually-shaped v4 hex string only if the platform is
  // missing it (very unlikely in supported runtimes — kept for defensive
  // posture against test environments that strip globalThis.crypto).
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  // Fallback: 16 bytes of Math.random hex — NOT cryptographically secure, but
  // collision-free enough for in-process token bookkeeping. Real deployments
  // never hit this path.
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join(
    '',
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export class ActionDispatcher {
  readonly #capabilities: Record<string, Capability>;
  readonly #registry: ActionRegistry;
  readonly #confirm: ConfirmationCallback;
  readonly #audit: AuditSink;
  readonly #undoStack: UndoStack;
  readonly #clock: Clock;
  readonly #nowMs: () => number;
  readonly #timer: UndoTimer;
  readonly #generateUndoToken: () => string;
  readonly #openTokens = new Map<string, OpenUndoToken>();
  /** Per-capability synthesized input schema, lazily built and memoized. */
  readonly #inputSchemas = new Map<string, z.ZodTypeAny>();

  constructor(opts: ActionDispatcherOptions) {
    this.#capabilities = opts.capabilities;
    this.#registry = opts.registry;
    this.#confirm = opts.confirm;
    this.#audit = opts.audit ?? NoopAuditSink;
    this.#undoStack = new UndoStack(opts.undoStackSize ?? 50);
    this.#clock = opts.clock ?? isoNow;
    this.#nowMs = opts.nowMs ?? (() => Date.now());
    this.#timer = opts.timer ?? DEFAULT_TIMER;
    this.#generateUndoToken = opts.generateUndoToken ?? defaultUndoTokenGenerator;
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

    // Contract check: the capability declares its input shape; reject calls
    // whose payload does not match before we touch the handler. Throws
    // `DispatchInputError` so the host fixes the call site (this is not a
    // user-recoverable denial like a declined confirmation).
    this.#validateDispatchInput(capability, input);

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

    let undoEntry: UndoEntry | undefined;
    if (capability.reversible && capability.rollback) {
      undoEntry = {
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
      this.#undoStack.push(undoEntry);
    }

    const audit_id = await this.#emitExecuted(ctx, capability, result);

    // Open an undo window if the capability declares `undoable: true` AND
    // it is reversible with a rollback target. The two flags pair: the
    // toast affordance (`undoable`) is the user-visible promise; the undo
    // entry is the mechanism that fulfils it.
    if (capability.undoable === true && undoEntry) {
      const windowMs = capability.undo_window_ms ?? DEFAULT_UNDO_WINDOW_MS;
      const token = this.#generateUndoToken();
      const expiresAtMs = this.#nowMs() + windowMs;
      const expiresAt = new Date(expiresAtMs).toISOString();
      const timerHandle = this.#timer.setTimeout(() => {
        this.#expireToken(token);
      }, windowMs);
      this.#openTokens.set(token, {
        capability_id: capability.id,
        expires_at: expiresAt,
        expires_at_ms: expiresAtMs,
        original_event_id: audit_id,
        entry: undoEntry,
        timerHandle,
      });
      await this.#emitUndoableWindowOpen(ctx, capability, token, expiresAt);
      return {
        ok: true,
        result,
        audit_id,
        side_effects: [...capability.side_effects],
        undo_token: token,
        undo_expires_at: expiresAt,
        undo_window_ms: windowMs,
      };
    }

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

  /**
   * Reverse a dispatch identified by the undo token returned from
   * `dispatch()`. Throws `UndoExpiredError` if the token is unknown or its
   * window has already closed. Returns an `UndoResult` mirroring the
   * rollback dispatch with the original event id for correlation.
   *
   * The expiry timer is cancelled here so we do not race with
   * `action.undo_window_expired`. Concurrent `undoFromToken()` calls for
   * the same token are guarded by an immediate delete: the second caller
   * sees a missing token and throws.
   */
  async undoFromToken(undo_token: string): Promise<UndoResult> {
    const open = this.#openTokens.get(undo_token);
    if (!open) {
      throw new UndoExpiredError(undo_token);
    }
    // Atomic check-and-take. If a second caller raced us, they'll see the
    // missing token after this point.
    this.#openTokens.delete(undo_token);
    this.#timer.clearTimeout(open.timerHandle);
    // Optional: also pop the entry off the undo stack if it's the top of
    // stack. We don't strictly need this — calling `undo()` after a
    // successful `undoFromToken()` would just reach into the stack — but
    // it keeps `canUndo()` honest. Use a snapshot scan to find the entry.
    this.#removeFromUndoStack(open.entry);

    const result = await this.#dispatchWithoutUndoTracking(
      open.entry.rollback_capability_id,
      open.entry.rollback_input,
      open.entry.ctx,
    );
    await this.#emitUndone(open.entry.ctx, open.capability_id, undo_token, open.original_event_id);
    return {
      ...result,
      undo_token,
      original_event_id: open.original_event_id,
    };
  }

  /**
   * Test-only — number of open (non-expired, non-redeemed) undo tokens.
   * Used by tests to verify expiry / redemption clean up state.
   */
  openUndoTokenCount(): number {
    return this.#openTokens.size;
  }

  /**
   * Test-only — inspect the metadata for an open token without redeeming it.
   * Returns `undefined` if the token is unknown or has already been
   * redeemed / expired.
   */
  peekUndoToken(
    undo_token: string,
  ): { capability_id: string; expires_at: string; original_event_id: string } | undefined {
    const open = this.#openTokens.get(undo_token);
    if (!open) return undefined;
    return {
      capability_id: open.capability_id,
      expires_at: open.expires_at,
      original_event_id: open.original_event_id,
    };
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
    // Same contract check as the public dispatch path so undo / rollback
    // calls cannot smuggle malformed input around the gate.
    this.#validateDispatchInput(capability, input);
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

  /**
   * Parse `input` against the capability's declared input shape. Throws
   * `DispatchInputError` on failure. Schemas are synthesized lazily and
   * cached per capability id.
   */
  #validateDispatchInput(capability: Capability, input: unknown): void {
    let schema = this.#inputSchemas.get(capability.id);
    if (!schema) {
      schema = buildDispatchInputSchema(capability.input);
      this.#inputSchemas.set(capability.id, schema);
    }
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      const issues = parsed.error.issues.map(
        (i) => `${i.path.join('.') || '<root>'}: ${i.message}`,
      );
      throw new DispatchInputError(capability.id, issues);
    }
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
   * Emit `action.undoable_window_open` and remember bookkeeping for
   * `undoFromToken()`. Trigger chain carries the capability id and the
   * undo token (so dashboards can pair this event with the eventual
   * `action.undone` / `action.undo_window_expired`). The action input is
   * NEVER included in the audit payload.
   */
  async #emitUndoableWindowOpen(
    ctx: ActionExecutionContext,
    capability: Capability,
    undo_token: string,
    expires_at: string,
  ): Promise<string> {
    const event_id = nextAuditId();
    const event: AuditEvent = {
      event_id,
      timestamp: this.#clock(),
      user_id: ctx.user_id || 'unknown',
      app_id: ctx.app_id || 'unknown',
      type: 'action.undoable_window_open',
      actor: 'user',
      before_state_hash: '',
      after_state_hash: '',
      trigger_chain: [
        `action:${capability.id}`,
        `undo_token:${undo_token}`,
        `expires_at:${expires_at}`,
      ],
      token_cost: 0,
      policy_evaluations: [],
      ...(ctx.manifest_id ? { manifest_id: ctx.manifest_id } : {}),
    };
    await this.#emit(event);
    return event_id;
  }

  /**
   * Emit `action.undone` after a successful `undoFromToken()` redemption.
   * The trigger chain links to the original event so an audit reader can
   * stitch the apply / undo pair without mining payload fields.
   */
  async #emitUndone(
    ctx: ActionExecutionContext,
    capability_id: string,
    undo_token: string,
    original_event_id: string,
  ): Promise<string> {
    const event_id = nextAuditId();
    const event: AuditEvent = {
      event_id,
      timestamp: this.#clock(),
      user_id: ctx.user_id || 'unknown',
      app_id: ctx.app_id || 'unknown',
      type: 'action.undone',
      actor: 'user',
      before_state_hash: '',
      after_state_hash: '',
      trigger_chain: [
        `action:${capability_id}`,
        `undo_token:${undo_token}`,
        `original_event_id:${original_event_id}`,
      ],
      token_cost: 0,
      policy_evaluations: [],
      ...(ctx.manifest_id ? { manifest_id: ctx.manifest_id } : {}),
    };
    await this.#emit(event);
    return event_id;
  }

  /**
   * Emit `action.undo_window_expired` when the timer fires without an
   * `undoFromToken()` call. Cleans the token out of the open-tokens map.
   */
  async #emitUndoExpired(
    ctx: ActionExecutionContext,
    capability_id: string,
    undo_token: string,
  ): Promise<string> {
    const event_id = nextAuditId();
    const event: AuditEvent = {
      event_id,
      timestamp: this.#clock(),
      user_id: ctx.user_id || 'unknown',
      app_id: ctx.app_id || 'unknown',
      type: 'action.undo_window_expired',
      actor: 'system',
      before_state_hash: '',
      after_state_hash: '',
      trigger_chain: [`action:${capability_id}`, `undo_token:${undo_token}`],
      token_cost: 0,
      policy_evaluations: [],
      ...(ctx.manifest_id ? { manifest_id: ctx.manifest_id } : {}),
    };
    await this.#emit(event);
    return event_id;
  }

  /**
   * Timer callback: invalidate the token, emit the expiry audit event.
   * Idempotent — safe if the token was already redeemed (but in practice
   * `undoFromToken()` cancels the timer first to avoid the race).
   */
  #expireToken(undo_token: string): void {
    const open = this.#openTokens.get(undo_token);
    if (!open) return;
    this.#openTokens.delete(undo_token);
    void this.#emitUndoExpired(open.entry.ctx, open.capability_id, undo_token);
  }

  /**
   * Best-effort: drop the matching entry from the bounded undo stack so
   * that `canUndo()` reflects the post-undo reality. We can't index by
   * reference inside `UndoStack`, so we rebuild from a snapshot. Ok at
   * the bounded sizes we use (default 50).
   */
  #removeFromUndoStack(target: UndoEntry): void {
    const all = this.#undoStack.snapshot();
    if (!all.includes(target)) return;
    this.#undoStack.clear();
    for (const e of all) {
      if (e !== target) this.#undoStack.push(e);
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
