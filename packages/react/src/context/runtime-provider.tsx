// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors

'use client';
/**
 * `<CirRuntime>` — the top-level provider that puts `@cir/runtime` services
 * onto a React context.
 *
 * Behavior:
 *  - Stores `services` in `CirRuntimeContext`.
 *  - Stores `dataResolver` (defaulting to `EmptyDataResolver`) on
 *    `DataResolverContext` so the render walker can read it.
 *  - If the host did NOT pass `confirm`, we lazily create a
 *    `useReactConfirmation()` and mount its portal as the LAST child so it
 *    overlays the rest of the tree. The provider then forwards the wired
 *    callback to whatever consumer wants it (the dispatcher already has
 *    its own callback baked in at construction; this is here for hosts
 *    that need to use the same portal for ad-hoc confirmations).
 *  - If the host DID pass `confirm`, we use it as-is. No portal is rendered
 *    by the provider; the host is responsible for any UI.
 *
 * Why we do NOT rebuild the dispatcher: `ActionDispatcher` is constructed
 * with a `ConfirmationCallback` baked in (see `@cir/runtime/actions/dispatcher.ts`).
 * Hosts that want React's portal for the dispatcher should call
 * `useReactConfirmation()` themselves at app boot, plug `confirm` into the
 * dispatcher constructor, and render `Portal` inside `<CirRuntime>`. That
 * pattern is shown in this package's README.
 */

import { useMemo, type ReactNode } from 'react';
import { CirRuntimeContext, type CirRuntimeServices } from './runtime-context.js';
import {
  DataResolverContext,
  EmptyDataResolver,
  type DataResolver,
} from '../data/data-resolver.js';
import { useReactConfirmation } from '../confirm/use-confirmation.js';
import type { ConfirmationCallback } from '@cir/runtime';

export interface CirRuntimeProps {
  services: CirRuntimeServices;
  /**
   * A DataResolver lets components fetch their own data via the manifest's
   * data binding spec. Defaults to `EmptyDataResolver`.
   */
  dataResolver?: DataResolver;
  /**
   * Optional confirmation callback. If omitted, a default modal portal is
   * rendered as the last child of the provider tree. Hosts that want the
   * portal AND a custom callback can wire `useReactConfirmation()`
   * themselves and pass `confirm`.
   */
  confirm?: ConfirmationCallback;
  children: ReactNode;
}

export function CirRuntime(props: CirRuntimeProps): React.ReactElement {
  const { services, children } = props;
  const dataResolver = props.dataResolver ?? EmptyDataResolver;

  // Always call the hook to keep call order stable; the Portal is a no-op
  // until the store enqueues something.
  const fallback = useReactConfirmation();
  const FallbackPortal = fallback.Portal;
  const useFallbackPortal = props.confirm === undefined;

  const servicesValue = useMemo<CirRuntimeServices>(() => services, [services]);

  return (
    <CirRuntimeContext.Provider value={servicesValue}>
      <DataResolverContext.Provider value={dataResolver}>
        {children}
        {useFallbackPortal ? <FallbackPortal /> : null}
      </DataResolverContext.Provider>
    </CirRuntimeContext.Provider>
  );
}
