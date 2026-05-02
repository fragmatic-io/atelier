// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `pnpm demo` — boots the Atelier vault server + the demo app together.
 *
 * This is the 10-minute-fresh-clone path: one command, two prefixed log
 * streams (vault | demo), Ctrl-C kills both. No external deps; uses
 * Node's built-in `child_process.spawn`.
 *
 * Argv:
 *   pnpm demo                                → vault on :4001, apps/demo on :3000
 *   pnpm demo --vault-port 4002 --demo-port 3001
 *   pnpm demo --app dummyjson                → boots @atelier/demo-dummyjson instead
 *
 * Pre-flight: copies `apps/demo/.env.local.example` → `apps/demo/.env.local`
 * if the latter is missing (so first-time runs don't trip on a missing
 * GEMINI_API_KEY var). The `dummyjson` app does not require an env file —
 * it has no Gemini-keyed code paths today.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const DEMO_ENV = resolve(ROOT, 'apps/demo/.env.local');
const DEMO_ENV_EXAMPLE = resolve(ROOT, 'apps/demo/.env.local.example');

/**
 * Map a `--app` flag to the workspace package name. Default app is the
 * email-triage demo; `dummyjson` boots the lens-switching catalog demo.
 */
const APP_PACKAGES: Readonly<Record<string, string>> = Object.freeze({
  default: '@atelier/demo',
  demo: '@atelier/demo',
  dummyjson: '@atelier/demo-dummyjson',
});

interface Args {
  vaultPort: number;
  demoPort: number;
  app: string;
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = { vaultPort: 4001, demoPort: 3000, app: 'default' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--vault-port' && argv[i + 1]) {
      args.vaultPort = Number.parseInt(argv[i + 1]!, 10);
      i++;
    } else if (a === '--demo-port' && argv[i + 1]) {
      args.demoPort = Number.parseInt(argv[i + 1]!, 10);
      i++;
    } else if (a === '--app' && argv[i + 1]) {
      args.app = argv[i + 1]!;
      i++;
    }
  }
  return args;
}

/** Seed `.env.local` from `.env.local.example` on a fresh clone. Demo-only. */
function ensureDemoEnv(): void {
  if (existsSync(DEMO_ENV)) return;
  if (!existsSync(DEMO_ENV_EXAMPLE)) return;
  copyFileSync(DEMO_ENV_EXAMPLE, DEMO_ENV);
  console.error('[demo] seeded apps/demo/.env.local from .env.local.example');
}

/** Pretty-prefix one process's stdout/stderr lines. */
function pipe(child: ChildProcess, label: string, color: string): void {
  const reset = '\x1b[0m';
  const prefix = `${color}[${label}]${reset} `;
  const onData =
    (stream: NodeJS.WritableStream) =>
    (chunk: Buffer): void => {
      const lines = chunk.toString('utf8').split('\n');
      for (const line of lines) {
        if (line.length > 0) stream.write(`${prefix}${line}\n`);
      }
    };
  child.stdout?.on('data', onData(process.stdout));
  child.stderr?.on('data', onData(process.stderr));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const pkg = APP_PACKAGES[args.app] ?? APP_PACKAGES['default']!;
  const isDefaultApp = pkg === APP_PACKAGES['default'];
  if (isDefaultApp) ensureDemoEnv();

  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.error(`  Atelier demo — booting vault + Next.js (${pkg})`);
  console.error(`  vault: http://localhost:${String(args.vaultPort)}`);
  console.error(`  demo:  http://localhost:${String(args.demoPort)}`);
  console.error('  Ctrl-C kills both. First boot reads the user through onboarding.');
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const vault = spawn('pnpm', ['atelier', 'vault', 'dev', '--port', String(args.vaultPort)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });
  pipe(vault, 'vault', '\x1b[36m'); // cyan

  // Brief stagger so vault's "listening" line appears first in the log.
  await new Promise((r) => setTimeout(r, 800));

  const demoEnv = {
    ...process.env,
    PORT: String(args.demoPort),
    NEXT_PUBLIC_VAULT_URL: `http://localhost:${String(args.vaultPort)}`,
  };
  const demo = spawn('pnpm', ['--filter', pkg, 'dev'], {
    cwd: ROOT,
    env: demoEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });
  pipe(demo, 'demo', '\x1b[35m'); // magenta

  const cleanup = (signal: NodeJS.Signals): void => {
    console.error(`\n[demo] received ${signal} — shutting down…`);
    vault.kill('SIGTERM');
    demo.kill('SIGTERM');
  };
  process.on('SIGINT', () => cleanup('SIGINT'));
  process.on('SIGTERM', () => cleanup('SIGTERM'));

  vault.on('exit', (code) => {
    console.error(`[vault] exited with code ${String(code)}`);
    demo.kill('SIGTERM');
    process.exit(code ?? 0);
  });
  demo.on('exit', (code) => {
    console.error(`[demo] exited with code ${String(code)}`);
    vault.kill('SIGTERM');
    process.exit(code ?? 0);
  });
}

main().catch((err: unknown) => {
  console.error(`[demo] fatal: ${(err as Error).message}`);
  process.exit(1);
});
