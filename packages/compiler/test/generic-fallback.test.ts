// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for the framework's last-resort fallback compiler.
 *
 * The shape is small and humble by design — these tests just lock the
 * contract: structurally valid manifest, named after the route, audit-
 * legible model id, and the wrapper class returns a `CompileResult` whose
 * `compiler_model` matches.
 */

import { ManifestSchema } from '@atelier/schemas';
import { describe, expect, it } from 'vitest';
import { GenericFallbackCompiler, genericFallbackManifest } from '../src/generic-fallback.js';
import { fixtureCompileInput } from './_fixtures.js';

describe('genericFallbackManifest', () => {
  it('produces a manifest that satisfies ManifestSchema', () => {
    const m = genericFallbackManifest(fixtureCompileInput({ route: '/inbox/triage' }));
    expect(() => ManifestSchema.parse(m)).not.toThrow();
  });

  it('humanizes the requested route into a title', () => {
    const m = genericFallbackManifest(fixtureCompileInput({ route: '/inbox/needs-action' }));
    expect(m.routes[0]?.title).toBe('Needs action');
  });

  it('routes "/" to a "Home" title', () => {
    const m = genericFallbackManifest(fixtureCompileInput({ route: '/' }));
    expect(m.routes[0]?.title).toBe('Home');
  });

  it('routes "" (empty) to a "Home" title', () => {
    const m = genericFallbackManifest(fixtureCompileInput({ route: '' }));
    expect(m.routes[0]?.title).toBe('Home');
  });

  it('underscore + hyphen segments are normalized to spaces in the title', () => {
    const m = genericFallbackManifest(fixtureCompileInput({ route: '/foo_bar-baz' }));
    expect(m.routes[0]?.title).toBe('Foo bar baz');
  });

  it('compiled_from declares compiler_model: fallback-generic', () => {
    const m = genericFallbackManifest(fixtureCompileInput({ route: '/x' }));
    expect(m.compiled_from.compiler_model).toBe('fallback-generic');
  });

  it('manifest_id matches the schema regex /^m_[a-z0-9]{8,}$/', () => {
    const m = genericFallbackManifest(fixtureCompileInput({ route: '/x' }));
    expect(m.manifest_id).toMatch(/^m_[a-z0-9]{8,}$/);
  });

  it('layout has a Stack with three children: heading, body, alert', () => {
    const m = genericFallbackManifest(fixtureCompileInput({ route: '/x' }));
    const layout = m.routes[0]?.layout;
    expect(layout?.component).toBe('Stack');
    expect(layout?.children?.length).toBe(3);
    expect(layout?.children?.[2]?.component).toBe('Alert');
  });
});

describe('GenericFallbackCompiler', () => {
  it('reports id "fallback-generic"', () => {
    const c = new GenericFallbackCompiler();
    expect(c.id).toBe('fallback-generic');
  });

  it('compile() returns a CompileResult with the same model id and zero tokens', async () => {
    const c = new GenericFallbackCompiler();
    const r = await c.compile(fixtureCompileInput({ route: '/foo' }));
    expect(r.model).toBe('fallback-generic');
    expect(r.token_cost).toBe(0);
    expect(r.diff_mode).toBe(false);
    expect(typeof r.duration_ms).toBe('number');
    expect(r.reasoning).toContain('GenericFallbackCompiler');
  });

  it('compile() returns a manifest whose first route matches the input route', async () => {
    const c = new GenericFallbackCompiler();
    const r = await c.compile(fixtureCompileInput({ route: '/dashboard' }));
    expect(r.manifest.routes[0]?.path).toBe('/dashboard');
    expect(r.manifest.routes[0]?.title).toBe('Dashboard');
  });
});
