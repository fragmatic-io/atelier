// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';

/**
 * `RepoTable` — the `/repos` showcase surface.
 *
 * Renders a dense, GitHub-style table of repositories with mono on
 * `owner/name`, hover-card previews on the repo name, an inline
 * "Create issue" affordance per row, and the standard load / error /
 * empty branches.
 *
 * Manifest contract — accepts the resolver's wrapped `{ repos: [...] }`
 * shape OR a bare array on the `data` prop. Registered in
 * `lib/component-bindings.ts` with `compositionRole: 'table'` so the
 * baseline composition policies (long-list hierarchy, empty/loading/error)
 * apply identically to it as they would to a baseline `<Table>`.
 */

import { useMemo } from 'react';
import { useDispatcher } from '@cir/react';
import { HoverCard, Skeleton } from '@cir/components';
import type { GitHubRepo } from '../lib/github-fixtures';
import { FIXTURE_REPOS } from '../lib/github-fixtures';

interface RepoTableProps {
  data?: unknown;
  loading?: boolean;
  error?: Error | null;
  heading?: string;
  subtitle?: string;
}

function coerceRepos(value: unknown): readonly GitHubRepo[] | null {
  if (Array.isArray(value)) return value as readonly GitHubRepo[];
  if (value !== null && typeof value === 'object') {
    const wrapped = (value as { repos?: unknown }).repos;
    if (Array.isArray(wrapped)) return wrapped as readonly GitHubRepo[];
  }
  return null;
}

function formatUpdated(iso: string): string {
  // Render a relative-ish label without pulling in a date library.
  // The fixtures sit in 2026-04-26..30 — render `Apr 30` style.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function RepoTable({
  data,
  loading,
  error,
  heading = 'Repositories',
  subtitle = '5 repos in fixture. Hover a name for the description; “Create issue” deep-links per row.',
}: RepoTableProps): React.JSX.Element {
  const dispatch = useDispatcher();
  const fromData = useMemo(() => coerceRepos(data), [data]);
  const repos = useMemo<readonly GitHubRepo[]>(() => {
    if (fromData && fromData.length > 0) return fromData;
    return FIXTURE_REPOS;
  }, [fromData]);

  const headerBlock = (
    <header className="mb-4">
      <h1
        className="text-2xl font-semibold tracking-tight"
        style={{ color: 'var(--cir-color-fg)' }}
      >
        {heading}
      </h1>
      <p className="mt-1 text-sm" style={{ color: 'var(--cir-color-fg-muted)' }}>
        {subtitle}
      </p>
    </header>
  );

  if (loading === true && fromData === null) {
    return (
      <div data-cir-component="RepoTable" data-cir-state="loading">
        {headerBlock}
        <div className="space-y-2">
          {[1, 2, 3, 4].map((k) => (
            <div
              key={k}
              className="p-3"
              style={{
                border: '1px solid var(--cir-color-border)',
                borderRadius: 'var(--cir-radius-md)',
                background: 'var(--cir-color-bg-card)',
              }}
            >
              <Skeleton width="30%" height={14} />
              <div className="mt-2">
                <Skeleton width="60%" height={12} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div data-cir-component="RepoTable" data-cir-state="error">
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
          <strong>Failed to load repositories.</strong>{' '}
          <span style={{ color: 'var(--cir-color-fg-muted)' }}>
            {error.message || 'Connect a GitHub token in /settings/github.'}
          </span>
        </div>
      </div>
    );
  }

  if (repos.length === 0) {
    return (
      <div data-cir-component="RepoTable" data-cir-state="empty">
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
            No repositories.
          </div>
          <div className="text-sm mt-1">Connect a GitHub token to load your repos.</div>
        </div>
      </div>
    );
  }

  return (
    <div data-cir-component="RepoTable" data-cir-state="ready">
      {headerBlock}
      <div
        style={{
          border: '1px solid var(--cir-color-border)',
          borderRadius: 'var(--cir-radius-md)',
          overflow: 'hidden',
          background: 'var(--cir-color-bg-card)',
        }}
      >
        <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: 'var(--cir-color-bg-muted)' }}>
              <th
                className="text-left p-2 cir-mono"
                style={{
                  fontSize: '11px',
                  fontWeight: 500,
                  color: 'var(--cir-color-fg-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Repository
              </th>
              <th
                className="text-left p-2 cir-mono"
                style={{
                  fontSize: '11px',
                  fontWeight: 500,
                  color: 'var(--cir-color-fg-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Stars
              </th>
              <th
                className="text-left p-2 cir-mono"
                style={{
                  fontSize: '11px',
                  fontWeight: 500,
                  color: 'var(--cir-color-fg-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Open
              </th>
              <th
                className="text-left p-2 cir-mono"
                style={{
                  fontSize: '11px',
                  fontWeight: 500,
                  color: 'var(--cir-color-fg-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Updated
              </th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {repos.map((repo, i) => {
              const [owner, name] = repo.full_name.split('/');
              return (
                <tr
                  key={repo.id}
                  data-cir-repo-row
                  style={{
                    borderTop: i === 0 ? 'none' : '1px solid var(--cir-color-border)',
                  }}
                >
                  <td className="p-2 align-top">
                    <HoverCard
                      ariaLabel={`Repo ${repo.full_name} preview`}
                      content={
                        <div className="text-sm" data-cir-repo-preview>
                          <div className="font-semibold" style={{ color: 'var(--cir-color-fg)' }}>
                            {repo.full_name}
                          </div>
                          <div className="mt-1" style={{ color: 'var(--cir-color-fg-muted)' }}>
                            {repo.description ?? 'No description'}
                          </div>
                          <div
                            className="cir-mono mt-2"
                            style={{
                              fontSize: '11px',
                              color: 'var(--cir-color-fg-muted)',
                            }}
                          >
                            ★ {String(repo.stargazers_count)} · {String(repo.open_issues_count)}{' '}
                            open · {repo.private ? 'private' : 'public'}
                          </div>
                        </div>
                      }
                    >
                      <a
                        href={repo.html_url}
                        target="_blank"
                        rel="noreferrer"
                        className="cir-mono hover:underline"
                        style={{
                          color: 'var(--cir-color-accent)',
                          fontSize: '13px',
                          fontWeight: 500,
                        }}
                      >
                        <span style={{ color: 'var(--cir-color-fg-muted)' }}>{owner}/</span>
                        {name}
                      </a>
                    </HoverCard>
                    <div
                      className="mt-1"
                      style={{
                        color: 'var(--cir-color-fg-muted)',
                        fontSize: '12px',
                      }}
                    >
                      {repo.description ?? 'No description'}
                    </div>
                  </td>
                  <td
                    className="p-2 cir-mono align-top"
                    style={{ color: 'var(--cir-color-fg-muted)' }}
                  >
                    ★ {String(repo.stargazers_count)}
                  </td>
                  <td
                    className="p-2 cir-mono align-top"
                    style={{ color: 'var(--cir-color-fg-muted)' }}
                  >
                    {String(repo.open_issues_count)}
                  </td>
                  <td
                    className="p-2 cir-mono align-top"
                    style={{ color: 'var(--cir-color-fg-muted)' }}
                  >
                    {formatUpdated(repo.updated_at)}
                  </td>
                  <td className="p-2 align-top text-right">
                    <a
                      href={`/issue/new?repo=${repo.full_name}`}
                      onClick={() => {
                        // Audit-only ping; the new-issue page handles the real form.
                        void dispatch('github.issue.create', {
                          owner,
                          repo: name,
                          intent: 'open_form',
                        }).catch(() => undefined);
                      }}
                      className="cir-mono hover:underline"
                      style={{
                        color: 'var(--cir-color-accent)',
                        fontSize: '12px',
                      }}
                    >
                      Create issue
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
