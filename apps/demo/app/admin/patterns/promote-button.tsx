// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';

/**
 * Client-side "Promote to recipe" button for the admin patterns route.
 *
 * Posts to `/api/admin/patterns/promote`, which scaffolds a stub at
 * `recipes/_proposed/<pattern_id>.json`. The stub still requires human
 * review; this button does not merge anything.
 */

import { useState } from 'react';

interface Props {
  pattern_id: string;
}

interface PromoteOk {
  ok: true;
  path: string;
  created: boolean;
}

interface PromoteErr {
  ok: false;
  error: string;
}

type PromoteResponse = PromoteOk | PromoteErr;

export function PromoteButton({ pattern_id }: Props): React.JSX.Element {
  const [state, setState] = useState<
    | { kind: 'idle' }
    | { kind: 'pending' }
    | { kind: 'done'; msg: string }
    | { kind: 'error'; msg: string }
  >({ kind: 'idle' });

  async function onClick(): Promise<void> {
    setState({ kind: 'pending' });
    try {
      const res = await fetch('/api/admin/patterns/promote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pattern_id }),
      });
      const body = (await res.json()) as PromoteResponse;
      if (body.ok) {
        setState({
          kind: 'done',
          msg: body.created
            ? `Stub written to ${body.path}`
            : `Stub already exists at ${body.path}`,
        });
      } else {
        setState({ kind: 'error', msg: body.error });
      }
    } catch (err) {
      setState({ kind: 'error', msg: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <div style={{ minWidth: 180, textAlign: 'right' }}>
      <button
        type="button"
        onClick={() => {
          void onClick();
        }}
        disabled={state.kind === 'pending'}
        style={{
          background: '#0f172a',
          color: '#fff',
          padding: '8px 12px',
          borderRadius: 6,
          fontSize: 14,
          cursor: state.kind === 'pending' ? 'wait' : 'pointer',
          border: 'none',
        }}
      >
        {state.kind === 'pending' ? 'Promoting…' : 'Promote to recipe'}
      </button>
      {state.kind === 'done' ? (
        <div style={{ color: '#16a34a', fontSize: 12, marginTop: 4 }}>{state.msg}</div>
      ) : null}
      {state.kind === 'error' ? (
        <div style={{ color: '#dc2626', fontSize: 12, marginTop: 4 }}>{state.msg}</div>
      ) : null}
    </div>
  );
}
