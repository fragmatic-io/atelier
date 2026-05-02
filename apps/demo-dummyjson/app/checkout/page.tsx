// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';

/**
 * /checkout — the `checkout-progressive` skill, expressed as a
 * `<Wizard variant="sidebar">` with three steps (shipping, payment,
 * review). The vertical sidebar layout is Vis-4 territory (the wizard
 * variants table).
 */

import { CirRoute } from '@atelier/react';

export default function CheckoutPage(): React.JSX.Element {
  return <CirRoute path="/checkout" />;
}
