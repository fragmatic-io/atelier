// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CirRoute } from '@atelier/react';
import { hasGrantedLens } from '@/lib/intent-store';

export default function TodayPage(): React.JSX.Element {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => {
    const ok = hasGrantedLens('lens.today');
    setAllowed(ok);
    if (!ok) router.replace('/onboarding');
  }, [router]);
  if (allowed !== true) return <p style={{ padding: 24 }}>Loading…</p>;
  return <CirRoute path="/today" />;
}
