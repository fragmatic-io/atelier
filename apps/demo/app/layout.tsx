// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { CirProviders } from '@/lib/cir-providers';

export const metadata: Metadata = {
  title: 'CIR demo — email triage',
  description: 'Capability · Intent · Render — end-to-end demo',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="bg-white border-b border-gray-200 px-4 py-3">
          <div className="max-w-screen-md mx-auto flex items-center justify-between">
            <Link href="/today" className="font-semibold text-gray-900">
              CIR demo
            </Link>
            <span className="text-xs text-gray-500">
              fake compiler · in-memory data · no API key needed
            </span>
          </div>
        </header>
        <CirProviders>{children}</CirProviders>
      </body>
    </html>
  );
}
