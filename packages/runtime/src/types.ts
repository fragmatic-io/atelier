// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Internal helper types shared across the runtime modules.
 *
 * Excluded from coverage thresholds via the `**\/types.ts` pattern in
 * `vitest.config.ts`. Only declarations live here; nothing executable.
 */

/** A function that returns void; used for unsubscribe handles. */
export type Unsubscribe = () => void;

/** A monotonic source of "now" — overridable in tests. Returns ISO 8601 UTC. */
export type Clock = () => string;

/** Default clock: `new Date().toISOString()`. */
export const isoNow: Clock = () => new Date().toISOString();
