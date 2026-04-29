// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * `@cir/react/testing` — render helpers for downstream tests.
 *
 * Mirrors `@cir/runtime/testing`'s pattern: ergonomic wrappers that cut
 * boilerplate when consumers want to mount a `<CirRuntime>` with sane
 * defaults and exercise hooks/components.
 *
 * NOT re-exported from the main `@cir/react` entry intentionally — keeps
 * production bundles free of test-only helpers.
 */

export { renderWithCir, type RenderWithCirOptions } from './render-with-cir.js';
export { buildTestServices, type BuildTestServicesOptions } from './build-test-services.js';
