// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';

/**
 * LLM-assisted onboarding — alternative to the checkbox grant flow.
 *
 * The user describes themselves in a few sentences. We POST that to
 * `/api/cir/onboarding/compile`, which calls Gemini (or the deterministic
 * fallback) to translate the prose into a draft `IntentProfile`. The draft
 * is stashed in `sessionStorage` and the user is bounced to
 * `/onboarding/review`, which is the human gate before persistence.
 *
 * Privacy posture: the description leaves on the wire ONCE (server → Gemini)
 * and is then dropped on the floor server-side. Only the structured profile
 * is persisted, and only when the user clicks "Save" on the review page.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Card, Container, Stack } from '@cir/components';
import type { IntentProfile } from '@cir/schemas';
import { DEMO_USER_ID } from '@/lib/intent-store';

export const SESSION_DRAFT_KEY = 'cir.demo.intent.draft';

const MAX_LEN = 1500;

export default function OnboardingDescribePage(): React.JSX.Element {
  const router = useRouter();
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const overLimit = text.length > MAX_LEN;
  const empty = text.trim().length === 0;

  async function compile(): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/cir/onboarding/compile', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ description: text, user_id: DEMO_USER_ID }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Compile failed (${String(res.status)})`);
        setSubmitting(false);
        return;
      }
      const body = (await res.json()) as { profile: IntentProfile; compiler_model: string };
      sessionStorage.setItem(SESSION_DRAFT_KEY, JSON.stringify(body));
      router.push('/onboarding/review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'network error');
      setSubmitting(false);
    }
  }

  return (
    <Container maxWidth="sm" padding="md">
      <Stack direction="vertical" gap="lg">
        <Card title="Describe yourself in a few sentences">
          <Stack direction="vertical" gap="md">
            <Alert severity="info" title="What happens to your description">
              Your description is sent to Gemini once and discarded server-side. Only the structured
              profile is persisted, and only after you review and approve it on the next screen.
            </Alert>
            <p style={{ color: '#374151' }}>
              Example: &ldquo;I review GitHub PRs in the morning, I shop online a lot, I prefer
              compact UIs and dark mode, and I&apos;m wary of automation.&rdquo;
            </p>
            <textarea
              aria-label="Describe yourself"
              placeholder="Tell us how you'd like the app to behave..."
              value={text}
              onChange={(e) => {
                setText(e.target.value);
              }}
              rows={8}
              style={{
                width: '100%',
                padding: 12,
                border: '1px solid #d1d5db',
                borderRadius: 8,
                fontSize: 14,
                fontFamily: 'inherit',
              }}
            />
            <div style={{ color: overLimit ? '#b91c1c' : '#6b7280', fontSize: 12 }}>
              {String(text.length)} / {String(MAX_LEN)} characters
            </div>
            {error !== null ? (
              <Alert severity="error" title="Compile failed">
                {error}
              </Alert>
            ) : null}
            <Stack direction="horizontal" gap="sm">
              <Button
                variant="primary"
                disabled={empty || overLimit || submitting}
                onClick={() => {
                  void compile();
                }}
              >
                {submitting ? 'Compiling…' : 'Compile my profile'}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  router.push('/onboarding');
                }}
              >
                Back to checkbox flow
              </Button>
            </Stack>
          </Stack>
        </Card>
      </Stack>
    </Container>
  );
}
