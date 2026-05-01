// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';

/**
 * `IssueQueue` — the heart of the `/today` showcase.
 *
 * Stitches together six Wave 6/7 affordances against the fixture issue
 * data (or live GitHub data when wired by the proxy):
 *
 *   1. Hierarchy treatment (P-9) — top 3 by salience get
 *      `data-emphasis="hero"`; the rest receive `comfortable`.
 *   2. Optimistic archive (Int-4) — clicking Archive flips the row's
 *      `archived` flag immediately and shows an undo Toast for 5 seconds.
 *      Undo restores the row.
 *   3. Bulk action bar (Int-9) — selectable rows; bulk-archive +
 *      bulk-close (the latter prompts the dispatcher's verbal-required
 *      modal because `confirmation: 'verbal_required'` on the capability).
 *   4. Hover-card mentions (Int-13) — every `#NNN` reference in a body
 *      excerpt becomes a hover card showing the referenced issue.
 *   5. Skeleton-as-shape (Vis-8) — initial render shows row skeletons
 *      until the data arrives.
 *   6. Salience scoring — sort uses the capability's `salience_default`.
 *
 * The component is intentionally bottom-up — it doesn't read the
 * manifest. It does call the dispatcher (via context) so audit events
 * are emitted the same way they would be for a manifest-rendered list.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatcher } from '@cir/react';
import { BulkActionBar, HoverCard, Skeleton, Toast, type BulkAction } from '@cir/components';
import { FIXTURE_ISSUES, findIssueByNumber, type GitHubIssue } from '@/lib/github-fixtures';
import { emphasisFor, rankBySalience } from '@/lib/salience';

interface IssueQueueProps {
  initialIssues?: readonly GitHubIssue[];
}

interface ArchiveSnapshot {
  readonly issueId: number;
  readonly title: string;
  readonly snapshotAt: number;
}

const HASH_REF_RE = /#(\d+)/g;

function MentionAware({ body }: { body: string }) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  for (const match of body.matchAll(HASH_REF_RE)) {
    if (match.index !== undefined && match.index > lastIndex) {
      parts.push(body.slice(lastIndex, match.index));
    }
    const numStr = match[1] ?? '';
    const num = Number.parseInt(numStr, 10);
    const issue = Number.isFinite(num) ? findIssueByNumber(num) : null;
    if (issue !== null) {
      parts.push(
        <HoverCard
          key={`m-${String(match.index ?? 0)}`}
          ariaLabel={`Issue #${String(issue.number)} preview`}
          content={
            <div className="text-sm" data-cir-mention-preview>
              <div className="font-semibold">
                #{issue.number} · {issue.title}
              </div>
              <div className="text-gray-500 dark:text-gray-400 mt-1">
                {issue.repo.owner}/{issue.repo.name} · {issue.state}
              </div>
              <div className="mt-2 text-gray-700 dark:text-gray-300">
                {issue.body.slice(0, 120)}
              </div>
            </div>
          }
        >
          <a
            href={`/issue/${String(issue.number)}`}
            className="cir-mono hover:underline"
            style={{ color: 'var(--cir-color-accent)' }}
            data-cir-mention
          >
            #{issue.number}
          </a>
        </HoverCard>,
      );
    } else {
      parts.push(match[0]);
    }
    lastIndex = (match.index ?? 0) + match[0].length;
  }
  if (lastIndex < body.length) parts.push(body.slice(lastIndex));
  return <>{parts}</>;
}

export function IssueQueue({ initialIssues }: IssueQueueProps): React.JSX.Element {
  const dispatch = useDispatcher();
  const [loaded, setLoaded] = useState(initialIssues !== undefined);
  const [issues, setIssues] = useState<readonly GitHubIssue[]>(initialIssues ?? FIXTURE_ISSUES);
  const [archived, setArchived] = useState<ReadonlySet<number>>(new Set());
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [snapshot, setSnapshot] = useState<ArchiveSnapshot | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Skeleton-as-shape: simulate a small delay so the empty/loaded
  // transition is visible in the demo. In production the resolver
  // streams data and this delay collapses.
  useEffect(() => {
    if (initialIssues) return;
    const t = setTimeout(() => {
      setIssues(FIXTURE_ISSUES);
      setLoaded(true);
    }, 250);
    return () => clearTimeout(t);
  }, [initialIssues]);

  const visible = useMemo(() => {
    const active = issues.filter((i) => !archived.has(i.id));
    return rankBySalience(active);
  }, [issues, archived]);

  function toggleSelect(id: number): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function archiveOne(issue: GitHubIssue): void {
    // Optimistic: flip the flag immediately, then dispatch.
    setArchived((prev) => {
      const next = new Set(prev);
      next.add(issue.id);
      return next;
    });
    setSnapshot({ issueId: issue.id, title: issue.title, snapshotAt: Date.now() });
    if (undoTimerRef.current !== null) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => {
      setSnapshot(null);
    }, 5000);
    void dispatch('github.issue.archive', {
      owner: issue.repo.owner,
      repo: issue.repo.name,
      issue_number: issue.number,
    }).catch(() => {
      // Roll back on dispatch failure.
      setArchived((prev) => {
        const next = new Set(prev);
        next.delete(issue.id);
        return next;
      });
      setSnapshot(null);
    });
  }

  function undoArchive(): void {
    if (snapshot === null) return;
    setArchived((prev) => {
      const next = new Set(prev);
      next.delete(snapshot.issueId);
      return next;
    });
    setSnapshot(null);
    if (undoTimerRef.current !== null) clearTimeout(undoTimerRef.current);
  }

  async function bulkArchive(): Promise<void> {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setArchived((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
    setSelected(new Set());
    // Audit a single fan-out event so the audit stream reflects the bulk.
    void dispatch('github.issue.archive', { issue_ids: ids.map(String) }).catch(() => undefined);
  }

  async function bulkClose(): Promise<void> {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    try {
      await dispatch('github.issue.bulk_close', {
        issue_ids: ids.map(String),
        reason: 'completed',
      });
      setArchived((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.add(id);
        return next;
      });
      setSelected(new Set());
    } catch {
      // The dispatcher's confirm UI cancelled the action — leave state alone.
    }
  }

  const bulkActions: BulkAction[] = [
    { id: 'archive', label: 'Archive' },
    {
      id: 'close',
      label: 'Close issue',
      variant: 'destructive',
      confirmation: 'verbal_required',
    },
  ];

  function onBulkAction(actionId: string): void {
    if (actionId === 'archive') void bulkArchive();
    else if (actionId === 'close') void bulkClose();
  }

  return (
    <div data-cir-component="IssueQueue">
      {!loaded ? (
        <ul aria-busy="true" className="space-y-2">
          {[1, 2, 3, 4].map((k) => (
            <li key={k} className="p-3 border rounded">
              <Skeleton width="40%" height={16} />
              <div className="mt-2">
                <Skeleton width="80%" height={12} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <ul
          data-cir-component="List"
          data-cir-list-variant="hierarchy"
          className="divide-y divide-gray-200 dark:divide-gray-800"
        >
          {visible.map(({ issue }, idx) => {
            const emphasis = emphasisFor(idx);
            const isArchived = archived.has(issue.id);
            return (
              <li
                key={issue.id}
                data-emphasis={emphasis}
                data-archived={isArchived ? 'true' : 'false'}
                data-cir-issue-row
                className="p-3"
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selected.has(issue.id)}
                    onChange={() => toggleSelect(issue.id)}
                    aria-label={`Select issue ${String(issue.number)}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <a
                        href={`/issue/${String(issue.number)}`}
                        className="hover:underline"
                        style={{ color: 'var(--cir-color-fg)' }}
                        data-cir-issue-link
                      >
                        <span className="cir-mono" style={{ color: 'var(--cir-color-fg-muted)' }}>
                          #{issue.number}
                        </span>{' '}
                        {issue.title}
                      </a>
                      {issue.assigned_to_me ? (
                        <span
                          className="text-xs px-1.5 py-0.5 rounded cir-mono"
                          style={{
                            background:
                              'color-mix(in srgb, var(--cir-color-brand) 12%, transparent)',
                            color: 'var(--cir-color-brand)',
                          }}
                        >
                          you
                        </span>
                      ) : null}
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                      <MentionAware body={issue.body} />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => archiveOne(issue)}
                    className="text-xs px-2 py-1 rounded bg-gray-200 hover:bg-gray-300"
                    data-cir-action="archive"
                  >
                    Archive
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <BulkActionBar
        actions={bulkActions}
        selectionCount={selected.size}
        onAction={onBulkAction}
        onClear={() => setSelected(new Set())}
      />

      <Toast
        open={snapshot !== null}
        message={snapshot === null ? '' : `Archived "${snapshot.title}". Undo?`}
        onClose={() => setSnapshot(null)}
        variant="info"
        duration={5000}
      />

      {snapshot !== null ? (
        <button
          type="button"
          onClick={undoArchive}
          className="fixed bottom-6 right-6 z-50 px-3 py-1 rounded"
          style={{
            background: 'var(--cir-color-brand)',
            color: 'var(--cir-color-brand-fg)',
            boxShadow: 'var(--cir-shadow-popover)',
          }}
        >
          Undo archive
        </button>
      ) : null}
    </div>
  );
}
