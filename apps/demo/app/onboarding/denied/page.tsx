// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';

/**
 * Dead-end "you must grant something" page. The demo can't render its
 * decision queue without `lens.today` because the entire UI is gated on
 * having read access; we honor the user's "deny" by not pretending we
 * can show anything useful.
 */

import { useRouter } from 'next/navigation';
import { Alert, Button, Card, Container, Stack } from '@cir/components';

export default function OnboardingDeniedPage(): React.JSX.Element {
  const router = useRouter();
  return (
    <Container maxWidth="sm" padding="md">
      <Card title="Permission denied">
        <Stack direction="vertical" gap="md">
          <Alert severity="warning" title="This demo needs at least one lens granted">
            The email-triage demo can&apos;t render its routes without read access to{' '}
            <code>lens.today</code>. Your refusal is recorded for this session (no profile was
            written). You can restart the onboarding flow whenever you&apos;re ready.
          </Alert>
          <Button
            variant="primary"
            onClick={() => {
              router.push('/onboarding');
            }}
          >
            Restart onboarding
          </Button>
        </Stack>
      </Card>
    </Container>
  );
}
