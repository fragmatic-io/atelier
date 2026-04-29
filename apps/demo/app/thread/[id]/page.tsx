// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';

import { use } from 'react';
import { CirRoute } from '@cir/react';

export default function ThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): React.JSX.Element {
  const { id } = use(params);
  return <CirRoute path={`/thread/${id}`} />;
}
