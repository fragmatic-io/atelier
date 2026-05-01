// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';

/**
 * `OctantHeader` — the persistent app chrome for `apps/demo-github`.
 *
 * One row, GitHub-density:
 *   - Wordmark on the left (octagon + "octant" lockup).
 *   - Primary nav inline (Today / Repos / Inbox / New issue / Settings).
 *   - Small rate-limit chip on the right — `5000/5000 · 60s reset` style,
 *     not a card-sized status block. Pulls from the cached
 *     `RateLimitState` updated by the GitHub client; falls back to a
 *     hardcoded baseline when no token is configured.
 *
 * Rendered through the manifest pipeline as the first child of the page
 * `<Stack>`. Pre-E-A the `/today` route stacked a full `<StatusBar>` AND
 * a card-sized `<StatCard>` for the same quota; the chip replaces both.
 */

import { useEffect, useState } from 'react';
import { getRateLimitState, type RateLimitState } from '../lib/github-client';
import { Wordmark } from './Wordmark';

interface NavItem {
  readonly label: string;
  readonly href: string;
}

const DEFAULT_NAV: readonly NavItem[] = [
  { label: 'Today', href: '/today' },
  { label: 'Repos', href: '/repos' },
  { label: 'Inbox', href: '/inbox' },
  { label: 'New issue', href: '/issue/new' },
  { label: 'Settings', href: '/settings/github' },
];

interface OctantHeaderProps {
  /** Override the nav. Mostly so the SSR chrome can omit unbuilt routes. */
  items?: readonly NavItem[];
  /** Currently-active path; gets a brand-coloured underline. */
  activePath?: string;
}

function chipColors(state: RateLimitState): { fg: string; bg: string; dot: string } {
  if (state.status === 'incident')
    return {
      fg: 'var(--cir-color-danger)',
      bg: 'color-mix(in srgb, var(--cir-color-danger) 12%, transparent)',
      dot: 'var(--cir-color-danger)',
    };
  if (state.status === 'degraded')
    return {
      fg: 'var(--cir-color-warning)',
      bg: 'color-mix(in srgb, var(--cir-color-warning) 12%, transparent)',
      dot: 'var(--cir-color-warning)',
    };
  return {
    fg: 'var(--cir-color-success)',
    bg: 'color-mix(in srgb, var(--cir-color-success) 10%, transparent)',
    dot: 'var(--cir-color-success)',
  };
}

function resetLabel(state: RateLimitState): string {
  if (state.reset_at <= 0) return '60s reset';
  const seconds = Math.max(0, state.reset_at - Math.floor(Date.now() / 1000));
  if (seconds < 60) return `${String(seconds)}s reset`;
  if (seconds < 3600) return `${String(Math.floor(seconds / 60))}m reset`;
  return `${String(Math.floor(seconds / 3600))}h reset`;
}

export function OctantHeader({
  items = DEFAULT_NAV,
  activePath,
}: OctantHeaderProps): React.JSX.Element {
  const [state, setState] = useState<RateLimitState>(getRateLimitState());
  useEffect(() => {
    const id = setInterval(() => {
      setState(getRateLimitState());
    }, 10_000);
    return () => clearInterval(id);
  }, []);

  const colors = chipColors(state);
  const remaining = state.remaining > 0 ? state.remaining : 5000;
  const limit = state.limit > 0 ? state.limit : 5000;

  return (
    <header
      data-cir-component="OctantHeader"
      className="flex items-center gap-4"
      style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--cir-color-border)',
        background: 'var(--cir-color-bg)',
        position: 'sticky',
        top: 0,
        zIndex: 40,
      }}
    >
      <a
        href="/today"
        className="flex items-center"
        style={{ color: 'var(--cir-color-fg)', textDecoration: 'none' }}
        aria-label="Octant home"
      >
        <Wordmark height={20} />
      </a>
      <nav className="flex items-center gap-1" style={{ marginLeft: 8 }} aria-label="Primary">
        {items.map((item) => {
          const active = activePath === item.href;
          return (
            <a
              key={item.href}
              href={item.href}
              className="cir-mono"
              style={{
                fontSize: '13px',
                padding: '6px 10px',
                borderRadius: 'var(--cir-radius-sm)',
                color: active ? 'var(--cir-color-fg)' : 'var(--cir-color-fg-muted)',
                textDecoration: 'none',
                fontWeight: active ? 600 : 400,
                background: active
                  ? 'color-mix(in srgb, var(--cir-color-brand) 8%, transparent)'
                  : 'transparent',
              }}
            >
              {item.label}
            </a>
          );
        })}
      </nav>
      <div className="flex-1" />
      <a
        href="/settings/github"
        data-cir-part="rate-limit-chip"
        title={`GitHub API quota — ${String(remaining)} of ${String(limit)} remaining`}
        className="cir-mono inline-flex items-center gap-2"
        style={{
          fontSize: '11px',
          padding: '4px 10px',
          borderRadius: '999px',
          background: colors.bg,
          color: colors.fg,
          border: '1px solid color-mix(in srgb, currentColor 20%, transparent)',
          textDecoration: 'none',
          letterSpacing: '0.02em',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: 'inline-block',
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: colors.dot,
          }}
        />
        {String(remaining)}/{String(limit)}
        <span style={{ opacity: 0.7 }}>·</span>
        <span style={{ opacity: 0.85 }}>{resetLabel(state)}</span>
      </a>
    </header>
  );
}
