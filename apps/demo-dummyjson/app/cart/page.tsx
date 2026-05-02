// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';

/**
 * /cart — current cart. Optimistic add-to-cart toast (5s undo) wired
 * automatically because `dummyjson.cart.add` is `reversible+low_stakes`
 * (Wave 7a / Int-4 autodetect). The `<List>` is selectable; the
 * `<BulkActionBar>` surfaces "Remove selected" when one or more rows
 * are checked.
 */

import { CirRoute } from '@atelier/react';

export default function CartPage(): React.JSX.Element {
  return <CirRoute path="/cart" />;
}
