#!/usr/bin/env -S node --import=tsx/esm
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/* eslint-disable no-console */
/**
 * `cir` — unified CIR developer CLI.
 *
 *   cir init [dir]              Scaffold a new CIR app.
 *   cir dev [--tail|--tail-only] Wrapper around `next dev`, optional audit tail.
 *   cir add <component>         Copy a baseline component into ./components/.
 *   cir components-sync         Regenerate components/registry.json.
 *   cir validate                Run the validate chain.
 *   cir import openapi <spec>   Generate capabilities from an OpenAPI 3 spec.
 *   cir inspect <id-or-path>    Pretty-print a manifest.
 *   cir compile <intent.json>   Offline compile producing a manifest.
 *   cir --help / --version
 *
 * Argv parsing is hand-rolled (no commander/yargs) to match the rest of the
 * repo. Each subcommand lives in its own module under `commands/` and
 * exposes a `runX()` programmatic entry plus an `xCommand()` CLI front-end.
 */

import { addCommand } from './commands/add.js';
import { compileCommand } from './commands/compile.js';
import { componentsSyncCommand } from './commands/components-sync.js';
import { devCommand } from './commands/dev.js';
import { importOpenApi } from './commands/import-openapi.js';
import { initCommand } from './commands/init.js';
import { inspectCommand } from './commands/inspect.js';
import { validateCommand } from './commands/validate.js';
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
    case 'inspect':
      return inspectCommand(positionals, flags);
    case 'compile':
      return compileCommand(positionals, flags);
    case 'import': {
      // `cir import openapi <spec> ...` — the importer parses its own flags,
      // so we slice off `import` and the target word and hand the rest over
      // verbatim. Keep this branch dumb so the importer stays the source of
      // truth for its argv contract.
      const target = positionals[0];
      if (target === 'openapi') {
        try {
          await importOpenApi(argv.slice(2));
          return 0;
        } catch (err) {
          console.error(`cir import openapi: ${(err as Error).message}`);
          return 1;
        }
      }
      console.error(
        `cir: unknown import target '${target ?? ''}'. Try 'cir import openapi <spec>'.`,
      );
      return 1;
    }
    default:
      console.error(`cir: unknown command '${command}'\n`);
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
