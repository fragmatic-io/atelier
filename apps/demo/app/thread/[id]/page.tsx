// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';

import { use } from 'react';
import { CirRoute } from '@atelier/react';

export default function ThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): React.JSX.Element {
  const { id } = use(params);
  return <CirRoute path={`/thread/${id}`} />;
}
