// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
/**
 * Internal helpers shared across the React adapter modules.
 *
 * Excluded from coverage thresholds via the `**\/types.ts` pattern in
 * `vitest.config.ts`. Only declarations live here; nothing executable.
 */

import type { ReactNode } from 'react';

/** Fallback render closure used by error boundary / route. */
export type ErrorRenderer = (error: Error) => ReactNode;
