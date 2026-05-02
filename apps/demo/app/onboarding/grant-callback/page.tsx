// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';

/**
 * Grant callback — the redirect target after the vault's consent screen.
 *
 * Wave 8 / V-3. The flow:
 *
 *   /onboarding → click "Grant all" → requestGrant() redirects browser to
 *   `${NEXT_PUBLIC_VAULT_URL}/vault/consent?...&redirect=<this page>` →
 *   user approves on the vault → vault redirects back here with
 *   `?token=<jwt>` (or `?error=denied` on deny).
 *
 * This page persists the token via `consumeGrantCallback()`, seeds a
 * baseline profile via `saveIntentProfileAsync()` (so the route gates
 * have something to gate on), and routes the user to wherever they were
 * heading.
 */

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, Button, Card, Container, Stack } from '@atelier/components';
import { decodeJwt } from '@atelier/vault-client';
import {
  buildDemoProfile,
  grantedScopesFromProfile,
  saveIntentProfileAsync,
  trackGrantJti,
} from '@/lib/intent-store';
import { consumeGrantCallback } from '@/lib/intent-grant';

type Phase =
  | { kind: 'pending' }
  | { kind: 'denied'; intended: string }
  | { kind: 'missing' }
  | { kind: 'error'; message: string };

export default function GrantCallbackPage(): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [phase, setPhase] = useState<Phase>({ kind: 'pending' });

  useEffect(() => {
    const query: Record<string, string | undefined> = {
      ...(searchParams.get('token') !== null ? { token: searchParams.get('token') ?? '' } : {}),
      ...(searchParams.get('error') !== null ? { error: searchParams.get('error') ?? '' } : {}),
    };
    const result = consumeGrantCallback({ query });
    if (result.kind === 'denied') {
      setPhase({ kind: 'denied', intended: result.intended });
      return;
    }
    if (result.kind === 'missing') {
      setPhase({ kind: 'missing' });
      return;
    }
    // approved — decode the token, persist a baseline profile, then route.
    let scopes: string[] = [];
    let jti: string | null = null;
    try {
      const decoded = decodeJwt(result.token);
      const scopeClaim = decoded.claims.scope;
      if (typeof scopeClaim === 'string') {
        scopes = scopeClaim.split(/\s+/).filter((s) => s.length > 0);
      }
      jti = decoded.claims.jti ?? null;
    } catch (err) {
      setPhase({
        kind: 'error',
        message: `Token decode failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }
    if (jti !== null) trackGrantJti(jti);
    const profile = buildDemoProfile(scopes);
    saveIntentProfileAsync(profile).then(
      () => {
        // Verify the saved profile is round-trip consistent.
        const ok = grantedScopesFromProfile(profile).length > 0;
        router.replace(ok ? result.intended : '/onboarding/denied');
      },
      (err: unknown) => {
        // eslint-disable-next-line no-console
        console.error('[cir-demo] grant-callback save failed', err);
        setPhase({
          kind: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      },
    );
  }, [router, searchParams]);

  if (phase.kind === 'pending') {
    return (
      <Container maxWidth="sm" padding="md">
        <Card title="Finishing grant...">
          <p style={{ color: '#6b7280' }}>Persisting your token and loading your profile…</p>
        </Card>
      </Container>
    );
  }

  if (phase.kind === 'denied') {
    return (
      <Container maxWidth="sm" padding="md">
        <Stack direction="vertical" gap="md">
          <Card title="Permission denied">
            <Stack direction="vertical" gap="md">
              <Alert severity="warning" title="You denied the grant on the vault">
                The vault recorded your refusal. No token was minted; the demo can&apos;t render
                anything until you grant at least one lens.
              </Alert>
              <Button
                variant="primary"
                onClick={() => {
                  router.replace('/onboarding');
                }}
              >
                Restart onboarding
              </Button>
            </Stack>
          </Card>
        </Stack>
      </Container>
    );
  }

  if (phase.kind === 'missing') {
    return (
      <Container maxWidth="sm" padding="md">
        <Card title="No grant in this URL">
          <Stack direction="vertical" gap="md">
            <Alert severity="info" title="The callback URL is missing the expected fields">
              You probably hit this page directly. The vault redirects here automatically with a
              token after you approve a grant.
            </Alert>
            <Button
              variant="primary"
              onClick={() => {
                router.replace('/onboarding');
              }}
            >
              Start over
            </Button>
          </Stack>
        </Card>
      </Container>
    );
  }

  return (
    <Container maxWidth="sm" padding="md">
      <Card title="Grant callback failed">
        <Stack direction="vertical" gap="md">
          <Alert severity="error" title="Something went wrong">
            {phase.message}
          </Alert>
          <Button
            variant="primary"
            onClick={() => {
              router.replace('/onboarding');
            }}
          >
            Restart onboarding
          </Button>
        </Stack>
      </Card>
    </Container>
  );
}
