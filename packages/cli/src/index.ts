#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/* eslint-disable no-console */
/**
 * `atelier` — unified Atelier developer CLI.
 *
 *   atelier init [dir]              Scaffold a new Atelier app.
 *   atelier dev [--tail|--tail-only] Wrapper around `next dev`, optional audit tail.
 *   atelier add <component>         Copy a baseline component into ./components/.
 *   atelier components-sync         Regenerate components/registry.json.
 *   atelier validate                Detect the consumer's stack and run real checks (typecheck, lint, test, schemas).
 *   atelier lint skill <path>       Validate a single .skill.md file.
 *   atelier import openapi <spec>   Generate capabilities from an OpenAPI 3 spec.
 *   atelier import figma <tokens>   Generate a BrandKit from a Figma tokens JSON.
 *   atelier inspect <id-or-path>    Pretty-print a manifest.
 *   atelier compile <intent.json>   Offline compile producing a manifest.
 *   atelier --help / --version
 *
 * Argv parsing is hand-rolled (no commander/yargs) to match the rest of the
 * repo. Each subcommand lives in its own module under `commands/` and
 * exposes a `runX()` programmatic entry plus an `xCommand()` CLI front-end.
 */

import { parseArgs } from './parse-args.js';
import { TOP_LEVEL_USAGE } from './usage.js';
import { readCliVersion } from './version.js';

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  const { command, positionals, flags } = parseArgs(argv);

  if (command === '' || command === '--help' || command === '-h') {
    console.log(TOP_LEVEL_USAGE);
    return command === '' ? 1 : 0;
  }
  if (command === '--version' || command === '-v') {
    console.log(readCliVersion());
    return 0;
  }

  switch (command) {
    case 'init': {
      const { initCommand } = await import('./commands/init.js');
      return initCommand(positionals, flags);
    }
    case 'dev': {
      const { devCommand } = await import('./commands/dev.js');
      return devCommand(positionals, flags);
    }
    case 'add': {
      const { addCommand } = await import('./commands/add.js');
      return addCommand(positionals, flags);
    }
    case 'components-sync': {
      const { componentsSyncCommand } = await import('./commands/components-sync.js');
      return componentsSyncCommand(positionals, flags);
    }
    case 'validate': {
      const { validateCommand } = await import('./commands/validate.js');
      return validateCommand(positionals, flags);
    }
    case 'lint': {
      const { lintCommand } = await import('./commands/lint.js');
      return lintCommand(positionals, flags);
    }
    case 'inspect': {
      const { inspectCommand } = await import('./commands/inspect.js');
      return inspectCommand(positionals, flags);
    }
    case 'compile': {
      const { compileCommand } = await import('./commands/compile.js');
      return compileCommand(positionals, flags);
    }
    case 'vault': {
      const { vaultCommand } = await import('./commands/vault.js');
      return vaultCommand(positionals, flags);
    }
    case 'marketplace': {
      const { marketplaceCommand } = await import('./commands/marketplace-publish.js');
      return marketplaceCommand(positionals, flags);
    }
    case 'import': {
      // `atelier import openapi <spec> ...` — the importer parses its own flags,
      // so we slice off `import` and the target word and hand the rest over
      // verbatim. Keep this branch dumb so the importer stays the source of
      // truth for its argv contract.
      const target = positionals[0];
      if (target === 'openapi') {
        try {
          const { importOpenApi } = await import('./commands/import-openapi.js');
          await importOpenApi(argv.slice(2));
          return 0;
        } catch (err) {
          console.error(`atelier import openapi: ${(err as Error).message}`);
          return 1;
        }
      }
      if (target === 'figma') {
        try {
          const { importFigma } = await import('./commands/import-figma.js');
          await importFigma(argv.slice(2));
          return 0;
        } catch (err) {
          console.error(`atelier import figma: ${(err as Error).message}`);
          return 1;
        }
      }
      console.error(
        `atelier: unknown import target '${target ?? ''}'. Try 'atelier import openapi <spec>' or 'atelier import figma <tokens.json>'.`,
      );
      return 1;
    }
    default:
      console.error(`atelier: unknown command '${command}'\n`);
      console.error(TOP_LEVEL_USAGE);
      return 1;
  }
}

import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Entry-point guard: only run main() when invoked as a script. Allows test
// modules to import `main` without triggering side effects. We compare
// `import.meta.url` against the realpath of `process.argv[1]` so the guard
// also fires when the binary is launched via the npm `.bin/atelier` symlink
// (whose path differs from the resolved module path) — without the realpath
// hop, `npm install`-ed consumers would silently exit 0 producing no output.
const invokedDirectly = ((): boolean => {
  if (typeof process === 'undefined' || process.argv[1] === undefined) return false;
  const argv1 = process.argv[1];
  if (import.meta.url === `file://${argv1}`) return true;
  if (import.meta.url.endsWith(argv1.replace(/\\/g, '/'))) return true;
  try {
    const real = realpathSync(argv1);
    return import.meta.url === pathToFileURL(real).href;
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  main().then(
    (code) => process.exit(code),
    (err: unknown) => {
      console.error(err);
      process.exit(1);
    },
  );
}
