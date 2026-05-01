// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { CirProviders } from '@/lib/cir-providers';

export const metadata: Metadata = {
  title: 'CIR demo — dummyjson catalog',
  description:
    'Lens-switching e-commerce showcase. Browse a real product catalog; switch viewing density without losing scroll.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header
          style={{
            background: '#ffffff',
            borderBottom: '1px solid #e7e5e4',
            padding: '12px 16px',
          }}
        >
          <div
            style={{
              maxWidth: 960,
              margin: '0 auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
            }}
          >
            <Link href="/browse" style={{ fontWeight: 600, color: '#0c0a09', fontSize: 14 }}>
              CIR demo · DummyJSON shop
            </Link>
            <nav style={{ display: 'flex', gap: 16, fontSize: 13, color: '#78716c' }}>
              <Link href="/browse">Browse</Link>
              <Link href="/cart">Cart</Link>
              <Link href="/checkout">Checkout</Link>
              <Link href="/settings/lens">Lens</Link>
            </nav>
            <span style={{ fontSize: 11, color: '#a8a29e' }}>
              real public API · lens-switching showcase
            </span>
          </div>
        </header>
        <CirProviders>{children}</CirProviders>
      </body>
    </html>
  );
}
