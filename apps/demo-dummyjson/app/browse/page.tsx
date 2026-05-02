// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';

/**
 * /browse — the headline catalog route. The compiler returns a different
 * layout per lens:
 *   - compact   → `<List>` (single column, dense)
 *   - cozy      → `<Grid columns={3}>` (default)
 *   - spacious  → `<Grid columns={2}>` with bigger thumbnails
 *
 * `<CirRoute>` resolves the manifest via the runtime's
 * `ManifestResolver`. The lens-aware fetch wrapper in `atelier-providers.tsx`
 * forwards `x-cir-density` so the server picks the right fallback variant.
 */

import { CirRoute } from '@atelier/react';

export default function BrowsePage(): React.JSX.Element {
  return <CirRoute path="/browse" />;
}
