// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';

/**
 * Home: the entry-point gate. If the user already has an intent profile
 * granted to this demo, send them to /today; otherwise send them through
 * the onboarding flow. The decision happens client-side because the
 * "vault" here is localStorage (see `lib/intent-store.ts`).
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { loadIntentProfile } from '@/lib/intent-store';

export default function Home(): React.JSX.Element {
  const router = useRouter();
  useEffect(() => {
    const profile = loadIntentProfile();
    router.replace(profile ? '/today' : '/onboarding');
  }, [router]);
  return <p style={{ padding: 24 }}>Loading…</p>;
}
