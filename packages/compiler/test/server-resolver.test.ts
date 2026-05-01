/* eslint-disable @typescript-eslint/require-await -- stub compiler/budget counter signatures are Promise-returning to satisfy the production interface; bodies do not always await */
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Tests for `ServerManifestResolver`. Uses `MemoryManifestStore` plus a stub
 * compiler that returns a known manifest. Covers cache miss/hit, force
 * refresh, audit emission, the budget gate, invalidation, and the default
 * cache-key derivation.
 */

import { describe, expect, it, vi } from 'vitest';
import type { AuditEvent } from '@cir/schemas';
import { MemoryManifestStore } from '../src/manifest-store.js';
import {
  BudgetExceededError,
  ServerManifestResolver,
  type TokenBudgetCounter,
} from '../src/server-resolver.js';
import type { CompilerService, CompileResult } from '../src/types.js';
import { fixtureCompileInput, fixtureIntent, fixtureManifest } from './_fixtures.js';

function stubCompiler(token_cost = 42): { compiler: CompilerService; calls: { count: number } } {
  const calls = { count: 0 };
  const compiler: CompilerService = {
    id: 'stub',
    compile: async (): Promise<CompileResult> => {
      calls.count += 1;
      return {
        manifest: fixtureManifest(),
        token_cost,
        duration_ms: 5,
        model: 'stub-model',
        diff_mode: false,
      };
    },
  };
  return { compiler, calls };
}

describe('ServerManifestResolver', () => {
  it('cache miss → compile → store → return; emits manifest.compiled audit', async () => {
    const audit = vi.fn<(e: AuditEvent) => void>();
    const { compiler, calls } = stubCompiler(120);
    const store = new MemoryManifestStore();
    const resolver = new ServerManifestResolver({ compiler, store, audit });

    const r = await resolver.resolve(fixtureCompileInput());

    expect(r.source).toBe('fresh_compile');
    expect(r.token_cost).toBe(120);
    expect(calls.count).toBe(1);
    // Audit fired with manifest.compiled.
    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit.mock.calls[0]?.[0].type).toBe('manifest.compiled');
    // Stored under same key.
    const cached = await store.get(r.key);
    expect(cached).not.toBeNull();
    expect(cached?.token_cost).toBe(120);
  });

  it('cache hit → no compile; emits manifest.served audit', async () => {
    const audit = vi.fn<(e: AuditEvent) => void>();
    const { compiler, calls } = stubCompiler();
    const store = new MemoryManifestStore();
    const resolver = new ServerManifestResolver({ compiler, store, audit });

    await resolver.resolve(fixtureCompileInput()); // populate
    audit.mockClear();
    const r2 = await resolver.resolve(fixtureCompileInput());

    expect(r2.source).toBe('tier_3_cache');
    expect(r2.token_cost).toBe(0);
    expect(calls.count).toBe(1); // unchanged second time
    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit.mock.calls[0]?.[0].type).toBe('manifest.served');
  });

  it('forceRefresh recompiles even when a cached entry exists', async () => {
    const { compiler, calls } = stubCompiler();
    const store = new MemoryManifestStore();
    const resolver = new ServerManifestResolver({ compiler, store });

    await resolver.resolve(fixtureCompileInput());
    const r2 = await resolver.resolve(fixtureCompileInput(), { forceRefresh: true });

    expect(calls.count).toBe(2);
    expect(r2.source).toBe('fresh_compile');
  });

  it('throws BudgetExceededError when the user is over their daily cap', async () => {
    const { compiler } = stubCompiler();
    const store = new MemoryManifestStore();
    const counter: TokenBudgetCounter = {
      consumed: async () => 10_000,
      add: async () => {},
    };
    const resolver = new ServerManifestResolver({
      compiler,
      store,
      budget: { perUserDailyTokens: 5_000, counter },
    });
    await expect(resolver.resolve(fixtureCompileInput())).rejects.toBeInstanceOf(
      BudgetExceededError,
    );
  });

  it('budget gate adds tokens after a successful compile', async () => {
    const { compiler } = stubCompiler(77);
    const store = new MemoryManifestStore();
    const add = vi.fn(async () => {});
    const counter: TokenBudgetCounter = { consumed: async () => 0, add };
    const resolver = new ServerManifestResolver({
      compiler,
      store,
      budget: { perUserDailyTokens: 1_000, counter },
    });

    await resolver.resolve(fixtureCompileInput());
    expect(add).toHaveBeenCalledTimes(1);
    expect(add.mock.calls[0]).toEqual(['demo-user', 77]);
  });

  it('invalidate(predicate) evicts via the underlying store', async () => {
    const { compiler } = stubCompiler();
    const store = new MemoryManifestStore();
    const resolver = new ServerManifestResolver({ compiler, store });

    await resolver.resolve(fixtureCompileInput({ route: '/today' }));
    await resolver.resolve(fixtureCompileInput({ route: '/inbox' }));

    const removed = await resolver.invalidate((k) => k.route === '/today');
    expect(removed).toBe(1);
    const all = await store.list();
    expect(all).toHaveLength(1);
    expect(all[0]?.key.route).toBe('/inbox');
  });

  it('default cache key includes capability_version, intent_profile_version, and brand_kit_version', async () => {
    const { compiler } = stubCompiler();
    const store = new MemoryManifestStore();
    const resolver = new ServerManifestResolver({ compiler, store });

    const intent = fixtureIntent();
    const r = await resolver.resolve(
      fixtureCompileInput({
        intent,
        brandKit: {
          id: 'bk',
          version: '9.9.9',
          tokens: {
            colors: { brand: '#000' },
            spacing: { sm: '4px' },
            typography: { font_stack: 'Inter', scale: { body: '14px' } },
          },
          variants: {},
          voice: { tone: 't', do: [], dont: [] },
        },
      }),
    );

    expect(r.key.capability_version).toBe('1.0.0');
    expect(r.key.intent_profile_version).toBe(intent.profile_version);
    expect(r.key.brand_kit_version).toBe('9.9.9');
  });
});
