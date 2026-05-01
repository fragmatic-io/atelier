// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { CirProviders } from '@/lib/cir-providers';
import { Chrome } from '@/components/Chrome';

export const metadata: Metadata = {
  title: 'CIR demo — personalisation showcase',
  description:
    'Capability · Intent · Render — onboarding, personalised manifest, optimistic UI, audit stream.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Chrome owns: status pill, color-mode toggle, dev-only audit link. */}
        <Chrome />
        <CirProviders>{children}</CirProviders>
      </body>
    </html>
  );
}
