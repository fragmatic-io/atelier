// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';

/**
 * /product/[id] — one product's detail view with related-products list,
 * gallery, and recommendation tile-row. Exercises Wave 7c's `<HoverCard>`
 * on each related item, the `recommendation-tile` skill rules
 * (max 4 items per row, basis disclosure), and Stripe-style price
 * emphasis.
 */

import { use } from 'react';
import { CirRoute } from '@atelier/react';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ProductPage({ params }: PageProps): React.JSX.Element {
  const { id } = use(params);
  return <CirRoute path={`/product/${id}`} />;
}
