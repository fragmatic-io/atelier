// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Capability index — generated `_index.json` summary, one per directory in
 * the `capabilities/` tree.
 *
 * Wave 10 / S-5 surface. The on-disk indices are emitted by
 * `scripts/generate-capability-index.ts` and validated against
 * `CapabilityIndexSchema` here so the generator can refuse to write a
 * malformed index. Downstream consumers (compiler scoping in S-1, the
 * marketplace registry in V-6, ad-hoc tooling) parse `_index.json` through
 * this schema.
 *
 *     {
 *       "version": "0.2.0",
 *       "generated_at": "2026-05-03T12:00:00.000Z",
 *       "capabilities": [
 *         { "id": "github.issue.list", "version": "0.1.0", "path": "issue/list.json" },
 *         …
 *       ],
 *       "subdirectories": ["issue", "repo"]
 *     }
 *
 * Notes:
 *  - `path` is RELATIVE to the directory containing the `_index.json`. The
 *    root `capabilities/_index.json` aggregates every capability with paths
 *    relative to `capabilities/`.
 *  - `id` remains canonical — the path is purely organisational. A capability
 *    file at `capabilities/github/issue/list.json` declaring `id: "github.issue.list"`
 *    is the convention but the generator does not enforce a 1:1 path↔id rule.
 *  - The `generated_at` value MAY equal the literal sentinel
 *    `"__GENERATED_AT__"` — the generator's `--check` mode replaces real
 *    timestamps with this sentinel before diffing so CI doesn't flap on
 *    timestamp drift. The schema accepts it explicitly.
 */

import { z } from 'zod';
import { CapabilityId, SemverString } from './common.js';

/** Internal sentinel honoured by the index `--check` round-trip. */
export const CAPABILITY_INDEX_GENERATED_AT_SENTINEL = '__GENERATED_AT__';

/** A single capability summary line in `_index.json`. */
export const CapabilityIndexEntrySchema = z.object({
  /** Canonical capability id (mirrors `Capability.id`). */
  id: CapabilityId,
  /** Capability semver (mirrors `Capability.version`). */
  version: SemverString,
  /**
   * Path RELATIVE to the directory containing this `_index.json`, or
   * relative to `capabilities/` for the root index. Forward-slash separated.
   */
  path: z.string().min(1),
});
export type CapabilityIndexEntry = z.infer<typeof CapabilityIndexEntrySchema>;

/** A `_index.json` file shape. */
export const CapabilityIndexSchema = z.object({
  /** Index format version. Bump when the on-disk shape changes. */
  version: z.string().min(1),
  /**
   * ISO-8601 timestamp of emission, OR the `__GENERATED_AT__` sentinel that
   * the generator's `--check` mode swaps in for stable diffs. Anything else
   * fails parsing.
   */
  generated_at: z
    .string()
    .datetime({ offset: true })
    .or(z.literal(CAPABILITY_INDEX_GENERATED_AT_SENTINEL)),
  /** Capabilities directly under this directory. Sorted by `id`. */
  capabilities: z.array(CapabilityIndexEntrySchema),
  /**
   * Immediate-child subdirectory names that themselves carry capabilities
   * (or nested subdirectories with capabilities). Sorted alphabetically.
   */
  subdirectories: z.array(z.string().min(1)),
});
export type CapabilityIndex = z.infer<typeof CapabilityIndexSchema>;
