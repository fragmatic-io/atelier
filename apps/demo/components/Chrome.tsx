// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';

/**
 * Chrome — the demo's persistent shell mounted by `app/layout.tsx`.
 *
 * Renders three things alongside whatever the route children render:
 *   1. A `<StatusBar>` pill (system health, hardcoded "operational" for the
 *      demo; production hosts subscribe to a `system.status` capability).
 *   2. A "color mode" toggle that flips
 *      `intent.global_preferences.color_mode` between `light`, `dark`, and
 *      `system`. The toggle persists via `saveIntentProfileAsync` (or its
 *      local-fallback shim when the vault is unreachable) so the choice
 *      survives a refresh and is mirrored to the user's profile.
 *   3. A nav link row pointing at Today / Settings / Audit (admin only).
 *
 * The chrome reads the current profile on mount and listens for storage
 * events so the toggle reflects edits made elsewhere (e.g. by
 * `/onboarding/review` or `/settings/intent`). When no profile is loaded
 * (first-run user), the toggle is hidden — there's no profile slot to write
 * to yet.
 *
 * In dev (`process.env.NODE_ENV !== 'production'`) the chrome also mounts
 * a developer entry: a "Live audit" link, which is hidden in production
 * builds. This pattern matches `<DebugPanel>` mounting in
 * `cir-providers.tsx`: dev tooling stays out of the prod bundle.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { StatusBar } from '@cir/components';
import {
  buildDemoProfile,
  grantedScopesFromProfile,
  loadIntentProfile,
  saveIntentProfile,
  saveIntentProfileAsync,
} from '../lib/intent-store';
import type { IntentProfile } from '@cir/schemas';
import { Wordmark } from './Wordmark';

type ColorMode = 'light' | 'dark' | 'system';

/** Resolve the next color mode given the current value (cycles l -> d -> s). */
export function nextColorMode(current: ColorMode): ColorMode {
  if (current === 'light') return 'dark';
  if (current === 'dark') return 'system';
  return 'light';
}

const MODE_LABELS: Readonly<Record<ColorMode, string>> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
};

const MODE_GLYPH: Readonly<Record<ColorMode, string>> = {
  light: '☀',
  dark: '☾',
  system: '◐',
};

/**
 * Apply the color mode to `<html>` so `prefers-color-scheme` aware styles
 * react. The class names match Tailwind 4's documented
 * `dark:` variant when the `class` strategy is enabled. We additionally
 * set `data-color-mode` so non-Tailwind hosts can target the same selector.
 */
export function applyColorMode(mode: ColorMode): void {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  html.dataset['colorMode'] = mode;
  if (mode === 'dark') {
    html.classList.add('dark');
  } else if (mode === 'light') {
    html.classList.remove('dark');
  } else {
    // system — defer to the media query.
    const prefersDark =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (prefersDark) html.classList.add('dark');
    else html.classList.remove('dark');
  }
}

/** Read the color mode preference from the current profile, defaulting to `system`. */
export function readColorMode(profile: IntentProfile | null): ColorMode {
  if (!profile) return 'system';
  const raw = profile.global_preferences['color_mode'];
  if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  return 'system';
}

interface ChromeProps {
  /**
   * Override the dev-mode flag for tests. Production reads from
   * `process.env.NODE_ENV` directly.
   */
  devMode?: boolean;
}

export function Chrome({ devMode }: ChromeProps): React.JSX.Element {
  const isDev = devMode ?? process.env.NODE_ENV !== 'production';
  const [profile, setProfile] = useState<IntentProfile | null>(null);
  const [mode, setMode] = useState<ColorMode>('system');

  // Hydrate from localStorage on mount. Re-read on `storage` events so
  // edits in another tab (or the review screen) propagate live.
  useEffect(() => {
    const refresh = (): void => {
      const next = loadIntentProfile();
      setProfile(next);
      const m = readColorMode(next);
      setMode(m);
      applyColorMode(m);
    };
    refresh();
    if (typeof window === 'undefined') return;
    window.addEventListener('storage', refresh);
    return (): void => {
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const cycleMode = useCallback(() => {
    setMode((current) => {
      const nm = nextColorMode(current);
      applyColorMode(nm);
      // Persist into the loaded profile (or build one from scratch if the
      // user is in onboarding-but-not-yet-saved). When the vault is
      // unreachable, `saveIntentProfileAsync` mirrors to localStorage and
      // logs a warning — exactly the fallback contract we want here.
      const current_profile = loadIntentProfile();
      const base =
        current_profile ?? buildDemoProfile(['lens.today', 'lens.thread', 'vocabulary.read']);
      const next: IntentProfile = {
        ...base,
        global_preferences: { ...base.global_preferences, color_mode: nm },
        updated_at: new Date().toISOString(),
      };
      // Mirror synchronously so the storage event fires for any other tabs
      // and the next refresh sees the change immediately.
      saveIntentProfile(next);
      // Best-effort vault sync; don't block the UI on it.
      void saveIntentProfileAsync(next).catch(() => {
        /* already mirrored to localStorage above; vault retry is acceptable */
      });
      setProfile(next);
      return nm;
    });
  }, []);

  const granted = profile === null ? [] : grantedScopesFromProfile(profile);
  const showSettings = granted.length > 0;

  return (
    <header
      data-cir-part="chrome"
      className="bg-surface border-b border-border px-4 py-2"
      style={{
        background: 'var(--cir-color-surface)',
        borderBottom: '1px solid var(--cir-color-border)',
        color: 'var(--cir-color-fg)',
      }}
    >
      <div className="max-w-screen-md mx-auto flex items-center justify-between gap-3">
        <Link
          href="/today"
          aria-label="CIR — back to Today"
          className="inline-flex items-center"
          style={{ color: 'var(--cir-color-fg)' }}
        >
          <Wordmark size={20} />
        </Link>
        <div className="flex items-center gap-3">
          <StatusBar status="operational" message="All systems operational" variant="compact" />
          {showSettings ? (
            <Link
              href="/settings/intent"
              className="text-xs"
              style={{ color: 'var(--cir-color-fg-muted)' }}
            >
              Settings
            </Link>
          ) : null}
          {isDev ? (
            <Link
              href="/admin/audit"
              data-testid="chrome-audit-link"
              className="text-xs"
              style={{ color: 'var(--cir-color-fg-muted)' }}
            >
              Audit
            </Link>
          ) : null}
          {profile ? (
            <button
              type="button"
              onClick={cycleMode}
              data-testid="chrome-color-mode-toggle"
              data-color-mode={mode}
              aria-label={`Color mode: ${MODE_LABELS[mode]}. Click to cycle.`}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs"
              style={{
                border: '1px solid var(--cir-color-border)',
                borderRadius: 'var(--cir-radius-sm)',
                color: 'var(--cir-color-fg)',
                background: 'transparent',
              }}
            >
              <span aria-hidden="true">{MODE_GLYPH[mode]}</span>
              <span>{MODE_LABELS[mode]}</span>
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
