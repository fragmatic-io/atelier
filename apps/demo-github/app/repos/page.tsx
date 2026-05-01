// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';

/**
 * `/repos` — the repository browser. Renders a `<Table>` of repos with
 * `<HoverCard>` popovers showing recent activity for each row. Read-only
 * surface; the only action is "create issue" which deep-links to
 * `/issue/new` with the repo pre-filled.
 */

import { useMemo } from 'react';
import Link from 'next/link';
import { HoverCard, Stack, Table, type TableColumn, type TableRowSpec } from '@cir/components';
import { FIXTURE_ISSUES, FIXTURE_REPOS, type GitHubRepo } from '@/lib/github-fixtures';

function repoToRow(r: GitHubRepo): TableRowSpec {
  const owner = r.full_name.split('/')[0] ?? '';
  return {
    name: (
      <HoverCard
        ariaLabel={`Repository ${r.full_name} preview`}
        content={() => recentActivityFor(r)}
      >
        <Link
          href={`/issue/new?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(r.name)}`}
        >
          {r.full_name}
        </Link>
      </HoverCard>
    ),
    description: r.description ?? '',
    open: r.open_issues_count,
    updated: r.updated_at.slice(0, 10),
  };
}

function recentActivityFor(repo: GitHubRepo): React.ReactNode {
  const issues = FIXTURE_ISSUES.filter(
    (i) => i.repo.owner === repo.full_name.split('/')[0] && i.repo.name === repo.name,
  ).slice(0, 3);
  return (
    <div className="text-sm">
      <div className="font-semibold">{repo.full_name}</div>
      <div className="text-gray-500 mt-1">
        {repo.stargazers_count} stars · {repo.open_issues_count} open issues
      </div>
      {issues.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {issues.map((i) => (
            <li key={i.id} className="text-gray-700 dark:text-gray-300">
              <span className="text-gray-500">#{i.number}</span> {i.title}
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-2 text-gray-500">No recent issues.</div>
      )}
    </div>
  );
}

export default function ReposPage(): React.JSX.Element {
  const rows = useMemo(() => FIXTURE_REPOS.map(repoToRow), []);

  const columns: TableColumn[] = [
    { key: 'name', header: 'Repository' },
    { key: 'description', header: 'Description' },
    { key: 'open', header: 'Open' },
    { key: 'updated', header: 'Updated' },
  ];

  return (
    <main className="max-w-screen-lg mx-auto px-4 py-6">
      <Stack direction="vertical" gap="lg">
        <h1 className="text-xl font-semibold">Repositories</h1>
        <Table columns={columns} rows={rows} />
      </Stack>
    </main>
  );
}
