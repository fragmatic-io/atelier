// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';

/**
 * First-run onboarding. Shows the user a permission-grant screen for the
 * lenses this app needs to render its routes.
 *
 * TODO(vault): in production, this would render scopes returned by the
 *   vault's permission-request flow, and "Grant" would call back into the
 *   vault to mint a scoped read token. Here we just persist a profile to
 *   localStorage to demonstrate the flow.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Card, Container, Stack } from '@cir/components';
import {
  DEMO_LENS_SCOPES,
  buildDemoProfile,
  loadIntentProfile,
  saveIntentProfile,
} from '@/lib/intent-store';

type Mode = 'choose' | 'customize';

export default function OnboardingPage(): React.JSX.Element {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('choose');
  const allIds = useMemo(() => DEMO_LENS_SCOPES.map((s) => s.id), []);
  const [selected, setSelected] = useState<readonly string[]>(allIds);

  // If the user already granted, bounce straight to /today. This handles
  // the case where someone hits /onboarding directly with a profile present.
  useEffect(() => {
    const existing = loadIntentProfile();
    if (existing) router.replace('/today');
  }, [router]);

  function commit(scopes: readonly string[]): void {
    if (scopes.length === 0) {
      router.push('/onboarding/denied');
      return;
    }
    saveIntentProfile(buildDemoProfile(scopes));
    router.push('/today');
  }

  function toggle(id: string): void {
    setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  return (
    <Container maxWidth="sm" padding="md">
      <Stack direction="vertical" gap="lg">
        <Card title="This app is asking to read your intent profile">
          <Stack direction="vertical" gap="md">
            <p style={{ color: '#374151' }}>
              <strong>cir.demo</strong> wants permission to read these lens slices of your intent
              profile. You own this data; you can grant, deny, or grant temporarily and revoke later
              from <code>/settings/intent</code>.
            </p>
            <Alert severity="info" title="Demo only">
              This demo stores the granted profile in your browser&apos;s localStorage, not a real
              vault. See the README for the production model.
            </Alert>
            <Stack direction="vertical" gap="sm">
              {DEMO_LENS_SCOPES.map((scope) => {
                const isOn = selected.includes(scope.id);
                return (
                  <div
                    key={scope.id}
                    style={{
                      border: '1px solid #e5e7eb',
                      borderRadius: 8,
                      padding: 12,
                      display: 'flex',
                      gap: 12,
                      alignItems: 'flex-start',
                    }}
                  >
                    {mode === 'customize' ? (
                      <input
                        type="checkbox"
                        aria-label={`Grant ${scope.label}`}
                        checked={isOn}
                        onChange={() => {
                          toggle(scope.id);
                        }}
                        style={{ marginTop: 4 }}
                      />
                    ) : (
                      <span aria-hidden="true" style={{ marginTop: 2 }}>
                        ·
                      </span>
                    )}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>
                        <code>{scope.id}</code> — {scope.label}
                      </div>
                      <div style={{ color: '#6b7280', fontSize: 14 }}>{scope.description}</div>
                    </div>
                  </div>
                );
              })}
            </Stack>
            <Stack direction="horizontal" gap="sm">
              {mode === 'choose' ? (
                <>
                  <Button
                    variant="primary"
                    onClick={() => {
                      commit(allIds);
                    }}
                  >
                    Grant all
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setMode('customize');
                    }}
                  >
                    Customize
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      router.push('/onboarding/denied');
                    }}
                  >
                    Deny
                  </Button>
                </>
              ) : null}
              {mode === 'choose' ? (
                <Button
                  variant="ghost"
                  onClick={() => {
                    router.push('/onboarding/describe');
                  }}
                >
                  Or describe yourself in your own words →
                </Button>
              ) : (
                <>
                  <Button
                    variant="primary"
                    onClick={() => {
                      commit(selected);
                    }}
                  >
                    Grant selected ({selected.length})
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setMode('choose');
                      setSelected(allIds);
                    }}
                  >
                    Back
                  </Button>
                </>
              )}
            </Stack>
          </Stack>
        </Card>
      </Stack>
    </Container>
  );
}
