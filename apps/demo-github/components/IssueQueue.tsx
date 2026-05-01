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
 * Manifest contract — when rendered through the manifest pipeline the
 * runtime threads `data`, `loading`, and `error` props from the resolved
 * binding. We accept either:
 *   - `data: GitHubIssue[]` (a bare array)
 *   - `data: { issues: GitHubIssue[] }` (the wrapped shape the
 *     `/api/data/github.issue.list` proxy returns)
 *   - `initialIssues` (legacy direct-import path; still used by tests)
 *
 * The component renders a skeleton block while `loading`, an error alert
 * when `error` is set, an empty state when there are no issues, and the
 * rich queue otherwise. The `<RenderNode>` walker pairs this with the
 * manifest's empty/loading/error sibling nodes via the
 * `compositionRole: 'list'` role we register the binding under.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatcher } from '@cir/react';
import { BulkActionBar, HoverCard, Skeleton, Toast, type BulkAction } from '@cir/components';
import { FIXTURE_ISSUES, findIssueByNumber, type GitHubIssue } from '../lib/github-fixtures';
import { emphasisFor, rankBySalience } from '../lib/salience';

interface IssueQueueProps {
  /** Direct fixture path — the legacy `/today` page used this. */
  initialIssues?: readonly GitHubIssue[];
  /**
   * Manifest-pipeline path. The data resolver returns either a bare array
   * or the wrapped `{ issues: [...] }` shape; we accept both. `unknown` so
   * we don't lock in a particular wrapper before introspecting.
   */
  data?: unknown;
  /** Manifest-pipeline `loading` prop (true while resolver is pending). */
  loading?: boolean;
  /** Manifest-pipeline `error` prop (Error when the resolver failed). */
  error?: Error | null;
  /** Per-route subtitle used above the queue. */
  subtitle?: string;
  /** Heading rendered above the queue. */
  heading?: string;
}

interface ArchiveSnapshot {
  readonly issueId: number;
  readonly title: string;
  readonly snapshotAt: number;
}

const HASH_REF_RE = /#(\d+)/g;

/**
 * Extract the issues array from whatever the resolver handed us. Supports
 * the wrapped `{ issues }` shape the demo's `/api/data` proxy returns and
 * the bare-array shape `MockDataResolver` may emit.
 */
function coerceIssues(value: unknown): readonly GitHubIssue[] | null {
  if (Array.isArray(value)) return value as readonly GitHubIssue[];
  if (value !== null && typeof value === 'object') {
    const wrapped = (value as { issues?: unknown }).issues;
    if (Array.isArray(wrapped)) return wrapped as readonly GitHubIssue[];
  }
  return null;
}

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

export function IssueQueue({
  initialIssues,
  data,
  loading,
  error,
  subtitle,
  heading,
}: IssueQueueProps): React.JSX.Element {
  const dispatch = useDispatcher();

  // Source-of-truth for issues: prefer manifest-pipeline `data`, fall back
  // to `initialIssues`, then to fixtures so the demo never renders blank.
  const fromData = useMemo(() => coerceIssues(data), [data]);
  const sourceIssues = useMemo<readonly GitHubIssue[]>(() => {
    if (fromData && fromData.length > 0) return fromData;
    if (initialIssues && initialIssues.length > 0) return initialIssues;
    return FIXTURE_ISSUES;
  }, [fromData, initialIssues]);

  const [issues, setIssues] = useState<readonly GitHubIssue[]>(sourceIssues);
  // Re-sync when the manifest re-resolves with a different snapshot.
  useEffect(() => {
    setIssues(sourceIssues);
  }, [sourceIssues]);

  const [archived, setArchived] = useState<ReadonlySet<number>>(new Set());
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [snapshot, setSnapshot] = useState<ArchiveSnapshot | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // ---------------------------------------------------------------------
  // Render branches: loading → error → empty → queue. Each renders the
  // surrounding heading + subtitle so the page chrome stays consistent.
  // ---------------------------------------------------------------------

  const headerBlock = (
    <header className="mb-4">
      {heading !== undefined ? (
        <h1
          className="text-2xl font-semibold tracking-tight"
          style={{ color: 'var(--cir-color-fg)' }}
        >
          {heading}
        </h1>
      ) : null}
      {subtitle !== undefined ? (
        <p className="mt-1 text-sm" style={{ color: 'var(--cir-color-fg-muted)' }}>
          {subtitle}
        </p>
      ) : null}
    </header>
  );

  if (loading === true && fromData === null) {
    return (
      <div data-cir-component="IssueQueue" data-cir-state="loading">
        {headerBlock}
        <ul aria-busy="true" className="space-y-2">
          {[1, 2, 3, 4, 5].map((k) => (
            <li
              key={k}
              className="p-3"
              style={{
                border: '1px solid var(--cir-color-border)',
                borderRadius: 'var(--cir-radius-md)',
                background: 'var(--cir-color-bg-card)',
              }}
            >
              <Skeleton width="40%" height={16} />
              <div className="mt-2">
                <Skeleton width="80%" height={12} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (error) {
    return (
      <div data-cir-component="IssueQueue" data-cir-state="error">
        {headerBlock}
        <div
          role="alert"
          className="p-4 text-sm"
          style={{
            border: '1px solid var(--cir-color-danger)',
            borderRadius: 'var(--cir-radius-md)',
            background: 'color-mix(in srgb, var(--cir-color-danger) 8%, transparent)',
            color: 'var(--cir-color-danger)',
          }}
        >
          <strong>Failed to load issues.</strong>{' '}
          <span style={{ color: 'var(--cir-color-fg-muted)' }}>
            {error.message || 'Check your token in /settings/github.'}
          </span>
        </div>
      </div>
    );
  }

  if (visible.length === 0) {
    return (
      <div data-cir-component="IssueQueue" data-cir-state="empty">
        {headerBlock}
        <div
          className="p-8 text-center"
          style={{
            border: '1px dashed var(--cir-color-border)',
            borderRadius: 'var(--cir-radius-md)',
            background: 'var(--cir-color-bg-card)',
            color: 'var(--cir-color-fg-muted)',
          }}
        >
          <div className="text-base font-medium" style={{ color: 'var(--cir-color-fg)' }}>
            Inbox zero.
          </div>
          <div className="text-sm mt-1">No issues need a decision right now.</div>
        </div>
      </div>
    );
  }

  return (
    <div data-cir-component="IssueQueue" data-cir-state="ready">
      {headerBlock}
      <ul
        data-cir-component="List"
        data-cir-list-variant="hierarchy"
        className="space-y-px"
        style={{
          border: '1px solid var(--cir-color-border)',
          borderRadius: 'var(--cir-radius-md)',
          overflow: 'hidden',
          background: 'var(--cir-color-bg-card)',
        }}
      >
        {visible.map(({ issue }, idx) => {
          const emphasis = emphasisFor(idx);
          const isArchived = archived.has(issue.id);
          const isHero = emphasis === 'hero';
          return (
            <li
              key={issue.id}
              data-emphasis={emphasis}
              data-archived={isArchived ? 'true' : 'false'}
              data-cir-issue-row
              className="p-3 flex items-start gap-3"
              style={{
                borderLeft: isHero ? `4px solid var(--cir-color-brand)` : `4px solid transparent`,
                background:
                  idx % 2 === 0 ? 'var(--cir-color-bg-card)' : 'var(--cir-color-bg-muted)',
                borderTop: idx === 0 ? 'none' : '1px solid var(--cir-color-border)',
              }}
            >
              <input
                type="checkbox"
                checked={selected.has(issue.id)}
                onChange={() => toggleSelect(issue.id)}
                aria-label={`Select issue ${String(issue.number)}`}
                style={{ marginTop: 4 }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <a
                    href={`/issue/${String(issue.number)}`}
                    className="hover:underline"
                    style={{
                      color: 'var(--cir-color-fg)',
                      fontWeight: 600,
                      fontSize: '14px',
                    }}
                    data-cir-issue-link
                  >
                    {issue.title}
                  </a>
                  <span
                    className="cir-mono"
                    style={{
                      color: 'var(--cir-color-fg-muted)',
                      fontSize: '12px',
                    }}
                  >
                    {issue.repo.owner}/{issue.repo.name}#{issue.number}
                  </span>
                  {issue.assigned_to_me ? (
                    <span
                      className="cir-mono"
                      style={{
                        fontSize: '11px',
                        padding: '1px 6px',
                        borderRadius: '999px',
                        background: 'color-mix(in srgb, var(--cir-color-brand) 14%, transparent)',
                        color: 'var(--cir-color-brand)',
                      }}
                    >
                      you
                    </span>
                  ) : (
                    <span
                      className="cir-mono"
                      style={{
                        fontSize: '11px',
                        padding: '1px 6px',
                        borderRadius: '999px',
                        background: 'var(--cir-color-bg-muted)',
                        color: 'var(--cir-color-fg-muted)',
                      }}
                    >
                      team
                    </span>
                  )}
                  {issue.priority === 'high' ? (
                    <span
                      className="cir-mono"
                      style={{
                        fontSize: '11px',
                        padding: '1px 6px',
                        borderRadius: '999px',
                        background: 'color-mix(in srgb, var(--cir-color-danger) 14%, transparent)',
                        color: 'var(--cir-color-danger)',
                      }}
                    >
                      high
                    </span>
                  ) : null}
                </div>
                <div
                  className="mt-1"
                  style={{
                    color: 'var(--cir-color-fg-muted)',
                    fontSize: '13px',
                    lineHeight: 1.4,
                  }}
                >
                  <MentionAware body={issue.body} />
                </div>
              </div>
              <button
                type="button"
                onClick={() => archiveOne(issue)}
                className="cir-mono"
                style={{
                  fontSize: '12px',
                  padding: '4px 10px',
                  borderRadius: 'var(--cir-radius-sm)',
                  border: '1px solid var(--cir-color-border)',
                  background: 'transparent',
                  color: 'var(--cir-color-fg-muted)',
                  cursor: 'pointer',
                }}
                data-cir-action="archive"
              >
                Archive
              </button>
            </li>
          );
        })}
      </ul>

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
          className="fixed bottom-6 right-6 z-50 px-3 py-1 rounded cir-mono"
          style={{
            background: 'var(--cir-color-brand)',
            color: 'var(--cir-color-brand-fg)',
            boxShadow: 'var(--cir-shadow-popover)',
            fontSize: '12px',
          }}
        >
          Undo archive
        </button>
      ) : null}
    </div>
  );
}
