#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { fileURLToPath } from 'node:url';
import { collectSourceBinding, collectToolchain } from './acceptance/binding.mjs';
import { resolveBrowserPython } from './run-browser-integration.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const python = await resolveBrowserPython({ root });
const binding = await collectSourceBinding(root, { toolchain: collectToolchain(root, { python }) });
process.stdout.write(`${JSON.stringify(binding, null, 2)}\n`);
if (!binding.clean) {
  process.stderr.write('SOURCE_DIRTY: commit the reviewed source before producing release evidence.\n');
  process.exitCode = 1;
}
