// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';

/**
 * Settings panel: view and revoke the lenses this app currently holds.
 *
 * Wave 7 / V-1: "Revoke this lens" calls `@cir/vault-client.revokeGrant()`
 * (via `revokeLensAsync`) which tears down the scoped token and emits a
 * `system.security_revocation` trigger; subscribed runtimes invalidate
 * their cached manifests via the existing trigger bus. When the vault
 * server is unreachable, the revoke falls through to localStorage with a
 * console warning.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Card, Container, Stack } from '@cir/components';
import {
  DEMO_LENS_SCOPES,
  grantedScopesFromProfile,
  loadIntentProfile,
  revokeIntentProfileAsync,
  revokeLensAsync,
  type DemoLensScopeId,
} from '@/lib/intent-store';

interface ProfileView {
  version: number;
  granted: string[];
}

export default function SettingsIntentPage(): React.JSX.Element {
  const router = useRouter();
  const [view, setView] = useState<ProfileView | null>(null);
  const [loaded, setLoaded] = useState(false);

  function refresh(): ProfileView | null {
    const profile = loadIntentProfile();
    if (!profile) return null;
    return {
      version: profile.profile_version,
      granted: grantedScopesFromProfile(profile),
    };
  }

  useEffect(() => {
    const next = refresh();
    setView(next);
    setLoaded(true);
    if (!next) {
      router.replace('/onboarding');
    }
  }, [router]);

  function onRevokeOne(scope: string): void {
    void revokeLensAsync(scope).then(
      (result) => {
        // Wave 8 / V-3: per-lens revoke now hits the vault's
        // DELETE /vault/grants/:jti endpoint (cascades a
        // system.security_revocation trigger), clears the local profile,
        // and bounces back through onboarding to re-mint a narrower grant.
        // When there's nothing left to grant, route to /onboarding/denied.
        if (result.shouldReGrant) {
          router.replace('/onboarding');
        } else {
          router.replace('/onboarding/denied');
        }
      },
      (err: unknown) => {
        // eslint-disable-next-line no-console
        console.error('[cir-demo] revokeLensAsync failed', err);
        const next = refresh();
        setView(next);
      },
    );
  }

  function onRevokeAll(): void {
    void revokeIntentProfileAsync().then(
      () => router.replace('/onboarding'),
      (err: unknown) => {
        // eslint-disable-next-line no-console
        console.error('[cir-demo] revokeIntentProfileAsync failed', err);
        router.replace('/onboarding');
      },
    );
  }

  if (!loaded) {
    return (
      <Container maxWidth="sm" padding="md">
        <p>Loading…</p>
      </Container>
    );
  }
  if (!view) {
    // The redirect from the effect will land momentarily; render a
    // placeholder rather than the settings UI in the meantime.
    return (
      <Container maxWidth="sm" padding="md">
        <p>No profile found. Redirecting to onboarding…</p>
      </Container>
    );
  }

  const scopeMeta = new Map<string, (typeof DEMO_LENS_SCOPES)[number]>(
    DEMO_LENS_SCOPES.map((s) => [s.id, s]),
  );

  return (
    <Container maxWidth="sm" padding="md">
      <Stack direction="vertical" gap="lg">
        <Card title="Granted lenses">
          <Stack direction="vertical" gap="md">
            <Alert severity="info" title={`Profile version ${String(view.version)}`}>
              These are the slices of your intent profile <code>cir.demo</code>
              currently holds. Revoke any lens to immediately remove this app&apos;s access.
            </Alert>
            {view.granted.length === 0 ? (
              <p style={{ color: '#6b7280' }}>No lenses granted.</p>
            ) : (
              <Stack direction="vertical" gap="sm">
                {view.granted.map((scope) => {
                  const meta = scopeMeta.get(scope as DemoLensScopeId);
                  return (
                    <div
                      key={scope}
                      style={{
                        border: '1px solid #e5e7eb',
                        borderRadius: 8,
                        padding: 12,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600 }}>
                          <code>{scope}</code>
                          {meta ? ` — ${meta.label}` : null}
                        </div>
                        {meta ? (
                          <div style={{ color: '#6b7280', fontSize: 14 }}>{meta.description}</div>
                        ) : null}
                      </div>
                      <Button
                        variant="destructive"
                        onClick={() => {
                          onRevokeOne(scope);
                        }}
                      >
                        Revoke this lens
                      </Button>
                    </div>
                  );
                })}
              </Stack>
            )}
            <Button variant="ghost" onClick={onRevokeAll}>
              Revoke all and re-onboard
            </Button>
          </Stack>
        </Card>
      </Stack>
    </Container>
  );
}
