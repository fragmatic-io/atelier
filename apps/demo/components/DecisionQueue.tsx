// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';

/**
 * DecisionQueue — domain component for the email triage demo.
 * Renders a list of threads requiring a decision, with two actions per row:
 * "Make task" → task.create_from_thread, "Archive" → thread.archive.
 *
 * Receives the standard data/loading/error props plus action callbacks
 * (capability dot-paths sanitized to underscores) from the @cir/react
 * render-walker.
 */

import { useState } from 'react';
import Link from 'next/link';
import type { ComponentBinding, ActionResult } from '@cir/runtime';
import { Card, Spinner, Alert, EmptyState, Button } from '@cir/components';

interface Thread {
  id: string;
  sender: { name: string; email: string };
  subject: string;
  snippet: string;
  received_at: string;
  requires_decision: boolean;
}

interface DecisionQueueData {
  threads: Thread[];
}

interface DecisionQueueProps {
  data?: DecisionQueueData;
  loading?: boolean;
  error?: Error | null;
  thread_archive?: (input: unknown) => Promise<ActionResult>;
  task_create_from_thread?: (input: unknown) => Promise<ActionResult>;
}

const PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

function stableColorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length] ?? PALETTE[0]!;
}

export function DecisionQueue({
  data,
  loading,
  error,
  thread_archive,
  task_create_from_thread,
}: DecisionQueueProps): React.JSX.Element {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string): void => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  };

  if (loading) return <Spinner label="Loading decisions…" />;
  if (error)
    return (
      <Alert severity="error" title="Couldn't load decisions">
        {error.message}
      </Alert>
    );
  const threads = data?.threads ?? [];
  if (threads.length === 0)
    return <EmptyState title="Inbox zero" description="No decisions waiting." />;

  return (
    <Card title="Decisions to make today">
      <div data-cir-component="DecisionQueue">
        {toast && (
          <div className="mb-3">
            <Alert severity="success" title={toast} />
          </div>
        )}
        {threads.map((t) => {
          const initial = (t.sender.name[0] ?? '?').toUpperCase();
          const busy = busyId === t.id;
          return (
            <div key={t.id} data-cir-row>
              <div data-cir-avatar style={{ background: stableColorFor(t.sender.email) }}>
                {initial}
              </div>
              <div className="flex-1 min-w-0">
                <Link href={`/thread/${t.id}`} data-cir-thread-link>
                  {t.subject}
                </Link>
                <div data-cir-snippet>
                  <span className="text-gray-700">{t.sender.name}</span>
                  {' — '}
                  {t.snippet}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  disabled={busy || !task_create_from_thread}
                  onClick={async () => {
                    if (!task_create_from_thread) return;
                    setBusyId(t.id);
                    try {
                      const r = await task_create_from_thread({ thread_id: t.id });
                      if (r.ok) showToast('Task created');
                    } finally {
                      setBusyId(null);
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
                    setBusyId(t.id);
                    try {
                      await thread_archive({ thread_id: t.id });
                    } finally {
                      setBusyId(null);
                    }
                  }}
                >
                  Archive
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export const DECISION_QUEUE_BINDING: ComponentBinding = {
  id: 'DecisionQueue',
  factory: DecisionQueue,
};
