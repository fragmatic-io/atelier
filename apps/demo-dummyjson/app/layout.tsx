// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Wordmark } from '@/components/Wordmark';
import { CirProviders } from '@/lib/cir-providers';
import { DUMMYJSON_BRAND_KIT } from '@/lib/brand-kit';

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
        <header className="cir-chrome">
          <div className="cir-chrome-inner">
            <Link
              href="/browse"
              aria-label="DummyJSON Shop home"
              style={{ display: 'inline-flex' }}
            >
              <Wordmark size={26} />
            </Link>
            <nav className="cir-nav" aria-label="Primary">
              <Link href="/browse">Browse</Link>
              <Link href="/cart">Cart</Link>
              <Link href="/checkout">Checkout</Link>
              <Link href="/settings/lens">Lens</Link>
            </nav>
            <span className="cir-tagline">Marigold · lens-switching showcase</span>
          </div>
        </header>
        {/*
         * Brand-kit JSON is co-located with the layout so any embedded
         * inspector can read it without round-tripping a fetch. Inert by
         * default — `type="application/json"` prevents script execution.
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
      </body>
    </html>
  );
}
