// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `atelier compile <intent.json>` — offline compile producing a manifest.
 *
 * Mirrors `apps/demo/lib/atelier-server.ts` end-to-end so a developer can hit
 * the same compile path the dev server takes, without a running Next.js
 * process. Writes the produced manifest to `--out` or stdout.
 *
 *   atelier compile <intent.json> [--capabilities <dir>] [--skills <dir>]
 *                             [--components <registry.json>] [--brand-kit <file>]
 *                             [--route <path>] [--app-id <id>] [--user-id <id>]
 *                             [--out <file>] [--json]
 *
 * If `GEMINI_API_KEY` is set, the run uses the real `GeminiCompiler` wrapped
 * in a `CompositeCompiler` with a `FallbackCompiler` underneath. With no key
 * the fallback alone runs (heuristic-only), and a one-line note hits stderr.
 *
 * Never prints the API key. Errors that bubble up from Gemini are passed
 * through as-is; we trust `@google/genai` not to inline the key in its error
 * messages, but we still apply a defensive redaction (mirrors P-CI-5).
 */

/* eslint-disable no-console */

import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';

import {
  CompositeCompiler,
  FallbackCompiler,
  GeminiCompiler,
  type CompilerService,
} from '@atelier/compiler';
import {
  BrandKitSchema,
  CapabilitySchema,
  ComponentDefinitionSchema,
  IntentProfileSchema,
  ManifestSchema,
  parseSkillMarkdown,
  type BrandKit,
  type Capability,
  type ComponentDefinition,
  type IntentProfile,
  type Manifest,
  type Skill,
} from '@atelier/schemas';

import { COMPILE_USAGE } from '../usage.js';

// ---------------------------------------------------------------------------
// Loaders. Each helper is small, pure-ish (filesystem only), and reused by
// tests via the public `loadCapabilities` / `loadComponents` exports.
// ---------------------------------------------------------------------------

/**
 * Walk `dir` recursively and parse every `*.json` as a `Capability`. Files
 * that fail `CapabilitySchema` are skipped with a warning on stderr — same
 * tolerance the demo's server has.
 */
export async function loadCapabilities(dir: string): Promise<Record<string, Capability>> {
  const out: Record<string, Capability> = {};
  if (!existsSync(dir)) return out;
  const stack = [dir];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    let entries: string[];
    try {
      entries = await readdir(cur);
    } catch {
      continue;
    }
    for (const name of entries) {
      const full = resolve(cur, name);
      let st;
      try {
        st = await stat(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!name.endsWith('.json')) continue;
      try {
        const raw = await readFile(full, 'utf8');
        const parsed = CapabilitySchema.parse(JSON.parse(raw));
        out[parsed.id] = parsed;
      } catch (err) {
        console.error(`atelier compile: skipping ${full}: ${(err as Error).message}`);
      }
    }
  }
  return out;
}

/**
 * Walk `dir` recursively and parse every `*.skill.md` via
 * `parseSkillMarkdown`. Returns an `id -> Skill` map keyed by the skill's id.
 */
export async function loadSkills(dir: string): Promise<Record<string, Skill>> {
  const out: Record<string, Skill> = {};
  if (!existsSync(dir)) return out;
  const stack = [dir];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    let entries: string[];
    try {
      entries = await readdir(cur);
    } catch {
      continue;
    }
    for (const name of entries) {
      const full = resolve(cur, name);
      let st;
      try {
        st = await stat(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!name.endsWith('.skill.md')) continue;
      try {
        const raw = await readFile(full, 'utf8');
        const parsed = parseSkillMarkdown(raw);
        const skill: Skill = parsed.skill;
        out[skill.name] = skill;
      } catch (err) {
        console.error(`atelier compile: skipping ${full}: ${(err as Error).message}`);
      }
    }
  }
  return out;
}

/**
 * Load a `components/registry.json` (the keyed registry shape `cir
 * components-sync` writes) and return a flat array of `ComponentDefinition`s.
 * The compiler accepts the array form.
 */
export async function loadComponents(registryPath: string): Promise<ComponentDefinition[]> {
  const raw = await readFile(registryPath, 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  if (parsed === null || typeof parsed !== 'object') {
    throw new Error(`components registry at ${registryPath} is not a JSON object`);
  }
  const out: ComponentDefinition[] = [];
  for (const [key, def] of Object.entries(parsed as Record<string, unknown>)) {
    // ComponentDefinitionSchema has no `id` field (the registry uses the key
    // as the id), but the compiler's prompt builder reads `c.id`. Validate
    // the body via the schema, then attach the key as `id` afterwards.
    const validated = ComponentDefinitionSchema.parse(def);
    out.push({ id: key, ...validated } as ComponentDefinition);
  }
  return out;
}

/** Read + validate a brand kit JSON. Returns `undefined` if `path` is empty. */
export async function loadBrandKit(path: string | undefined): Promise<BrandKit | undefined> {
  if (!path) return undefined;
  const raw = await readFile(path, 'utf8');
  return BrandKitSchema.parse(JSON.parse(raw));
}

/**
 * Read + validate the intent profile from a JSON file. The schema is strict;
 * a partial intent that's missing required fields will throw a clear error.
 */
export async function loadIntent(path: string): Promise<IntentProfile> {
  const raw = await readFile(path, 'utf8');
  return IntentProfileSchema.parse(JSON.parse(raw));
}

// ---------------------------------------------------------------------------
// Compiler factory. Mirrors `apps/demo/lib/atelier-server.ts:buildServer`.
// ---------------------------------------------------------------------------

/** Strip anything that looks like an API key from a string. Defensive only. */
export function redactApiKey(s: string): string {
  // Common Google API key shape: AIza... 39 chars total.
  return s.replace(/AIza[0-9A-Za-z_-]{30,}/g, 'AIza***REDACTED***');
}

/**
 * Build a CompositeCompiler from env. When `GEMINI_API_KEY` is set, the
 * cascade is `[Gemini, Fallback]`; otherwise just `[Fallback]`. The fallback
 * here is a no-op stub (no hand-written manifests on disk for `atelier compile`):
 * the host project supplies them by injecting a different compiler via the
 * test seam. For the CLI's default offline run, the fallback throws — the
 * composite then surfaces a "no manifest available" error.
 *
 * `notify` is the side-channel for the "no API key" warning. Tests pass a
 * collector; the CLI passes `console.error`.
 */
export function buildDefaultCompiler(
  env: Readonly<Record<string, string | undefined>>,
  notify: (msg: string) => void = (m) => console.error(m),
): CompilerService {
  const apiKey = env['GEMINI_API_KEY'];

  // Without a hand-written manifest store on disk, the CLI synthesizes a
  // minimal stub manifest so `atelier compile` still produces a schema-valid
  // artifact even with no API key. The stub carries a single `EmptyState`
  // child on the requested route and is marked with `compiler_model:
  // 'cli-stub'` so consumers can tell it apart from real LLM output.
  const fallback = new FallbackCompiler({
    id: 'fallback-cli',
    lookup: (route, input) => ({
      manifest_id: `m_${Math.random().toString(36).slice(2, 10).padEnd(8, '0')}`,
      user_id: input.user_id,
      app_id: input.app_id,
      compiled_from: {
        capability_version: '0.0.0',
        skill_versions: {},
        component_catalog_version: '0.0.0',
        intent_profile_version: 0,
        compiler_model: 'cli-stub',
        compiled_at: new Date().toISOString(),
      },
      invalidates_on: [],
      routes: [
        {
          path: route,
          title: 'Atelier (offline stub)',
          layout: {
            component: 'EmptyState',
            props: {
              title: 'No LLM compiler configured',
              description:
                'Set GEMINI_API_KEY (or wire a hand-written manifest store) to compile a real layout for this route.',
            },
          },
        },
      ],
      policies_satisfied: [],
    }),
  });

  const compilers: CompilerService[] = [];
  if (typeof apiKey === 'string' && apiKey.length > 10) {
    compilers.push(
      new GeminiCompiler({
        apiKey,
        coldModel: env['GEMINI_COLD_MODEL'] ?? 'gemini-2.5-pro',
        diffModel: env['GEMINI_DIFF_MODEL'] ?? 'gemini-2.5-flash',
      }),
    );
  } else {
    notify('note: GEMINI_API_KEY not set — using FallbackCompiler (heuristics, no LLM)');
  }
  compilers.push(fallback);
  return new CompositeCompiler(compilers);
}

// ---------------------------------------------------------------------------
// Programmatic + CLI entry points.
// ---------------------------------------------------------------------------

export interface CompileRunOptions {
  intentPath: string;
  capabilitiesDir: string;
  skillsDir: string;
  componentsRegistry: string;
  brandKitPath: string | undefined;
  route: string;
  appId: string;
  userId: string;
  out: string | undefined;
  pretty: boolean;
  cwd: string;
  /** Override the compiler. Tests pass a stub; CLI uses `buildDefaultCompiler`. */
  compiler?: CompilerService;
  /** Override env (for tests). */
  env?: Readonly<Record<string, string | undefined>>;
  /** stderr collector for the "no API key" note (tests). */
  notify?: (msg: string) => void;
}

export interface CompileRunResult {
  manifest: Manifest;
  serialized: string;
  /** Path written, or `null` when written to stdout. */
  writtenTo: string | null;
}

/**
 * Programmatic entry. Loads inputs, builds the compile request, calls the
 * compiler, validates the produced manifest, optionally writes it.
 */
export async function runCompile(opts: CompileRunOptions): Promise<CompileRunResult> {
  const intent = await loadIntent(absolutize(opts.intentPath, opts.cwd));
  const capabilities = await loadCapabilities(absolutize(opts.capabilitiesDir, opts.cwd));
  const skills = await loadSkills(absolutize(opts.skillsDir, opts.cwd));
  const components = await loadComponents(absolutize(opts.componentsRegistry, opts.cwd));
  const brandKit = await loadBrandKit(
    opts.brandKitPath ? absolutize(opts.brandKitPath, opts.cwd) : undefined,
  );

  const compiler = opts.compiler ?? buildDefaultCompiler(opts.env ?? process.env, opts.notify);

  const compileInput = {
    user_id: opts.userId,
    app_id: opts.appId,
    route: opts.route,
    capabilities,
    skills,
    components,
    intent,
    ...(brandKit ? { brandKit } : {}),
  };
  const result = await compiler.compile(compileInput);
  const manifest = ManifestSchema.parse(result.manifest);

  const serialized = opts.pretty ? JSON.stringify(manifest, null, 2) : JSON.stringify(manifest);

  let writtenTo: string | null = null;
  if (opts.out) {
    const outPath = absolutize(opts.out, opts.cwd);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, `${serialized}\n`, 'utf8');
    writtenTo = outPath;
  }
  return { manifest, serialized, writtenTo };
}

function absolutize(p: string, cwd: string): string {
  return isAbsolute(p) ? p : resolve(cwd, p);
}

/**
 * CLI front-end. Parses flags, calls `runCompile`, prints output / writes
 * file, returns exit code.
 */
export async function compileCommand(
  positionals: readonly string[],
  flags: Readonly<Record<string, string>>,
  cwd: string = process.cwd(),
): Promise<number> {
  if (flags['help'] === 'true') {
    console.log(COMPILE_USAGE);
    return 0;
  }
  const intentPath = positionals[0];
  if (!intentPath) {
    console.error(COMPILE_USAGE);
    return 1;
  }
  const opts: CompileRunOptions = {
    intentPath,
    capabilitiesDir: flags['capabilities'] ?? 'capabilities',
    skillsDir: flags['skills'] ?? 'skills',
    componentsRegistry: flags['components'] ?? 'components/registry.json',
    brandKitPath: flags['brand-kit'],
    route: flags['route'] ?? '/',
    appId: flags['app-id'] ?? 'cir.cli',
    userId: flags['user-id'] ?? 'cli-user',
    out: flags['out'],
    pretty: flags['json'] !== 'false', // pretty by default; --json=false for compact
    cwd,
  };
  try {
    const result = await runCompile(opts);
    if (result.writtenTo) {
      console.log(`atelier compile: wrote ${result.writtenTo}`);
    } else {
      console.log(result.serialized);
    }
    return 0;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`atelier compile: ${redactApiKey(msg)}`);
    return 1;
  }
}
