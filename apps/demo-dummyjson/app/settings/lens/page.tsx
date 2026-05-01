// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';

/**
 * /settings/lens — the headline lens-switcher. The user picks compact /
 * cozy / spacious; we write `intent.global_preferences.density` through
 * the vault (with localStorage fallback) and bounce to /browse so the
 * next manifest compile picks up the new variant.
 *
 * "cozy" is the user-facing label for the schema's `comfortable` density.
 * The mapping is kept here so the rest of the codebase uses the canonical
 * enum value.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LENS_DENSITIES, loadLens, setLensAsync, type LensDensity } from '@/lib/intent-store';

interface LensOption {
  id: LensDensity;
  label: string;
  description: string;
}

const OPTIONS: readonly LensOption[] = [
  {
    id: 'compact',
    label: 'Compact',
    description:
      'Single-column dense list. For power users who want to scan as many SKUs per scroll as possible.',
  },
  {
    id: 'comfortable',
    label: 'Cozy',
    description:
      'Three-column grid with comfortable spacing. The default for browsers who want a balanced view.',
  },
  {
    id: 'spacious',
    label: 'Spacious',
    description:
      'Two-column grid with bigger thumbnails and breathing room. For thinking through one product at a time.',
  },
];

export default function LensSettingsPage(): React.JSX.Element {
  const router = useRouter();
  const [active, setActive] = useState<LensDensity>('comfortable');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setActive(loadLens());
  }, []);

  const choose = useCallback(
    async (density: LensDensity): Promise<void> => {
      if (busy || density === active) return;
      setBusy(true);
      setErr(null);
      try {
        await setLensAsync(density);
        setActive(density);
        // Tiny delay so the user sees the active highlight settle before
        // we bounce — purely cosmetic, not load-bearing.
        setTimeout(() => router.push('/browse'), 200);
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [active, busy, router],
  );

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>Choose your lens</h1>
      <p style={{ color: '#78716c', marginBottom: 20, fontSize: 14 }}>
        The same /browse route renders three different layouts depending on the lens you pick. The
        choice is written to your intent profile (vault-first, localStorage fallback) and bounces
        you back to the catalog.
      </p>

      {LENS_DENSITIES.map((density) => {
        const opt = OPTIONS.find((o) => o.id === density);
        if (!opt) return null;
        const isActive = active === density;
        return (
          <button
            key={density}
            type="button"
            disabled={busy}
            onClick={() => {
              void choose(density);
            }}
            data-cir-part="lens-option"
            data-active={isActive ? 'true' : 'false'}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              border: isActive ? '2px solid #7c3aed' : '1px solid #e7e5e4',
              borderRadius: 12,
              padding: 16,
              marginBottom: 12,
              background: isActive ? '#f5f3ff' : '#ffffff',
              cursor: busy ? 'wait' : 'pointer',
              fontSize: 14,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              {opt.label}
              {isActive ? ' · active' : ''}
            </div>
            <div style={{ color: '#78716c' }}>{opt.description}</div>
          </button>
        );
      })}

      {err !== null ? (
        <p style={{ color: '#dc2626', fontSize: 13, marginTop: 8 }}>Could not save lens: {err}</p>
      ) : null}
    </main>
  );
}
