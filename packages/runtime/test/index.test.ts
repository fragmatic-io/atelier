import { describe, expect, it } from 'vitest';
import * as runtime from '../src/index.js';
import * as testingExports from '../src/testing/index.js';

describe('@cir/runtime public surface', () => {
  it('exports every advertised value', () => {
    // Manifest cache + impls
    expect(typeof runtime.serializeCacheKey).toBe('function');
    expect(typeof runtime.deserializeCacheKey).toBe('function');
    expect(runtime.MemoryManifestCache).toBeTruthy();
    expect(runtime.IndexedDBManifestCache).toBeTruthy();

    // Fetcher + resolver
    expect(runtime.ManifestFetcher).toBeTruthy();
    expect(runtime.ManifestFetchError).toBeTruthy();
    expect(runtime.ManifestResolver).toBeTruthy();
    expect(runtime.ManifestValidationError).toBeTruthy();

    // Actions
    expect(runtime.ActionDispatcher).toBeTruthy();
    expect(runtime.UndoStack).toBeTruthy();
    expect(typeof runtime.requiresConfirmation).toBe('function');
    expect(typeof runtime.ALWAYS_CONFIRM).toBe('function');
    expect(typeof runtime.ALWAYS_DECLINE).toBe('function');

    // Triggers
    expect(runtime.WILDCARD_TRIGGER_TYPE).toBe('*');
    expect(runtime.InMemoryTriggerBus).toBeTruthy();
    expect(typeof runtime.wireTriggerInvalidation).toBe('function');

    // Registries
    expect(runtime.EMPTY_REGISTRY).toBeTruthy();
    expect(runtime.MapComponentRegistry).toBeTruthy();
    expect(runtime.MapActionRegistry).toBeTruthy();

    // Render
    expect(typeof runtime.buildRenderPlan).toBe('function');
    expect(runtime.RouteNotFoundError).toBeTruthy();
    expect(runtime.RouteNotRenderableError).toBeTruthy();

    // Audit
    expect(runtime.NoopAuditSink).toBeTruthy();
    expect(runtime.ConsoleAuditSink).toBeTruthy();
  });

  it('testing subpath exposes test helpers', () => {
    expect(testingExports.MemoryManifestCache).toBeTruthy();
    expect(testingExports.InMemoryTriggerBus).toBeTruthy();
    expect(testingExports.MapActionRegistry).toBeTruthy();
    expect(testingExports.MapComponentRegistry).toBeTruthy();
    expect(typeof testingExports.ALWAYS_CONFIRM).toBe('function');
    expect(typeof testingExports.ALWAYS_DECLINE).toBe('function');
  });
});
