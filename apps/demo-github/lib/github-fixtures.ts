// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Inline fixture data so the demo boots without a GitHub token. Five
 * repos, twelve issues spread across them. The fixture surface mirrors
 * the GitHub REST API's repo/issue object shape (keys the data resolver
 * exposes downstream) so the demo can swap from fixture to live with no
 * UI changes.
 *
 * Notes for reviewers:
 *  - Numbers are sequential within a repo (closest to GitHub semantics).
 *  - `salience` is computed by `lib/salience.ts` from urgency / recency /
 *    assigned_to_me — the fixture only carries inputs.
 *  - Fixtures are read-only: the demo's optimistic-archive UX flips a
 *    client-side `archived` flag that does NOT mutate this file.
 */

export interface GitHubRepo {
  readonly id: number;
  readonly name: string;
  readonly full_name: string;
  readonly private: boolean;
  readonly html_url: string;
  readonly description: string | null;
  readonly stargazers_count: number;
  readonly open_issues_count: number;
  readonly updated_at: string;
}

export type IssuePriority = 'high' | 'medium' | 'low';

export interface GitHubIssue {
  readonly id: number;
  readonly number: number;
  readonly title: string;
  readonly state: 'open' | 'closed';
  readonly body: string;
  readonly user: { readonly login: string; readonly avatar_url: string };
  readonly assignees: ReadonlyArray<{ readonly login: string }>;
  readonly assigned_to_me: boolean;
  readonly labels: ReadonlyArray<{ readonly name: string; readonly color: string }>;
  readonly repo: { readonly owner: string; readonly name: string };
  readonly priority: IssuePriority;
  readonly urgency: number;
  readonly recency: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly comments: number;
  readonly html_url: string;
  readonly requires_decision: boolean;
}

export const FIXTURE_REPOS: readonly GitHubRepo[] = [
  {
    id: 1,
    name: 'cir',
    full_name: 'fragmatic-io/cir',
    private: false,
    html_url: 'https://github.com/fragmatic-io/cir',
    description: 'Capability · Intent · Render — production architecture for dynamic UI',
    stargazers_count: 128,
    open_issues_count: 6,
    updated_at: '2026-04-30T12:00:00Z',
  },
  {
    id: 2,
    name: 'demo',
    full_name: 'fragmatic-io/demo',
    private: false,
    html_url: 'https://github.com/fragmatic-io/demo',
    description: 'CIR reference demo app',
    stargazers_count: 42,
    open_issues_count: 2,
    updated_at: '2026-04-29T09:00:00Z',
  },
  {
    id: 3,
    name: 'sdk',
    full_name: 'fragmatic-io/sdk',
    private: false,
    html_url: 'https://github.com/fragmatic-io/sdk',
    description: 'Host SDK + capability registries',
    stargazers_count: 19,
    open_issues_count: 1,
    updated_at: '2026-04-28T15:30:00Z',
  },
  {
    id: 4,
    name: 'recipes',
    full_name: 'fragmatic-io/recipes',
    private: true,
    html_url: 'https://github.com/fragmatic-io/recipes',
    description: 'Internal recipes catalog',
    stargazers_count: 3,
    open_issues_count: 2,
    updated_at: '2026-04-27T10:00:00Z',
  },
  {
    id: 5,
    name: 'docs',
    full_name: 'fragmatic-io/docs',
    private: false,
    html_url: 'https://github.com/fragmatic-io/docs',
    description: 'Public documentation site',
    stargazers_count: 8,
    open_issues_count: 1,
    updated_at: '2026-04-26T18:00:00Z',
  },
];

export const FIXTURE_ISSUES: readonly GitHubIssue[] = [
  {
    id: 101,
    number: 412,
    title: 'Manifest cache thrashes on rapid intent edits',
    state: 'open',
    body: 'When the user edits intent rapidly, the cache invalidation in #408 fires too eagerly. See discussion in #410.',
    user: { login: 'maya', avatar_url: '' },
    assignees: [{ login: 'demo-user' }],
    assigned_to_me: true,
    labels: [
      { name: 'bug', color: 'd73a4a' },
      { name: 'priority:high', color: 'b60205' },
    ],
    repo: { owner: 'fragmatic-io', name: 'cir' },
    priority: 'high',
    urgency: 0.95,
    recency: 0.98,
    created_at: '2026-04-30T08:00:00Z',
    updated_at: '2026-04-30T11:30:00Z',
    comments: 4,
    html_url: 'https://github.com/fragmatic-io/cir/issues/412',
    requires_decision: true,
  },
  {
    id: 102,
    number: 411,
    title: 'Vault client retries on 401',
    state: 'open',
    body: 'The vault client should NOT retry on 401 — see #405 for the spec. Pairs with #412.',
    user: { login: 'kenji', avatar_url: '' },
    assignees: [{ login: 'demo-user' }],
    assigned_to_me: true,
    labels: [
      { name: 'bug', color: 'd73a4a' },
      { name: 'priority:high', color: 'b60205' },
    ],
    repo: { owner: 'fragmatic-io', name: 'cir' },
    priority: 'high',
    urgency: 0.9,
    recency: 0.95,
    created_at: '2026-04-30T07:00:00Z',
    updated_at: '2026-04-30T10:00:00Z',
    comments: 2,
    html_url: 'https://github.com/fragmatic-io/cir/issues/411',
    requires_decision: true,
  },
  {
    id: 103,
    number: 410,
    title: 'HoverCard close-delay races on touch',
    state: 'open',
    body: 'Touch users see the card flicker when moving across triggers. Re-tested against #412 hierarchy.',
    user: { login: 'priya', avatar_url: '' },
    assignees: [{ login: 'demo-user' }],
    assigned_to_me: true,
    labels: [
      { name: 'bug', color: 'd73a4a' },
      { name: 'priority:medium', color: 'fbca04' },
    ],
    repo: { owner: 'fragmatic-io', name: 'cir' },
    priority: 'medium',
    urgency: 0.7,
    recency: 0.92,
    created_at: '2026-04-29T14:00:00Z',
    updated_at: '2026-04-30T09:00:00Z',
    comments: 1,
    html_url: 'https://github.com/fragmatic-io/cir/issues/410',
    requires_decision: true,
  },
  {
    id: 104,
    number: 409,
    title: 'Skeleton-as-shape sizing on narrow viewports',
    state: 'open',
    body: 'On <380px, skeleton rows in /today collapse — break vs. shrink? Reviewers: see #410.',
    user: { login: 'sam', avatar_url: '' },
    assignees: [],
    assigned_to_me: false,
    labels: [{ name: 'design', color: '0075ca' }],
    repo: { owner: 'fragmatic-io', name: 'cir' },
    priority: 'medium',
    urgency: 0.55,
    recency: 0.88,
    created_at: '2026-04-29T11:00:00Z',
    updated_at: '2026-04-29T18:00:00Z',
    comments: 3,
    html_url: 'https://github.com/fragmatic-io/cir/issues/409',
    requires_decision: true,
  },
  {
    id: 105,
    number: 408,
    title: 'Cache invalidation lags on intent edits',
    state: 'open',
    body: 'Tracking issue. See #412 for the user-visible symptom.',
    user: { login: 'maya', avatar_url: '' },
    assignees: [],
    assigned_to_me: false,
    labels: [{ name: 'enhancement', color: 'a2eeef' }],
    repo: { owner: 'fragmatic-io', name: 'cir' },
    priority: 'medium',
    urgency: 0.5,
    recency: 0.85,
    created_at: '2026-04-28T13:00:00Z',
    updated_at: '2026-04-29T09:00:00Z',
    comments: 0,
    html_url: 'https://github.com/fragmatic-io/cir/issues/408',
    requires_decision: false,
  },
  {
    id: 106,
    number: 92,
    title: 'Demo: docs link in header points to dead anchor',
    state: 'open',
    body: 'Header link `Docs → Capabilities` 404s. Trivial fix.',
    user: { login: 'priya', avatar_url: '' },
    assignees: [{ login: 'demo-user' }],
    assigned_to_me: true,
    labels: [{ name: 'docs', color: '0075ca' }],
    repo: { owner: 'fragmatic-io', name: 'demo' },
    priority: 'low',
    urgency: 0.2,
    recency: 0.6,
    created_at: '2026-04-27T08:00:00Z',
    updated_at: '2026-04-28T08:00:00Z',
    comments: 0,
    html_url: 'https://github.com/fragmatic-io/demo/issues/92',
    requires_decision: true,
  },
  {
    id: 107,
    number: 91,
    title: 'Add /repos hover-card preview',
    state: 'open',
    body: 'Match #410 hover-card pattern on the /repos table. Track Int-13.',
    user: { login: 'sam', avatar_url: '' },
    assignees: [],
    assigned_to_me: false,
    labels: [{ name: 'enhancement', color: 'a2eeef' }],
    repo: { owner: 'fragmatic-io', name: 'demo' },
    priority: 'medium',
    urgency: 0.4,
    recency: 0.7,
    created_at: '2026-04-26T10:00:00Z',
    updated_at: '2026-04-27T15:00:00Z',
    comments: 0,
    html_url: 'https://github.com/fragmatic-io/demo/issues/91',
    requires_decision: true,
  },
  {
    id: 108,
    number: 24,
    title: 'SDK: typings for HeaderProvider lose readonly',
    state: 'open',
    body: 'Types regression in 0.4.2. Pairs with #411.',
    user: { login: 'kenji', avatar_url: '' },
    assignees: [],
    assigned_to_me: false,
    labels: [
      { name: 'bug', color: 'd73a4a' },
      { name: 'priority:medium', color: 'fbca04' },
    ],
    repo: { owner: 'fragmatic-io', name: 'sdk' },
    priority: 'medium',
    urgency: 0.4,
    recency: 0.65,
    created_at: '2026-04-25T08:00:00Z',
    updated_at: '2026-04-26T09:00:00Z',
    comments: 1,
    html_url: 'https://github.com/fragmatic-io/sdk/issues/24',
    requires_decision: true,
  },
  {
    id: 109,
    number: 11,
    title: 'recipes: github-reviewer manifest stub',
    state: 'open',
    body: 'Initial stub for the github-reviewer persona. Iterates on #412 / #411 hierarchy.',
    user: { login: 'maya', avatar_url: '' },
    assignees: [{ login: 'demo-user' }],
    assigned_to_me: true,
    labels: [{ name: 'enhancement', color: 'a2eeef' }],
    repo: { owner: 'fragmatic-io', name: 'recipes' },
    priority: 'medium',
    urgency: 0.5,
    recency: 0.6,
    created_at: '2026-04-26T08:00:00Z',
    updated_at: '2026-04-27T12:00:00Z',
    comments: 0,
    html_url: 'https://github.com/fragmatic-io/recipes/issues/11',
    requires_decision: true,
  },
  {
    id: 110,
    number: 10,
    title: 'recipes: tighten policies_satisfied list',
    state: 'open',
    body: 'Currently uneven across recipes; align on a shared subset.',
    user: { login: 'priya', avatar_url: '' },
    assignees: [],
    assigned_to_me: false,
    labels: [{ name: 'docs', color: '0075ca' }],
    repo: { owner: 'fragmatic-io', name: 'recipes' },
    priority: 'low',
    urgency: 0.25,
    recency: 0.5,
    created_at: '2026-04-25T08:00:00Z',
    updated_at: '2026-04-26T08:00:00Z',
    comments: 0,
    html_url: 'https://github.com/fragmatic-io/recipes/issues/10',
    requires_decision: false,
  },
  {
    id: 111,
    number: 7,
    title: 'docs: capability schema field reference',
    state: 'open',
    body: 'Reference page for CapabilitySchema. Useful for new contributors.',
    user: { login: 'sam', avatar_url: '' },
    assignees: [],
    assigned_to_me: false,
    labels: [{ name: 'docs', color: '0075ca' }],
    repo: { owner: 'fragmatic-io', name: 'docs' },
    priority: 'low',
    urgency: 0.2,
    recency: 0.4,
    created_at: '2026-04-24T08:00:00Z',
    updated_at: '2026-04-25T08:00:00Z',
    comments: 0,
    html_url: 'https://github.com/fragmatic-io/docs/issues/7',
    requires_decision: false,
  },
  {
    id: 112,
    number: 6,
    title: 'docs: add intent profile worked example',
    state: 'open',
    body: 'Worked example for buildDemoProfile and the consent flow.',
    user: { login: 'kenji', avatar_url: '' },
    assignees: [{ login: 'demo-user' }],
    assigned_to_me: true,
    labels: [{ name: 'docs', color: '0075ca' }],
    repo: { owner: 'fragmatic-io', name: 'docs' },
    priority: 'low',
    urgency: 0.3,
    recency: 0.55,
    created_at: '2026-04-23T08:00:00Z',
    updated_at: '2026-04-25T08:00:00Z',
    comments: 1,
    html_url: 'https://github.com/fragmatic-io/docs/issues/6',
    requires_decision: true,
  },
];

/** Lookup by `${owner}/${name}#${number}`. */
export function findIssue(owner: string, name: string, number: number): GitHubIssue | null {
  return (
    FIXTURE_ISSUES.find(
      (i) => i.repo.owner === owner && i.repo.name === name && i.number === number,
    ) ?? null
  );
}

/** Resolve a `#number` reference inside the cir repo (best-effort default). */
export function findIssueByNumber(number: number): GitHubIssue | null {
  return FIXTURE_ISSUES.find((i) => i.number === number) ?? null;
}
