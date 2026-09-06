#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { readFile } from 'node:fs/promises';
import {
  compileSourceKit,
  exportSourceKit,
  verifyExport,
} from '../packages/source-forge/src/compiler.mjs';
const args = process.argv.slice(2);
try {
  if (args[0] === '--verify') {
    if (!args[1]) throw new Error('Usage: node scripts/export-source.mjs --verify <directory>');
    console.log(JSON.stringify(await verifyExport(args[1]), null, 2));
  } else {
    if (args.length !== 2)
      throw new Error('Usage: node scripts/export-source.mjs <kit.json> <new-directory>');
    const kit = JSON.parse(await readFile(args[0], 'utf8'));
    const compiled = await compileSourceKit(kit, { approvedActions: [] });
    console.log(JSON.stringify(await exportSourceKit(compiled, args[1]), null, 2));
  }
} catch (e) {
  console.error(
    JSON.stringify({
      code: e.code ?? 'EXPORT_FAILED',
      message: e.message,
      details: e.details ?? null,
    }),
  );
  process.exitCode = 1;
}
