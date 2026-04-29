// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * `@cir/runtime/testing` — helpers exposed for downstream packages and tests.
 *
 * Not re-exported from the main `@cir/runtime` entry. Hosts importing the
 * production runtime should not pull in fake-IDB shims or always-confirm
 * sentinels by accident; this subpath keeps the boundary explicit.
 */

export { MemoryManifestCache } from '../manifest/memory-cache.js';
export { InMemoryTriggerBus, type InMemoryTriggerBusOptions } from '../triggers/memory-bus.js';
export { MapActionRegistry } from '../registry/action-registry.js';
export { MapComponentRegistry } from '../registry/component-registry.js';
export { ALWAYS_CONFIRM, ALWAYS_DECLINE } from '../actions/confirm.js';
export { ConsoleAuditSink, NoopAuditSink } from '../audit/emit.js';
