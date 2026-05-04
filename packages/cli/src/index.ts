#!/usr/bin/env -S node --import=tsx/esm
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
 *   atelier validate                Run the validate chain.
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

import { addCommand } from './commands/add.js';
import { compileCommand } from './commands/compile.js';
import { componentsSyncCommand } from './commands/components-sync.js';
import { devCommand } from './commands/dev.js';
import { importFigma } from './commands/import-figma.js';
import { importOpenApi } from './commands/import-openapi.js';
import { initCommand } from './commands/init.js';
import { inspectCommand } from './commands/inspect.js';
import { lintCommand } from './commands/lint.js';
import { validateCommand } from './commands/validate.js';
import { vaultCommand } from './commands/vault.js';
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
    case 'init':
      return initCommand(positionals, flags);
    case 'dev':
      return devCommand(positionals, flags);
    case 'add':
      return addCommand(positionals, flags);
    case 'components-sync':
      return componentsSyncCommand(positionals, flags);
    case 'validate':
      return validateCommand(positionals, flags);
    case 'lint':
      return lintCommand(positionals, flags);
    case 'inspect':
      return inspectCommand(positionals, flags);
    case 'compile':
      return compileCommand(positionals, flags);
    case 'vault':
      return vaultCommand(positionals, flags);
    case 'import': {
      // `atelier import openapi <spec> ...` — the importer parses its own flags,
      // so we slice off `import` and the target word and hand the rest over
      // verbatim. Keep this branch dumb so the importer stays the source of
      // truth for its argv contract.
      const target = positionals[0];
      if (target === 'openapi') {
        try {
          await importOpenApi(argv.slice(2));
          return 0;
        } catch (err) {
          console.error(`atelier import openapi: ${(err as Error).message}`);
          return 1;
        }
      }
      if (target === 'figma') {
        try {
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

// Entry-point guard: only run main() when invoked as a script. Allows test
// modules to import `main` without triggering side effects.
const invokedDirectly =
  typeof process !== 'undefined' &&
  process.argv[1] !== undefined &&
  (import.meta.url === `file://${process.argv[1]}` ||
    import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/')));

if (invokedDirectly) {
  main().then(
    (code) => process.exit(code),
    (err: unknown) => {
      console.error(err);
      process.exit(1);
    },
  );
}
