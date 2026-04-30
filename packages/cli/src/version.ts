// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Reads the `@cir/cli` package version. Resolves `package.json` relative to
 * this module rather than `process.cwd()` so the lookup works regardless of
 * where the user invoked `cir`.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

interface PackageJson {
  version?: string;
}

export function readCliVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // src/version.ts -> ../package.json   (when run via tsx from src/)
  // dist/version.js -> ../package.json  (when run from built dist/)
  const pkgPath = resolve(here, '..', 'package.json');
  const raw = readFileSync(pkgPath, 'utf8');
  const pkg = JSON.parse(raw) as PackageJson;
  return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
}
