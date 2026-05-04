// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Marketplace review / curation primitives — Wave 8 / V-6.d.
 *
 * The publish/consume endpoints (V-6.a / V-6.b) make every uploaded bundle
 * fetchable by exact `(author, persona, version)` address. V-6.d adds a
 * curation layer on top: maintainers gate which bundles surface in the
 * default browse index. Direct-address fetches still resolve unreviewed
 * bundles (so authors can preview their own work); the index hides them.
 *
 * The wire shape is intentionally tiny:
 *
 *   - `ReviewState` — discriminator. `pending` is the auto-state on first
 *     publish; maintainers transition to `approved` / `rejected` /
 *     `flagged`.
 *   - `ReviewRecord` — the persisted row. Carries the address it covers,
 *     the current state, when it was submitted (server-stamped at the
 *     publish that created it), when it was last reviewed (set on every
 *     state transition), the reviewer id (free-form; the server records
 *     whoever the maintainer-key resolved to), and an optional human
 *     `notes` string the reviewer can attach.
 *
 * Companion docs: `apps/docs/src/content/docs/marketplace/publishing.mdx`
 * §"Review & curation" walks through the flow.
 */
import { z } from 'zod';

import { MarketplaceAddressSchema } from './marketplace.js';

/**
 * The four review states a bundle can sit in.
 *
 *   - `pending`  — auto-applied on first publish. Bundle is fetchable by
 *     direct address but NOT in the default browse index.
 *   - `approved` — surfaces in the default index. The state the browser
 *     UI shows by default.
 *   - `rejected` — explicitly refused by a maintainer. Hidden from the
 *     default index. Direct-address fetches still resolve so the author
 *     can compare versions.
 *   - `flagged`  — under active review (e.g. a user reported it). Hidden
 *     from the default index, surfaced to maintainers via the
 *     `?include=flagged` index query.
 */
export const ReviewStateSchema = z.enum(['pending', 'approved', 'rejected', 'flagged']);
export type ReviewState = z.infer<typeof ReviewStateSchema>;

/**
 * A persisted review record. One per `(author, persona, version)` triple
 * — addresses are immutable in V-6 so the record's `address` field is
 * effectively the row id.
 *
 * `submitted_at` is set by the server at publish time and never moves.
 * `reviewed_at` is set on every state transition (including the first
 * `pending` → `approved`); it is omitted on the auto-created `pending`
 * record because no human has reviewed it yet.
 */
export const ReviewRecordSchema = z.object({
  /** The address this record covers. Effectively the primary key. */
  address: MarketplaceAddressSchema,
  /** Current review state. */
  state: ReviewStateSchema,
  /** ISO-8601 UTC timestamp at the moment the bundle was first published. */
  submitted_at: z.string().datetime({ offset: true }),
  /** ISO-8601 UTC timestamp at the most recent state transition. */
  reviewed_at: z.string().datetime({ offset: true }).optional(),
  /**
   * Free-form identifier of the reviewer who last transitioned the state.
   * The server records whatever the maintainer-key resolved to (see the
   * `ReviewerKeyDirectory` interface in `@atelier/vault-server`).
   */
  reviewer_id: z.string().optional(),
  /** Optional human-readable note the reviewer attached. */
  notes: z.string().optional(),
});
export type ReviewRecord = z.infer<typeof ReviewRecordSchema>;
