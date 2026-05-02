// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for `cir compile`. Uses an in-memory stub compiler injected via DI
 * (mirrors the smoke-eval pattern).
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildDefaultCompiler,
  compileCommand,
  loadCapabilities,
  loadComponents,
  redactApiKey,
  runCompile,
} from '../src/commands/compile.js';
import type { Capability, Manifest } from '@atelier/schemas';
import type { CompileInput as CI, CompileResult as CR, CompilerService } from '@atelier/compiler';

// -----------------------------------------------------------------------------
// Helpers.
// -----------------------------------------------------------------------------

function fixtureIntent(): unknown {
  return {
    user_id: 'demo-user',
    profile_version: 1,
    updated_at: '2026-04-30T00:00:00Z',
    global_preferences: { density: 'comfortable' },
    lenses: { 'lens.today': 'founder_inbox' },
    rules: [],
    vocabulary: {},
  };
}

function fixtureCapability(id: string): Capability {
  return {
    id,
    kind: 'data',
    version: '1.0.0',
    input: {},
    output: { items: 'array<object>' },
    side_effects: [],
    permissions: [],
    confirmation: 'none',
    rate_limit: '100/min/user',
    reversible: true,
  };
}

function fixtureManifest(): Manifest {
  return {
    manifest_id: 'm_test12345',
    user_id: 'demo-user',
    app_id: 'cir.cli',
    compiled_from: {
      capability_version: '1.0.0',
      skill_versions: {},
      component_catalog_version: '1.0.0',
      intent_profile_version: 1,
      compiler_model: 'stub',
      compiled_at: '2026-04-30T12:00:00Z',
    },
    ttl: null,
    invalidates_on: [],
    routes: [
      {
        path: '/',
        layout: { component: 'Stack' },
      },
    ],
    policies_satisfied: [],
  };
}

class StubCompiler implements CompilerService {
  readonly id = 'stub';
  readonly seenInputs: CI[] = [];
  readonly manifest: Manifest;
  constructor(manifest: Manifest = fixtureManifest()) {
    this.manifest = manifest;
  }
  // eslint-disable-next-line @typescript-eslint/require-await
  async compile(input: CI): Promise<CR> {
    this.seenInputs.push(input);
    return {
      manifest: this.manifest,
      token_cost: 0,
      duration_ms: 1,
      model: this.id,
      diff_mode: false,
    };
  }
}

async function makeTree(root: string): Promise<void> {
  // Intent.
  await writeFile(join(root, 'intent.json'), JSON.stringify(fixtureIntent()), 'utf8');
  // Capabilities.
  await mkdir(join(root, 'capabilities'), { recursive: true });
  await writeFile(
    join(root, 'capabilities', 'demo.list.json'),
    JSON.stringify(fixtureCapability('demo.list')),
    'utf8',
  );
  // Components registry. Use the keyed shape `cir components-sync` writes.
  await mkdir(join(root, 'components'), { recursive: true });
  const registry = {
    Stack: {
      props_schema: 'StackProps',
      data_sources: [],
      actions_supported: [],
      responsive_targets: ['web'],
      design_tokens: '@atelier/components/baseline@0.1.0',
      examples: [],
      text_render: true,
    },
  };
  await writeFile(join(root, 'components', 'registry.json'), JSON.stringify(registry), 'utf8');
}

// -----------------------------------------------------------------------------
// Tests.
// -----------------------------------------------------------------------------

describe('redactApiKey', () => {
  it('redacts AIza-prefixed keys', () => {
    const msg = "fail: bad key 'AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZabcdef0123' rejected";
    const out = redactApiKey(msg);
    expect(out).not.toContain('AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZabcdef0123');
    expect(out).toContain('AIza***REDACTED***');
  });
  it('passes through messages without keys', () => {
    expect(redactApiKey('plain message')).toBe('plain message');
  });
});

describe('loadCapabilities', () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'cir-compile-cap-'));
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('walks a directory recursively and returns id->capability', async () => {
    await mkdir(join(tmp, 'github'), { recursive: true });
    await writeFile(
      join(tmp, 'github', 'repo.list.json'),
      JSON.stringify(fixtureCapability('github.repo.list')),
      'utf8',
    );
    await writeFile(
      join(tmp, 'demo.list.json'),
      JSON.stringify(fixtureCapability('demo.list')),
      'utf8',
    );
    const out = await loadCapabilities(tmp);
    expect(Object.keys(out).sort()).toEqual(['demo.list', 'github.repo.list']);
  });

  it('returns empty object for a missing directory', async () => {
    const out = await loadCapabilities(join(tmp, 'does-not-exist'));
    expect(out).toEqual({});
  });
});

describe('loadComponents', () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'cir-compile-comp-'));
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('parses keyed-registry JSON and returns an array', async () => {
    const registry = {
      Stack: {
        props_schema: 'StackProps',
        data_sources: [],
        actions_supported: [],
        responsive_targets: ['web'],
        design_tokens: '@atelier/components/baseline@0.1.0',
        examples: [],
        text_render: true,
      },
    };
    const file = join(tmp, 'registry.json');
    await writeFile(file, JSON.stringify(registry), 'utf8');
    const out = await loadComponents(file);
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe('Stack');
  });
});

describe('buildDefaultCompiler', () => {
  it('falls back when GEMINI_API_KEY is missing', () => {
    const notes: string[] = [];
    const compiler = buildDefaultCompiler({}, (m) => notes.push(m));
    expect(compiler.id).toContain('fallback-cli');
    expect(notes.some((n) => n.includes('GEMINI_API_KEY not set'))).toBe(true);
  });

  it('does not print the API key in the warning when set', () => {
    const notes: string[] = [];
    buildDefaultCompiler({ GEMINI_API_KEY: 'AIzaSyABCDEFGH012345678' }, (m) => notes.push(m));
    // With key set, no fallback note is emitted at all (which is also the
    // strongest "we never log the key" assertion possible).
    expect(notes).toEqual([]);
  });
});

describe('runCompile', () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'cir-compile-run-'));
    await makeTree(tmp);
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('compiles via stub and returns the manifest', async () => {
    const stub = new StubCompiler();
    const result = await runCompile({
      intentPath: 'intent.json',
      capabilitiesDir: 'capabilities',
      skillsDir: 'skills',
      componentsRegistry: 'components/registry.json',
      brandKitPath: undefined,
      route: '/',
      appId: 'cir.cli',
      userId: 'demo-user',
      out: undefined,
      pretty: true,
      cwd: tmp,
      compiler: stub,
    });
    expect(result.manifest.manifest_id).toBe('m_test12345');
    expect(result.writtenTo).toBeNull();
    expect(stub.seenInputs).toHaveLength(1);
    expect(stub.seenInputs[0]?.capabilities['demo.list']).toBeTruthy();
    expect(stub.seenInputs[0]?.intent?.user_id).toBe('demo-user');
  });

  it('writes to --out when provided', async () => {
    const stub = new StubCompiler();
    const out = join(tmp, 'out', 'manifest.json');
    const result = await runCompile({
      intentPath: 'intent.json',
      capabilitiesDir: 'capabilities',
      skillsDir: 'skills',
      componentsRegistry: 'components/registry.json',
      brandKitPath: undefined,
      route: '/',
      appId: 'cir.cli',
      userId: 'demo-user',
      out,
      pretty: true,
      cwd: tmp,
      compiler: stub,
    });
    expect(result.writtenTo).toBe(out);
    const written = await readFile(out, 'utf8');
    const parsed = JSON.parse(written) as Manifest;
    expect(parsed.manifest_id).toBe('m_test12345');
  });

  it('loads --brand-kit when provided', async () => {
    const stub = new StubCompiler();
    const brand = {
      id: 'cir.cli.test',
      version: '0.1.0',
      tokens: {
        colors: { primary: '#000000' },
        spacing: { md: '12px' },
        typography: { font_stack: 'system-ui', scale: { body: '14px' } },
      },
      variants: {},
      voice: { tone: 'plain', do: ['be concise'], dont: ['shout'] },
    };
    const brandFile = join(tmp, 'brand.json');
    await writeFile(brandFile, JSON.stringify(brand), 'utf8');
    await runCompile({
      intentPath: 'intent.json',
      capabilitiesDir: 'capabilities',
      skillsDir: 'skills',
      componentsRegistry: 'components/registry.json',
      brandKitPath: 'brand.json',
      route: '/',
      appId: 'cir.cli',
      userId: 'demo-user',
      out: undefined,
      pretty: true,
      cwd: tmp,
      compiler: stub,
    });
    expect(stub.seenInputs[0]?.brandKit?.version).toBe('0.1.0');
  });

  it('rejects when the produced manifest fails ManifestSchema', async () => {
    // Force-cast through unknown so we can construct a Manifest-shaped value
    // whose manifest_id violates the schema regex (the test exercises the
    // post-compile ManifestSchema.parse re-validation).
    // Construct a Manifest-shaped value whose manifest_id violates the schema
    // regex. ManifestSchema doesn't brand the type so a plain `Manifest`
    // assertion is sufficient — the eslint `no-unnecessary-type-assertion`
    // rule rejects double-casts here.
    const bad: Manifest = { ...fixtureManifest(), manifest_id: '' };
    const stub = new StubCompiler(bad);
    await expect(
      runCompile({
        intentPath: 'intent.json',
        capabilitiesDir: 'capabilities',
        skillsDir: 'skills',
        componentsRegistry: 'components/registry.json',
        brandKitPath: undefined,
        route: '/',
        appId: 'cir.cli',
        userId: 'demo-user',
        out: undefined,
        pretty: true,
        cwd: tmp,
        compiler: stub,
      }),
    ).rejects.toBeTruthy();
  });

  it('uses buildDefaultCompiler when no API key is set (synthesized cli-stub manifest)', async () => {
    const notes: string[] = [];
    // No `compiler:` injection — exercises the default path. With no API
    // key, the fallback synthesizes a minimal `cli-stub` manifest carrying
    // a single EmptyState child on the requested route. We assert both the
    // "no key" note AND the synthesized stub shape.
    const result = await runCompile({
      intentPath: 'intent.json',
      capabilitiesDir: 'capabilities',
      skillsDir: 'skills',
      componentsRegistry: 'components/registry.json',
      brandKitPath: undefined,
      route: '/today',
      appId: 'cir.cli',
      userId: 'demo-user',
      out: undefined,
      pretty: true,
      cwd: tmp,
      env: {},
      notify: (m) => notes.push(m),
    });
    expect(notes.some((n) => n.includes('GEMINI_API_KEY not set'))).toBe(true);
    expect(result.manifest.compiled_from.compiler_model).toBe('cli-stub');
    expect(result.manifest.routes[0]?.path).toBe('/today');
    expect(result.manifest.routes[0]?.layout.component).toBe('EmptyState');
  });
});

describe('compileCommand', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;
  let tmp: string;
  beforeEach(async () => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    tmp = await mkdtemp(join(tmpdir(), 'cir-compile-cli-'));
    await makeTree(tmp);
  });
  afterEach(async () => {
    logSpy.mockRestore();
    errSpy.mockRestore();
    await rm(tmp, { recursive: true, force: true });
  });

  it('prints usage and returns 1 with no positional', async () => {
    const code = await compileCommand([], {}, tmp);
    expect(code).toBe(1);
    const errOut = errSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(errOut).toContain('usage: atelier compile');
  });

  it('--help prints usage and returns 0', async () => {
    const code = await compileCommand([], { help: 'true' }, tmp);
    expect(code).toBe(0);
    const printed = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(printed).toContain('usage: atelier compile');
  });

  it('returns 1 with redacted message on failure', async () => {
    // Point at a nonexistent intent file.
    const code = await compileCommand(
      ['no-such-file.json'],
      { components: 'components/registry.json' },
      tmp,
    );
    expect(code).toBe(1);
    const errOut = errSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(errOut).toContain('atelier compile:');
  });
});
