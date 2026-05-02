// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * `<CirRoute>` populates this context once a manifest has been resolved so
 * that nested hooks (notably `useDispatcher`) can read the current
 * `manifest_id` and stamp every dispatched action with it for audit.
 *
 * Outside a route this is `null` — `useDispatcher` still works but its
 * `ActionExecutionContext.manifest_id` will be omitted, which the runtime's
 * audit emitter handles gracefully.
 */

import { createContext } from 'react';

export interface CurrentManifestContextValue {
  manifest_id: string;
  route: string;
}

export const CurrentManifestContext = createContext<CurrentManifestContextValue | null>(null);
