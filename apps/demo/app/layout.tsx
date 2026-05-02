// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Root layout — Aurora.
 *
 * The demo defaults to dark surface (Aurora is dark-primary). The user's
 * persisted color-mode preference still wins via Wave 6 P-1's
 * `<html data-color-mode>` mirror — `<Chrome>` reads the loaded
 * `IntentProfile` on mount and overwrites the SSR default with the saved
 * choice. So the SSR pass paints dark, and a user who saved "light"
 * snaps to light on hydration.
 *
 * The `cir-aurora` class is an opt-in scope marker for hosts that mount
 * Aurora alongside another design system (no-op when Aurora is the only
 * system on the page, as it is here).
 */
import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { CirProviders } from '@/lib/atelier-providers';
import { Chrome } from '@/components/Chrome';

export const metadata: Metadata = {
  title: 'Atelier demo — personalisation showcase',
  description:
    'Capability · Intent · Render — onboarding, personalised manifest, optimistic UI, audit stream.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-color-mode="dark" className="cir-aurora dark">
      <body>
        {/* Chrome owns: wordmark, status pill, color-mode toggle, dev-only audit link. */}
        <Chrome />
        <CirProviders>{children}</CirProviders>
      </body>
    </html>
  );
}
