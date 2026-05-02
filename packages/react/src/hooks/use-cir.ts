// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * `useCir()` — base hook returning the runtime services bag.
 *
 * Throws if called outside of a `<CirRuntime>` provider so misuse fails
 * loudly during development rather than producing mysterious `undefined`
 * downstream.
 */

import { useContext } from 'react';
import { CirRuntimeContext, type CirRuntimeServices } from '../context/runtime-context.js';

export function useCir(): CirRuntimeServices {
  const services = useContext(CirRuntimeContext);
  if (!services) {
    throw new Error('useCir(): no <CirRuntime> provider found in tree');
  }
  return services;
}
