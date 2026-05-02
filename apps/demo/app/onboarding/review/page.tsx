// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';

/**
 * Review the LLM-proposed `IntentProfile` draft before persisting it.
 *
 * Reads the draft from `sessionStorage` (key `cir.demo.intent.draft`,
 * written by `/onboarding/describe`). Lets the user edit each field —
 * lenses, rules, vocabulary entries, and the three primary global
 * preferences (density / color_mode / automation_trust). On Save, calls
 * `saveIntentProfile()` which validates against `IntentProfileSchema`
 * before writing.
 *
 * This page is the human gate. The compiler returns a draft; nothing
 * touches localStorage / the vault until the user clicks Save.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Button,
  Card,
  Container,
  HoverCard,
  Select,
  Stack,
  TextInput,
} from '@atelier/components';
import type { IntentProfile, IntentRule } from '@atelier/schemas';
import {
  getVaultClient,
  grantedScopesFromProfile,
  saveIntentProfileAsync,
} from '@/lib/intent-store';
import { requestGrant } from '@/lib/intent-grant';
import { applyColorMode } from '@/components/Chrome';
import { SESSION_DRAFT_KEY } from '../describe/page';

interface DraftEnvelope {
  profile: IntentProfile;
  compiler_model: string;
}

/**
 * Plain-language labels for the fields we surface. Translates schema
 * names like `lens.github` → "GitHub view" so the review screen reads
 * like English rather than YAML.
 */
const LENS_LABELS: Record<string, string> = {
  github: 'GitHub view',
  shopping: 'Shopping view',
  today: 'Today view',
  email: 'Email view',
  thread: 'Thread view',
};

const DENSITY_OPTIONS = [
  { value: 'compact', label: 'Compact' },
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'spacious', label: 'Spacious' },
];
const COLOR_MODE_OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'Follow system' },
];
const AUTOMATION_OPTIONS = [
  { value: 'strict', label: 'Strict — always confirm' },
  { value: 'cautious', label: 'Cautious — confirm risky actions' },
  { value: 'permissive', label: 'Permissive — auto-execute' },
];

function lensLabel(domain: string): string {
  return LENS_LABELS[domain] ?? `${domain} view`;
}

/**
 * Plain-language description of the data slice each lens exposes. Used
 * inside a `<HoverCard>` on the review screen so the user knows exactly
 * what they're consenting to per row.
 */
const LENS_PREVIEW_TEXT: Readonly<Record<string, string>> = {
  github: 'Open pull requests, review status, mentions on issues you authored.',
  shopping: 'Recently viewed products, cart contents, order history.',
  today: 'The decision queue: threads requiring a reply + tasks due in 7d.',
  email: 'Inbox subjects + senders for triage. No body content.',
  thread: 'Full message bodies for threads you opened in the last 24h.',
};
function lensPreviewFor(domain: string): string {
  return (
    LENS_PREVIEW_TEXT[domain] ??
    `Data slice for ${domain}. The host app reads only the fields your grant exposes.`
  );
}

export default function OnboardingReviewPage(): React.JSX.Element {
  const router = useRouter();
  const [draft, setDraft] = useState<DraftEnvelope | null>(null);
  const [missing, setMissing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load draft on mount. Bounce to /onboarding/describe if missing.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.sessionStorage.getItem(SESSION_DRAFT_KEY);
    if (raw === null) {
      setMissing(true);
      return;
    }
    try {
      const parsed = JSON.parse(raw) as DraftEnvelope;
      setDraft(parsed);
    } catch {
      setMissing(true);
    }
  }, []);

  // Live-preview color mode while the user is editing the draft. The
  // chrome-level toggle persists to the profile; the review preview just
  // mirrors the selection to <html> so the user sees the effect. Revert to
  // 'system' when the draft is dropped.
  useEffect(() => {
    if (draft === null) return;
    const cm = (draft.profile.global_preferences['color_mode'] as string | undefined) ?? 'system';
    if (cm === 'light' || cm === 'dark' || cm === 'system') applyColorMode(cm);
  }, [draft]);

  const profile = draft?.profile ?? null;

  const lensEntries = useMemo(() => (profile ? Object.entries(profile.lenses) : []), [profile]);

  const vocabEntries = useMemo(
    () => (profile ? Object.entries(profile.vocabulary) : []),
    [profile],
  );

  function patchProfile(patch: Partial<IntentProfile>): void {
    setDraft((prev) => (prev ? { ...prev, profile: { ...prev.profile, ...patch } } : prev));
  }

  function patchPreference(key: string, value: string | undefined): void {
    if (!profile) return;
    const next = { ...profile.global_preferences };
    if (value === undefined || value === '') {
      delete next[key];
    } else {
      next[key] = value;
    }
    patchProfile({ global_preferences: next });
  }

  function patchLens(domain: string, lens: string): void {
    if (!profile) return;
    const next = { ...profile.lenses };
    if (lens.length === 0) {
      delete next[domain];
    } else {
      next[domain] = lens;
    }
    patchProfile({ lenses: next });
  }

  function patchRule(idx: number, rule: IntentRule | null): void {
    if (!profile) return;
    const next = [...profile.rules];
    if (rule === null) {
      next.splice(idx, 1);
    } else {
      next[idx] = rule;
    }
    patchProfile({ rules: next });
  }

  function save(): void {
    if (!profile) return;
    setSaving(true);
    // Wave 8 / V-3: token-first ordering. If there is no token in storage,
    // we kick off the consent flow and let the grant-callback page resume
    // the save. The draft is already in sessionStorage so the callback
    // re-applies it (the callback writes a baseline buildDemoProfile from
    // the granted scopes; the draft re-apply is handled below by treating
    // this page as the resume target). For this iteration we pass the
    // describe-route as `intended` so the user lands back here after
    // approving — the draft is still in sessionStorage and clicking Save
    // again now has a token.
    const client = getVaultClient();
    if (client.getToken() === null) {
      const scopes = grantedScopesFromProfile(profile);
      try {
        requestGrant({
          scopes: scopes.length > 0 ? scopes : ['lens.today', 'vocabulary.read'],
          intended: '/onboarding/review',
          purpose: 'Atelier demo onboarding (review draft)',
        });
        return; // browser is redirecting away
      } catch (err) {
        setSaving(false);
        // eslint-disable-next-line no-console
        console.error('[cir-demo] requestGrant failed', err);
        return;
      }
    }
    void saveIntentProfileAsync({
      ...profile,
      // Bump updated_at to reflect the user's edits, not the LLM's draft time.
      updated_at: new Date().toISOString(),
    }).then(
      () => {
        window.sessionStorage.removeItem(SESSION_DRAFT_KEY);
        router.push('/today');
      },
      (err: unknown) => {
        setSaving(false);
        // eslint-disable-next-line no-console
        console.error('saveIntentProfileAsync failed:', err);
      },
    );
  }

  function startOver(): void {
    window.sessionStorage.removeItem(SESSION_DRAFT_KEY);
    router.push('/onboarding/describe');
  }

  if (missing) {
    return (
      <Container maxWidth="sm" padding="md">
        <Card title="No draft to review">
          <Stack direction="vertical" gap="md">
            <Alert severity="info" title="Nothing to review yet">
              Start by describing yourself on the previous screen.
            </Alert>
            <Button
              variant="primary"
              onClick={() => {
                router.push('/onboarding/describe');
              }}
            >
              Go back to describe
            </Button>
          </Stack>
        </Card>
      </Container>
    );
  }

  if (!draft || !profile) {
    return (
      <Container maxWidth="sm" padding="md">
        <p>Loading draft…</p>
      </Container>
    );
  }

  const density = (profile.global_preferences['density'] as string | undefined) ?? '';
  const colorMode = (profile.global_preferences['color_mode'] as string | undefined) ?? '';
  const automation = (profile.global_preferences['automation_trust'] as string | undefined) ?? '';

  // DX-A polish: live-preview the density + color_mode picks against the
  // review page itself so the user sees their choice before saving. The
  // density preview re-runs on each change; the color mode preview applies
  // the toggle to <html> immediately and reverts to "system" on unmount.
  const previewDensity: 'compact' | 'comfortable' | 'spacious' =
    density === 'compact' || density === 'comfortable' || density === 'spacious'
      ? density
      : 'comfortable';
  const previewRowPadPx = previewDensity === 'compact' ? 4 : previewDensity === 'spacious' ? 16 : 8;

  return (
    <Container maxWidth="md" padding="md">
      <Stack direction="vertical" gap="lg">
        <Card title="Review your draft profile">
          <Stack direction="vertical" gap="md">
            <Alert severity="info" title="This is a draft">
              Edit anything that looks off before saving. Generated by{' '}
              <code>{draft.compiler_model}</code>.
            </Alert>

            <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Global preferences</h3>
            <Select
              label="Density"
              options={[{ value: '', label: '— unset —' }, ...DENSITY_OPTIONS]}
              value={density}
              onChange={(v) => {
                patchPreference('density', v);
              }}
            />
            <Select
              label="Color mode"
              options={[{ value: '', label: '— unset —' }, ...COLOR_MODE_OPTIONS]}
              value={colorMode}
              onChange={(v) => {
                patchPreference('color_mode', v);
              }}
            />
            <Select
              label="Automation trust"
              options={[{ value: '', label: '— unset —' }, ...AUTOMATION_OPTIONS]}
              value={automation}
              onChange={(v) => {
                patchPreference('automation_trust', v);
              }}
            />

            <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Views (lenses)</h3>
            <p style={{ color: '#6b7280', fontSize: 13, margin: 0 }}>
              Hover any row to preview the data slice this lens would expose.
            </p>
            {lensEntries.length === 0 ? (
              <p style={{ color: '#6b7280', fontSize: 14 }}>No views were inferred.</p>
            ) : (
              lensEntries.map(([domain, lens]) => (
                <HoverCard
                  key={`hc-${domain}`}
                  content={() => (
                    <div data-testid={`lens-preview-${domain}`}>
                      <strong style={{ display: 'block', marginBottom: 4 }}>lens.{domain}</strong>
                      <p style={{ margin: 0, fontSize: 13, color: '#374151' }}>
                        {lensPreviewFor(domain)}
                      </p>
                    </div>
                  )}
                  ariaLabel={`Preview of lens.${domain}`}
                >
                  <div data-cir-lens-row={domain}>
                    <TextInput
                      label={lensLabel(domain)}
                      value={lens}
                      onChange={(e) => {
                        patchLens(domain, e.target.value);
                      }}
                    />
                  </div>
                </HoverCard>
              ))
            )}

            <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Rules</h3>
            {profile.rules.length === 0 ? (
              <p style={{ color: '#6b7280', fontSize: 14 }}>No rules were inferred.</p>
            ) : (
              profile.rules.map((rule, idx) => (
                <div
                  key={`rule-${String(idx)}`}
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    padding: 12,
                  }}
                >
                  <Stack direction="vertical" gap="sm">
                    <TextInput
                      label={`Rule scope`}
                      value={rule.scope}
                      onChange={(e) => {
                        patchRule(idx, { ...rule, scope: e.target.value });
                      }}
                    />
                    <TextInput
                      label="Rule"
                      value={rule.rule}
                      onChange={(e) => {
                        patchRule(idx, { ...rule, rule: e.target.value });
                      }}
                    />
                    <label style={{ fontSize: 13, color: '#374151' }}>
                      <input
                        type="checkbox"
                        checked={rule.locked === true}
                        onChange={(e) => {
                          patchRule(idx, { ...rule, locked: e.target.checked });
                        }}
                      />{' '}
                      Locked (cannot be auto-relaxed)
                    </label>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        patchRule(idx, null);
                      }}
                    >
                      Remove rule
                    </Button>
                  </Stack>
                </div>
              ))
            )}

            <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Vocabulary</h3>
            {vocabEntries.length === 0 ? (
              <p style={{ color: '#6b7280', fontSize: 14 }}>No vocabulary entries were inferred.</p>
            ) : (
              vocabEntries.map(([k, v]) => (
                <TextInput
                  key={k}
                  label={k}
                  value={typeof v === 'string' ? v : JSON.stringify(v)}
                  onChange={(e) => {
                    if (!profile) return;
                    patchProfile({ vocabulary: { ...profile.vocabulary, [k]: e.target.value } });
                  }}
                />
              ))
            )}

            <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Live preview</h3>
            <p style={{ color: '#6b7280', fontSize: 13, margin: 0 }}>
              How a row would render with the picks above. Density and color mode update instantly;
              saved state writes when you click Save.
            </p>
            <div
              data-testid="review-density-preview"
              data-density={previewDensity}
              style={{
                border: '1px dashed #d1d5db',
                borderRadius: 8,
                padding: previewRowPadPx + 4,
                background: 'var(--cir-preview-bg, transparent)',
              }}
            >
              {[
                { id: 'r1', title: 'Reply to Alice with cohort retention data', meta: 'due today' },
                { id: 'r2', title: 'Schedule renewal call with Bob', meta: 'due tomorrow' },
                { id: 'r3', title: 'Review Q3 OKRs draft', meta: 'due Tue' },
              ].map((r, i) => (
                <div
                  key={r.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    paddingTop: previewRowPadPx,
                    paddingBottom: previewRowPadPx,
                    borderTop: i === 0 ? 'none' : '1px solid #f3f4f6',
                    fontSize: 13,
                  }}
                >
                  <span>{r.title}</span>
                  <span style={{ color: '#6b7280' }}>{r.meta}</span>
                </div>
              ))}
            </div>

            <Stack direction="horizontal" gap="sm">
              <Button
                variant="primary"
                disabled={saving}
                onClick={() => {
                  save();
                }}
              >
                {saving ? 'Saving…' : 'Save profile'}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  startOver();
                }}
              >
                Start over
              </Button>
            </Stack>
          </Stack>
        </Card>
      </Stack>
    </Container>
  );
}
