// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for `MultiRouteCompiler` — Wave C / Phase C-4 fan-out plumbing.
 *
 * Covers:
 *  - Outline pre-pass runs exactly once per `compileApp` call.
 *  - N route compiles run in parallel (verified via a counter that
 *    snapshots the in-flight count after each route enters).
 *  - The outline is threaded into every per-route `CompileInput`.
 *  - `compileApp` returns `{ outline, manifests, routeResults }` keyed
 *    by route id with all manifests present.
 */

import { describe, expect, it } from 'vitest';
import type { AppOutline, Manifest } from '@atelier/schemas';
import {
  DeterministicOutlineCompiler,
  type CompileOutlineInput,
  type OutlineCompiler,
  type OutlineRouteInput,
} from '../src/outline-compiler.js';
import { MultiRouteCompiler, type MultiRouteEntry } from '../src/multi-route-compiler.js';
import type { CompileInput, CompileResult, CompilerService } from '../src/types.js';
import { fixtureCompileInput, fixtureManifest } from './_fixtures.js';

class CountingOutlineCompiler implements OutlineCompiler {
  readonly id = 'counting-outline';
  callCount = 0;
  lastInput?: CompileOutlineInput;

  async compileOutline(input: CompileOutlineInput): Promise<AppOutline> {
    this.callCount += 1;
    this.lastInput = input;
    const inner = new DeterministicOutlineCompiler();
    return inner.compileOutline(input);
  }
}

/**
 * Inner compiler that records every input it sees and lets the test
 * pause the resolution to verify parallel fan-out.
 */
class RecordingCompiler implements CompilerService {
  readonly id = 'recording';
  inputs: CompileInput[] = [];
  inFlight = 0;
  peakInFlight = 0;
  private readonly gate: Promise<void>;

  constructor(gate: Promise<void> = Promise.resolve()) {
    this.gate = gate;
  }

  async compile(input: CompileInput): Promise<CompileResult> {
    this.inputs.push(input);
    this.inFlight += 1;
    if (this.inFlight > this.peakInFlight) this.peakInFlight = this.inFlight;
    await this.gate;
    this.inFlight -= 1;

    const base = fixtureManifest({
      manifest_id: `m_${input.route.replace(/[^a-z0-9]/gi, '')}`,
    });
    const firstRoute = base.routes[0];
    const manifest: Manifest = {
      ...base,
      routes: firstRoute ? [{ ...firstRoute, path: input.route }] : [],
    };
    return {
      manifest,
      token_cost: 0,
      duration_ms: 1,
      model: this.id,
      diff_mode: false,
    };
  }
}

function entryFor(routeId: string): MultiRouteEntry {
  const outlineRoute: OutlineRouteInput = {
    id: routeId,
    label: routeId.charAt(0).toUpperCase() + routeId.slice(1),
    policyIds: ['data_access_within_grant'],
    skillIds: ['email-triage'],
  };
  const compileInput: CompileInput = fixtureCompileInput({ route: `/${routeId}` });
  return { outlineRoute, compileInput };
}

describe('MultiRouteCompiler', () => {
  it('calls the outline compiler exactly once per compileApp', async () => {
    const outline = new CountingOutlineCompiler();
    const inner = new RecordingCompiler();
    const mrc = new MultiRouteCompiler({ outline, inner });

    await mrc.compileApp({
      entries: [entryFor('today'), entryFor('inbox'), entryFor('archive')],
      brandKitId: 'demo-brand',
    });

    expect(outline.callCount).toBe(1);
    expect(outline.lastInput?.brandKitId).toBe('demo-brand');
    expect(outline.lastInput?.routes.map((r) => r.id)).toEqual(['today', 'inbox', 'archive']);
  });

  it('fans route compiles out in parallel (Promise.all shape)', async () => {
    const outline = new DeterministicOutlineCompiler();

    // Hold every route compile until we explicitly release. If the
    // fan-out is sequential, peakInFlight will be 1; if parallel it
    // will reach the entry count.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const inner = new RecordingCompiler(gate);

    const mrc = new MultiRouteCompiler({ outline, inner });
    const entries = [entryFor('today'), entryFor('inbox'), entryFor('archive')];

    const promise = mrc.compileApp({ entries, brandKitId: 'demo-brand' });

    // Yield enough microtasks for every route compile to enter `compile`.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(inner.peakInFlight).toBe(entries.length);

    release();
    await promise;
  });

  it('threads the outline into every per-route CompileInput', async () => {
    const outline = new DeterministicOutlineCompiler();
    const inner = new RecordingCompiler();
    const mrc = new MultiRouteCompiler({ outline, inner });

    const result = await mrc.compileApp({
      entries: [entryFor('today'), entryFor('inbox')],
      brandKitId: 'demo-brand',
    });

    expect(inner.inputs).toHaveLength(2);
    for (const seen of inner.inputs) {
      expect(seen.outline).toBeDefined();
      expect(seen.outline).toEqual(result.outline);
    }
  });

  it('returns { outline, manifests, routeResults } keyed by route id', async () => {
    const outline = new DeterministicOutlineCompiler();
    const inner = new RecordingCompiler();
    const mrc = new MultiRouteCompiler({ outline, inner });

    const entries = [entryFor('today'), entryFor('inbox'), entryFor('archive')];
    const result = await mrc.compileApp({ entries, brandKitId: 'demo-brand' });

    expect(result.outline.brandKitId).toBe('demo-brand');
    expect(result.manifests.size).toBe(entries.length);
    expect(result.routeResults.size).toBe(entries.length);
    for (const entry of entries) {
      expect(result.manifests.has(entry.outlineRoute.id)).toBe(true);
      expect(result.routeResults.has(entry.outlineRoute.id)).toBe(true);
      const m = result.manifests.get(entry.outlineRoute.id);
      expect(m?.routes[0]?.path).toBe(`/${entry.outlineRoute.id}`);
    }
  });

  it('exposes a stable composite id', () => {
    const mrc = new MultiRouteCompiler({
      outline: new DeterministicOutlineCompiler(),
      inner: new RecordingCompiler(),
    });
    expect(mrc.id).toBe('multi-route[outline-deterministic,recording]');
  });
});
