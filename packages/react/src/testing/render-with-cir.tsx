// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `renderWithCir()` — Testing Library `render()` wrapper that mounts the
 * given React tree inside a `<CirRuntime>` provider with sane defaults.
 *
 * Uses `@testing-library/react`'s `render()`. Returns its full `RenderResult`
 * plus the assembled `services` so tests can poke at the cache, registry,
 * etc. without re-wiring them.
 */

import type { ReactElement, ReactNode } from 'react';
import { render, type RenderResult } from '@testing-library/react';
import { CirRuntime } from '../context/runtime-provider.js';
import type { CirRuntimeServices } from '../context/runtime-context.js';
import type { DataResolver } from '../data/data-resolver.js';
import type { ConfirmationCallback } from '@atelier/runtime';
import { buildTestServices, type BuildTestServicesOptions } from './build-test-services.js';

export interface RenderWithCirOptions {
  servicesOptions?: BuildTestServicesOptions;
  servicesOverride?: CirRuntimeServices;
  dataResolver?: DataResolver;
  confirm?: ConfirmationCallback;
}

export interface RenderWithCirResult extends RenderResult {
  services: CirRuntimeServices;
}

export function renderWithCir(
  ui: ReactElement,
  opts: RenderWithCirOptions = {},
): RenderWithCirResult {
  const services = opts.servicesOverride ?? buildTestServices(opts.servicesOptions);
  const wrapper = ({ children }: { children: ReactNode }): ReactElement => (
    <CirRuntime
      services={services}
      {...(opts.dataResolver ? { dataResolver: opts.dataResolver } : {})}
      {...(opts.confirm ? { confirm: opts.confirm } : {})}
    >
      {children}
    </CirRuntime>
  );
  const result = render(ui, { wrapper });
  return { ...result, services };
}
