// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Salience scoring helper. The capability `github.issue.list` declares
 * `salience_default: "urgency * recency + assigned_to_me * 2"`. The
 * compiler honours the expression abstractly; this module is the
 * runtime's concrete implementation, used by the `/today` page when
 * client-side sorting is needed (the API also sorts but the client
 * re-applies the same weighting after optimistic mutations to avoid
 * temporary mis-ordering).
 *
 * Pair with `skills/information-hierarchy.skill.md`:
 *   - cap visible window at 7
 *   - top 3 receive `data-emphasis="hero"` for the renderer
 *   - never emphasise more than three.
 */

import type { GitHubIssue } from './github-fixtures.js';

export interface ScoredIssue {
  readonly issue: GitHubIssue;
  readonly score: number;
}

/** The exact expression declared on the capability. Pure function. */
export function scoreIssue(issue: GitHubIssue): number {
  return issue.urgency * issue.recency + (issue.assigned_to_me ? 2 : 0);
}

/**
 * Sort issues by salience (descending), tie-break on `updated_at` desc so
 * the order is stable even when scores collide (common at the bottom
 * where most items hover near zero).
 */
export function rankBySalience(issues: readonly GitHubIssue[]): ScoredIssue[] {
  return issues
    .map((issue) => ({ issue, score: scoreIssue(issue) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.issue.updated_at.localeCompare(a.issue.updated_at);
    });
}

/**
 * `data-emphasis` value for a given rank, following
 * `information-hierarchy.skill.md` rules:
 *   - top 3 get `hero`
 *   - everything else gets `comfortable`
 *
 * Caller passes the 0-based index in the sorted array.
 */
export function emphasisFor(rank: number): 'hero' | 'comfortable' {
  return rank < 3 ? 'hero' : 'comfortable';
}
