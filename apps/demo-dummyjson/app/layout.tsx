// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { CirProviders } from '@/lib/cir-providers';
import { DUMMYJSON_BRAND_KIT } from '@/lib/brand-kit';
import { LensSwitcher } from '@/components/LensSwitcher';

export const metadata: Metadata = {
  title: 'DummyJSON Shop — CIR demo',
  description:
    'Lens-switching e-commerce showcase, dressed in the Marigold theme. Browse a real product catalog; switch viewing density without losing scroll.',
};

/**
 * Root layout — Marigold theme.
 *
 * Marigold is light-mode-primary: the `<html>` tag opens with
 * `data-color-mode="light"` so server-rendered chrome reads the cream
 * surface even before the providers boot. The lens settings page
 * mirrors the user's choice onto the same attribute (see
 * `cir-providers.tsx` — `useEffect(... document.documentElement
 * .setAttribute('data-color-mode', mode))`), so toggling is one
 * attribute write, no flash.
 *
 * The brand kit is mounted as a JSON `<script type="application/json">`
 * tag for any debug overlay (the runtime `<DebugPanel>` reads it via the
 * `useDebugBrandKit` hook); the same value is also threaded through the
 * services bag in `lib/cir-server.ts`.
 */
export default function RootLayout({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <html lang="en" data-color-mode="light">
      <body>
        {/*
         * Chrome (wordmark + nav + tagline) used to live here as a static
         * HTML <header>. Post-E-B, the manifest renders chrome as part of
         * the page tree (NavBar with brand="Marigold" + RateLimitChip), so
         * the static block here was duplicating the menu. Removed; the
         * manifest now owns chrome end-to-end.
         */}
        <script
          id="cir-brand-kit"
          type="application/json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              id: DUMMYJSON_BRAND_KIT.id,
              version: DUMMYJSON_BRAND_KIT.version,
            }),
          }}
        />
        <CirProviders>{children}</CirProviders>
        {/*
         * Phase 1.5 polish — `<LensSwitcher>` floats over every route. A
         * click writes the new density through `setLensAsync` and reloads
         * the page so `<CirRoute>` re-fetches the manifest with the new
         * `x-cir-density` header → guaranteed cache miss → fresh compile.
         * The `<CompileBadge>` mounted by `CirProviders` ticks model +
         * tokens + duration in front of the user. Visible compilation,
         * intent reshape, in one demo. See `docs/ethos.md` #3 + #5.
         */}
        <LensSwitcher />
      </body>
    </html>
  );
}
