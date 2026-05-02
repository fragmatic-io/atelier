// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';

/**
 * `<LensSwitcher>` — the headline intent-reshape demonstrator.
 *
 * A small floating pill bar (bottom-center) showing the three lens
 * densities. Clicking one writes the new density through the vault (via
 * `setLensAsync`) and bounces the page so `<CirRoute>` re-fetches the
 * manifest with the new `x-cir-density` header — the manifest cache key
 * includes density, so this is a guaranteed cache miss → fresh compile.
 *
 * The intent of the demo: the user sees the catalog reshape (compact
 * single-column list → comfortable 3-col grid → spacious 2-col bigger
 * thumbnails) AND the `<CompileBadge>` ticks `compiled · gemini-2.5-pro
 * · 8.4k tok · 1.8s` in front of them. That sequence is the framework's
 * dynamic-UI thesis made observable. See `docs/ethos.md` principles 3
 * (intent reshapes, not just decorates) and 5 (visible compilation).
 *
 * Lives next to the chrome rather than inside `MarigoldHeader` so it
 * survives header edits without coupling — and so the user always sees
 * it even on routes with custom chrome.
 */

import { useEffect, useState, useTransition } from 'react';
import { LENS_DENSITIES, loadLens, setLensAsync, type LensDensity } from '@/lib/intent-store';

interface LensOption {
  readonly id: LensDensity;
  readonly label: string;
  readonly hint: string;
}

const OPTIONS: readonly LensOption[] = [
  {
    id: 'compact',
    label: 'Compact',
    hint: 'Single-column dense list — scan many SKUs per scroll.',
  },
  {
    id: 'comfortable',
    label: 'Cozy',
    hint: 'Three-column card grid — the default balanced view.',
  },
  {
    id: 'spacious',
    label: 'Spacious',
    hint: 'Two-column oversized grid — focus on one product at a time.',
  },
];

void LENS_DENSITIES; // keep the import in scope for downstream inference.

export function LensSwitcher(): React.JSX.Element {
  const [active, setActive] = useState<LensDensity>('comfortable');
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<LensDensity | null>(null);

  useEffect(() => {
    setActive(loadLens());
  }, []);

  const choose = (density: LensDensity): void => {
    if (pending || density === active) return;
    setBusyId(density);
    start(async () => {
      try {
        await setLensAsync(density);
        // Force a fresh manifest fetch with the new `x-cir-density`
        // header. `<CirRoute>`'s manifest cache keys include density,
        // so this is a guaranteed cache miss → fresh compile. The
        // `<CompileBadge>` ticks accordingly. Less elegant than a
        // trigger-bus emit but visibly demonstrates the recompile.
        window.location.reload();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[LensSwitcher] setLensAsync failed:', err);
        setBusyId(null);
      }
    });
  };

  return (
    <div
      data-cir-component="LensSwitcher"
      style={{
        position: 'fixed',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 60,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: 4,
        borderRadius: 999,
        background: 'var(--cir-color-surface, #fffaf3)',
        border: '1px solid var(--cir-color-border, rgba(0,0,0,0.08))',
        boxShadow: '0 8px 24px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.06)',
        fontFamily: 'var(--cir-font-sans, system-ui)',
      }}
      role="group"
      aria-label="Switch lens density (triggers a fresh manifest compile)"
    >
      <span
        style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--cir-color-fg-muted, rgba(0,0,0,0.55))',
          padding: '0 10px 0 12px',
        }}
      >
        Lens
      </span>
      {OPTIONS.map((opt) => {
        const isActive = opt.id === active;
        const isBusy = busyId === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => {
              choose(opt.id);
            }}
            disabled={pending}
            title={`${opt.hint} ${isActive ? '(current)' : '(click to recompile)'}`}
            style={{
              fontSize: 13,
              fontWeight: isActive ? 600 : 500,
              padding: '6px 14px',
              borderRadius: 999,
              border: 'none',
              cursor: pending ? 'wait' : 'pointer',
              background: isActive
                ? 'var(--cir-color-primary, #ff5f3a)'
                : isBusy
                  ? 'color-mix(in srgb, var(--cir-color-primary, #ff5f3a) 30%, transparent)'
                  : 'transparent',
              color: isActive ? 'white' : 'var(--cir-color-fg, rgba(0,0,0,0.85))',
              transition: 'background 120ms ease, color 120ms ease',
              opacity: pending && !isBusy ? 0.5 : 1,
            }}
          >
            {isBusy ? `${opt.label}…` : opt.label}
          </button>
        );
      })}
    </div>
  );
}

LensSwitcher.displayName = 'LensSwitcher';
