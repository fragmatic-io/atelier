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
 *
 * DX-A polish:
 *   - Each granted lens row carries a `<HoverCard>` describing the data
 *     slice the app would see with that grant. Same copy as the review
 *     screen so users have one mental model regardless of where they land.
 *   - Revoke uses an optimistic-UI flow: the row is immediately marked as
 *     "pending revoke" with an undo toast (5s window). If the user does not
 *     press Undo, the actual `revokeLensAsync` call fires after the window;
 *     if they do, the row snaps back. This honours the
 *     `low_stakes + reversible` shape captured by Wave 7a / Int-4.
 *   - A "Compile budget" sub-section reports the per-day token + call
 *     ceilings the demo is provisioned with, with a `<Progress>` bar for
 *     each. The numbers are sourced from `/api/cir/cache-stats` when
 *     available; otherwise we render the static defaults the
 *     `BudgetMeter` (compiler) would have used.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Card, Container, HoverCard, Progress, Stack, Toast } from '@cir/components';
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

const REVOKE_UNDO_WINDOW_MS = 5000;

const LENS_PREVIEW_TEXT: Readonly<Record<string, string>> = {
  'lens.today': 'Decision queue: thread subjects + sender names + due-today tasks.',
  'lens.thread': 'Full message bodies for threads you opened in the last 24h.',
  'vocabulary.read': 'Your saved name aliases + time references for friendlier rendering.',
};
function previewFor(scope: string): string {
  return LENS_PREVIEW_TEXT[scope] ?? `Data slice for ${scope}.`;
}

interface BudgetView {
  /** Tokens used today. */
  tokens_used: number;
  /** Per-day token ceiling. */
  tokens_max: number;
  /** Calls used today. */
  calls_used: number;
  /** Per-day call ceiling. */
  calls_max: number;
}

const DEFAULT_BUDGET: BudgetView = {
  tokens_used: 0,
  tokens_max: 200_000,
  calls_used: 0,
  calls_max: 1_000,
};

/**
 * Pull the current compile-budget snapshot off the demo's cache-stats
 * endpoint. The endpoint reports {used,max} per dimension; on a fresh boot
 * everything is zero. We swallow network errors and fall through to the
 * defaults — this is a status surface, not a critical path.
 */
async function fetchBudget(): Promise<BudgetView> {
  try {
    const res = await fetch('/api/cir/cache-stats');
    if (!res.ok) return DEFAULT_BUDGET;
    const body = (await res.json()) as Partial<{
      tokens_used: number;
      tokens_max: number;
      calls_used: number;
      calls_max: number;
    }>;
    return {
      tokens_used: typeof body.tokens_used === 'number' ? body.tokens_used : 0,
      tokens_max: typeof body.tokens_max === 'number' ? body.tokens_max : DEFAULT_BUDGET.tokens_max,
      calls_used: typeof body.calls_used === 'number' ? body.calls_used : 0,
      calls_max: typeof body.calls_max === 'number' ? body.calls_max : DEFAULT_BUDGET.calls_max,
    };
  } catch {
    return DEFAULT_BUDGET;
  }
}

export default function SettingsIntentPage(): React.JSX.Element {
  const router = useRouter();
  const [view, setView] = useState<ProfileView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pendingRevoke, setPendingRevoke] = useState<{ scope: string; expiresAt: number } | null>(
    null,
  );
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [budget, setBudget] = useState<BudgetView>(DEFAULT_BUDGET);

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

  // Pull a budget snapshot on mount.
  useEffect(() => {
    let cancelled = false;
    void fetchBudget().then((b) => {
      if (!cancelled) setBudget(b);
    });
    return (): void => {
      cancelled = true;
    };
  }, []);

  // Resolve a pending revoke after the undo window closes.
  useEffect(() => {
    if (pendingRevoke === null) return;
    const ms = Math.max(0, pendingRevoke.expiresAt - Date.now());
    const id = setTimeout(() => {
      const scope = pendingRevoke.scope;
      setPendingRevoke(null);
      void revokeLensAsync(scope).then(
        (result) => {
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
          setToastMessage('Revoke failed — see console.');
        },
      );
    }, ms);
    return (): void => {
      clearTimeout(id);
    };
  }, [pendingRevoke, router]);

  const onRevokeOne = useCallback((scope: string) => {
    // Optimistic: mark the row as pending and show an undo toast. The
    // actual revoke fires after the window unless the user cancels.
    setPendingRevoke({ scope, expiresAt: Date.now() + REVOKE_UNDO_WINDOW_MS });
    setToastMessage(`Revoking ${scope}. Click Undo to keep.`);
  }, []);

  const onUndoRevoke = useCallback(() => {
    setPendingRevoke(null);
    setToastMessage('Revoke cancelled.');
  }, []);

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

  const tokenPct =
    budget.tokens_max > 0 ? Math.round((budget.tokens_used / budget.tokens_max) * 100) : 0;
  const callsPct =
    budget.calls_max > 0 ? Math.round((budget.calls_used / budget.calls_max) * 100) : 0;

  return (
    <Container maxWidth="sm" padding="md">
      <Stack direction="vertical" gap="lg">
        <Card title="Granted lenses">
          <Stack direction="vertical" gap="md">
            <Alert severity="info" title={`Profile version ${String(view.version)}`}>
              These are the slices of your intent profile <code>cir.demo</code> currently holds.
              Revoke any lens to immediately remove this app&apos;s access.
            </Alert>
            {view.granted.length === 0 ? (
              <p style={{ color: '#6b7280' }}>No lenses granted.</p>
            ) : (
              <Stack direction="vertical" gap="sm">
                {view.granted.map((scope) => {
                  const meta = scopeMeta.get(scope as DemoLensScopeId);
                  const isPending = pendingRevoke?.scope === scope;
                  return (
                    <HoverCard
                      key={scope}
                      content={() => (
                        <div data-testid={`grant-preview-${scope}`}>
                          <strong style={{ display: 'block', marginBottom: 4 }}>{scope}</strong>
                          <p style={{ margin: 0, fontSize: 13, color: '#374151' }}>
                            {previewFor(scope)}
                          </p>
                        </div>
                      )}
                      ariaLabel={`Preview of ${scope}`}
                    >
                      <div
                        data-cir-grant-row={scope}
                        data-pending-revoke={isPending ? 'true' : 'false'}
                        style={{
                          border: '1px solid #e5e7eb',
                          borderRadius: 8,
                          padding: 12,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 12,
                          opacity: isPending ? 0.5 : 1,
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
                        {isPending ? (
                          <Button variant="secondary" onClick={onUndoRevoke}>
                            Undo
                          </Button>
                        ) : (
                          <Button
                            variant="destructive"
                            onClick={() => {
                              onRevokeOne(scope);
                            }}
                          >
                            Revoke this lens
                          </Button>
                        )}
                      </div>
                    </HoverCard>
                  );
                })}
              </Stack>
            )}
            <Button variant="ghost" onClick={onRevokeAll}>
              Revoke all and re-onboard
            </Button>
          </Stack>
        </Card>

        <Card title="Compile budget">
          <Stack direction="vertical" gap="md">
            <Alert severity="info" title="Per-day ceiling">
              The demo&apos;s compiler runs through a `BudgetMeter` so cold compiles don&apos;t blow
              past a daily token / call cap. Numbers are reset every UTC day by the in-memory store.
            </Alert>
            <div data-testid="budget-tokens">
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span>Tokens</span>
                <span>
                  {budget.tokens_used.toLocaleString()} / {budget.tokens_max.toLocaleString()}
                </span>
              </div>
              <Progress value={tokenPct} />
            </div>
            <div data-testid="budget-calls">
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span>Calls</span>
                <span>
                  {budget.calls_used.toLocaleString()} / {budget.calls_max.toLocaleString()}
                </span>
              </div>
              <Progress value={callsPct} />
            </div>
          </Stack>
        </Card>

        <Toast
          message={toastMessage ?? ''}
          open={toastMessage !== null}
          onClose={() => {
            setToastMessage(null);
          }}
          variant="info"
          duration={REVOKE_UNDO_WINDOW_MS}
        />
      </Stack>
    </Container>
  );
}
