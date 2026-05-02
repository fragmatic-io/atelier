// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { CirProviders } from '@/lib/atelier-providers';
import { DEMO_GITHUB_BRAND_KIT } from '@/lib/brand-kit';

export const metadata: Metadata = {
  title: 'Octant — Atelier demo',
  description:
    'Real-mutations issue triage showcase: optimistic archive, verbal-required bulk close, hover-card mention previews against the GitHub REST API.',
};

/**
 * Inline color-mode bootstrap. Reads the OS `prefers-color-scheme` and
 * any persisted intent override (`localStorage['cir-color-mode']`),
 * then sets `data-color-mode` on `<html>` before first paint so the
 * CSS-variable layer in `globals.css` resolves to the right palette.
 *
 * The intent runtime takes over after hydration — this script just
 * prevents a flash on cold load. We deliberately avoid calling
 * `window` outside `try` because of the standard "render-on-server"
 * gotcha.
 */
const COLOR_MODE_BOOTSTRAP = `
(function () {
  try {
    var stored = window.localStorage.getItem('cir-color-mode');
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var mode = stored === 'light' || stored === 'dark'
      ? stored
      : (prefersDark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-color-mode', mode);
  } catch (_) {
    document.documentElement.setAttribute('data-color-mode', 'light');
  }
})();
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-brand-kit={DEMO_GITHUB_BRAND_KIT.id} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: COLOR_MODE_BOOTSTRAP }} />
      </head>
      <body>
        {/*
         * Chrome (wordmark + nav + rate-limit chip) used to live here as a
         * static HTML <header>. Post-E-A, the manifest renders an
         * <OctantHeader> binding instead — so chrome is layout-data, not
         * a fixed DOM frame. The static shell is intentionally minimal now;
         * its only job is to host the providers and let the manifest paint
         * the rest. (Removing the static header eliminates the
         * "menu-twice" duplication.)
         */}
        <CirProviders>{children}</CirProviders>
      </body>
    </html>
  );
}
