// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';

/**
 * ThreadView — renders a single email thread with messages.
 *
 * Each message body is rendered through the sanitized `Markdown` component
 * from `@cir/components` (Phase 4d): GFM tables, autolinks, strikethrough;
 * raw HTML stripped; javascript: URLs dropped; external links get
 * rel=noopener noreferrer + target=_blank.
 *
 * Receives standard data/loading/error props plus action callbacks
 * (`thread_archive`, `task_create_from_thread`) from the @cir/react
 * render-walker.
 */

import { useState } from 'react';
import Link from 'next/link';
import type { ComponentBinding, ActionResult } from '@cir/runtime';
import { Card, Stack, Spinner, Alert, EmptyState, Button, Markdown } from '@cir/components';

interface ThreadMessage {
  id: string;
  from: { name: string; email: string };
  to: { name: string; email: string }[];
  sent_at: string;
  body: string;
}

interface Thread {
  id: string;
  subject: string;
  messages: ThreadMessage[];
}

interface ThreadViewData {
  thread: Thread;
}

interface ThreadViewProps {
  data?: ThreadViewData;
  loading?: boolean;
  error?: Error | null;
  thread_archive?: (input: unknown) => Promise<ActionResult>;
  task_create_from_thread?: (input: unknown) => Promise<ActionResult>;
}

export function ThreadView({
  data,
  loading,
  error,
  thread_archive,
  task_create_from_thread,
}: ThreadViewProps): React.JSX.Element {
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  if (loading) return <Spinner label="Loading thread…" />;
  if (error)
    return (
      <Alert severity="error" title="Couldn't load thread">
        {error.message}
      </Alert>
    );
  if (!data?.thread)
    return (
      <EmptyState
        title="Thread not found"
        description="It may have been deleted or archived."
        action={
          <Link href="/today" className="text-blue-600 hover:underline">
            Back to today
          </Link>
        }
      />
    );

  const { thread } = data;

  return (
    <Stack direction="vertical" gap="md">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <Link href="/today" className="text-sm text-gray-500 hover:text-gray-700">
            ← Today
          </Link>
          <h1 className="text-2xl font-semibold mt-1">{thread.subject}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {thread.messages.length} message{thread.messages.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            variant="secondary"
            disabled={busy || !task_create_from_thread}
            onClick={async () => {
              if (!task_create_from_thread) return;
              setBusy(true);
              try {
                const r = await task_create_from_thread({ thread_id: thread.id });
                if (r.ok) {
                  setToast('Task created');
                  setTimeout(() => setToast(null), 2000);
                }
              } finally {
                setBusy(false);
              }
            }}
          >
            Make task
          </Button>
          <Button
            variant="destructive"
            disabled={busy || !thread_archive}
            onClick={async () => {
              if (!thread_archive) return;
              setBusy(true);
              try {
                await thread_archive({ thread_id: thread.id });
              } finally {
                setBusy(false);
              }
            }}
          >
            Archive
          </Button>
        </div>
      </div>

      {toast && <Alert severity="success" title={toast} />}

      <div data-cir-component="ThreadView">
        <Stack direction="vertical" gap="md">
          {thread.messages.map((msg) => (
            <Card key={msg.id}>
              <div className="border-b border-gray-100 pb-2 mb-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm">{msg.from.name}</span>
                  <span className="text-xs text-gray-500">
                    {new Date(msg.sent_at).toLocaleString()}
                  </span>
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  to {msg.to.map((t) => t.name).join(', ')}
                </div>
              </div>
              <div className="prose prose-sm max-w-none">
                <Markdown content={msg.body} />
              </div>
            </Card>
          ))}
        </Stack>
      </div>
    </Stack>
  );
}

export const THREAD_VIEW_BINDING: ComponentBinding = {
  id: 'ThreadView',
  factory: ThreadView,
};
