// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Policy descriptor.
 *
 * A policy is a pure-function validator over a manifest, action, or data
 * binding. This schema describes only the METADATA — the actual validator
 * function is implemented per-policy in `@cir/policies` (Phase 3). See
 * `/Users/vid/cir/docs/architecture.md` §Policy engine for examples.
 */

import { z } from 'zod';

export const PolicySchema = z.object({
  /** Stable identifier — e.g. `data_access_within_grant`. */
  id: z.string().min(1),
  /** Human-readable description for the policy explorer. */
  description: z.string().min(1),
  /**
   * What kind of object this policy validates.
   * - `manifest`: whole-manifest invariants (e.g. coverage of confirmation flows)
   * - `action`: a specific action call (e.g. rate limits, scope checks)
   * - `data`: a data binding / scope check
   */
  applies_to: z.enum(['manifest', 'action', 'data']),
  /**
   * Severity — `error` blocks the operation, `warn` records to audit but
   * permits it.
   */
  severity: z.enum(['error', 'warn']),
});

export type Policy = z.infer<typeof PolicySchema>;
