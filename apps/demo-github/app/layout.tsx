// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { CirProviders } from '@/lib/cir-providers';

export const metadata: Metadata = {
  title: 'CIR demo — GitHub reviewer queue',
  description:
    'Real-mutations showcase: optimistic archive, verbal-required bulk close, hover-card mention previews against the GitHub REST API.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-3">
          <div className="max-w-screen-lg mx-auto flex items-center justify-between gap-3">
            <Link href="/today" className="font-semibold text-gray-900 dark:text-gray-50">
              CIR · GitHub reviewer
            </Link>
            <nav className="flex gap-3 text-sm">
              <Link href="/today">Today</Link>
              <Link href="/repos">Repos</Link>
              <Link href="/inbox">Inbox</Link>
              <Link href="/issue/new">New</Link>
              <Link href="/settings/github">Settings</Link>
            </nav>
          </div>
        </header>
        <CirProviders>{children}</CirProviders>
      </body>
    </html>
  );
}
