// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors

'use client';
/**
 * `<CirErrorBoundary>` — standard React error boundary for the render walker.
 *
 * Catches errors thrown during render of children (e.g. a buggy bound
 * component) and renders the provided fallback. Resets when `resetKey`
 * changes — the route uses this to clear the boundary on path change.
 *
 * On error, emits an `audit` event of type `manifest.served` with a
 * trigger_chain entry recording the error, when an audit sink is wired
 * via the runtime services. Doing so via `manifest.served` is a deliberate
 * choice: the schema's `AuditEventType` (see `@cir/schemas/audit.ts`) does
 * not include a generic `runtime.error` type today, but the boundary still
 * needs to record the failure of "we tried to render this manifest". A
 * future schema addition can specialize this.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import type { AuditEvent } from '@cir/schemas';
import type { AuditSink } from '@cir/runtime';

export interface CirErrorBoundaryProps {
  fallback: (error: Error) => ReactNode;
  /** When this changes, reset the boundary's error state. */
  resetKey?: unknown;
  /** Audit sink to notify on error. Optional. */
  audit?: AuditSink | undefined;
  /** Identity stamped onto the audit event. */
  user_id?: string | undefined;
  app_id?: string | undefined;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

let auditSeq = 0;
function nextAuditId(): `evt_${string}` {
  auditSeq += 1;
  const rand = Math.random().toString(36).slice(2, 10);
  return `evt_${Date.now().toString(36)}${auditSeq.toString(36)}${rand}`;
}

export class CirErrorBoundary extends Component<CirErrorBoundaryProps, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  static getDerivedStateFromProps(props: CirErrorBoundaryProps, state: State): State | null {
    // Reset error when resetKey changes. We track the previous resetKey on
    // the instance (stored as a static-shaped marker on state via __resetKey).
    const marker = (state as State & { __resetKey?: unknown }).__resetKey;
    if (marker !== props.resetKey) {
      return { error: null, ...({ __resetKey: props.resetKey } as Partial<State>) };
    }
    return null;
  }

  override componentDidCatch(error: Error, _info: ErrorInfo): void {
    const sink = this.props.audit;
    if (!sink) return;
    const event: AuditEvent = {
      event_id: nextAuditId(),
      timestamp: new Date().toISOString(),
      user_id: this.props.user_id ?? 'unknown',
      app_id: this.props.app_id ?? 'unknown',
      type: 'manifest.served',
      actor: 'system',
      before_state_hash: '',
      after_state_hash: '',
      trigger_chain: [`render_error:${error.message}`],
      token_cost: 0,
      policy_evaluations: [],
    };
    try {
      void Promise.resolve(sink.emit(event)).catch(() => {
        // best-effort: swallow async sink failures
      });
    } catch {
      // best-effort: swallow sync sink failures too
    }
  }

  override render(): ReactNode {
    if (this.state.error) {
      return this.props.fallback(this.state.error);
    }
    return this.props.children;
  }
}
