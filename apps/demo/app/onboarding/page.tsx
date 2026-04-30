// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';

/**
 * First-run onboarding. Shows the user a permission-grant screen for the
 * lenses this app needs to render its routes.
 *
 * Wave 8 / V-3: "Grant" no longer writes directly to localStorage. The
 * demo hands off to the vault's consent screen at
 * `${NEXT_PUBLIC_VAULT_URL}/vault/consent` — that's the only page allowed
 * to mint a token. On approve, the vault redirects back to
 * `/onboarding/grant-callback?token=...`; on deny, with `?error=denied`.
 *
 * Wave 7 / V-1: same module wired the async vault helpers; this is the
 * UX-facing layer that completes the loop.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Card, Container, Stack } from '@cir/components';
import { DEMO_LENS_SCOPES, loadIntentProfile } from '@/lib/intent-store';
import { requestGrant } from '@/lib/intent-grant';

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
    // Hand off to the vault's consent screen. requestGrant() stashes the
    // intended target ('/today') in sessionStorage and redirects the
    // browser. The grant-callback page completes the dance.
    try {
      requestGrant({
        scopes,
        intended: '/today',
        purpose: 'CIR demo onboarding',
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[cir-demo] requestGrant failed', err);
      router.push('/onboarding/denied');
    }
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
            <Alert severity="info" title="You will be redirected to your vault">
              Clicking grant takes you to the vault&apos;s consent screen. The vault — not this app
              — mints the scoped token. You can deny there too.
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
