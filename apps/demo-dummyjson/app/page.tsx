// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';

/**
 * Home: redirects to /browse. Guests browse the catalog without an
 * intent profile — onboarding is optional in this demo (only the lens
 * picker writes to the vault).
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home(): React.JSX.Element {
  const router = useRouter();
  useEffect(() => {
    router.replace('/browse');
  }, [router]);
  return <p style={{ padding: 24 }}>Loading…</p>;
}
