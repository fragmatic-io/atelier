// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';

/**
 * Home: redirect to `/today`. Onboarding lives at `/settings/github` so
 * the unauthenticated tour starts already inside the demo (with fixture
 * data) rather than gated behind a consent screen — the goal here is to
 * showcase the queue surface, not the consent dance (apps/demo covers
 * that in detail).
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home(): React.JSX.Element {
  const router = useRouter();
  useEffect(() => {
    router.replace('/today');
  }, [router]);
  return <p style={{ padding: 24 }}>Loading…</p>;
}
