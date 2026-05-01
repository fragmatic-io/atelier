// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { CirProviders } from '@/lib/cir-providers';
import { Wordmark } from '@/components/Wordmark';
import { RateLimitStatusBar } from '@/components/RateLimitStatusBar';
import { DEMO_GITHUB_BRAND_KIT } from '@/lib/brand-kit';

export const metadata: Metadata = {
  title: 'Octant — CIR demo',
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
        <header className="octant-chrome">
          <div className="octant-chrome-inner">
            <Link
              href="/today"
              aria-label="Octant — go to Today"
              style={{ color: 'var(--cir-color-fg)', display: 'inline-flex' }}
            >
              <Wordmark height={24} />
            </Link>
            <nav>
              <Link href="/today">Today</Link>
              <Link href="/repos">Repos</Link>
              <Link href="/inbox">Inbox</Link>
              <Link href="/issue/new">New</Link>
              <Link href="/settings/github" className="octant-token-cta">
                Sign in with token
              </Link>
            </nav>
          </div>
        </header>
        <div
          style={{
            maxWidth: 1280,
            margin: '0 auto',
            padding: '12px var(--cir-space-lg) 0',
          }}
        >
          <RateLimitStatusBar />
        </div>
        <CirProviders>{children}</CirProviders>
      </body>
    </html>
  );
}
