// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { readFile, mkdir, writeFile, lstat } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { safePath, assert } from '../packages/control-plane/src/util.mjs';
const [file, target] = process.argv.slice(2);
assert(
  file && target,
  400,
  'USAGE',
  'node scripts/export-kit.mjs downloaded.kit.json /new/output/directory',
);
const kit = JSON.parse(await readFile(file, 'utf8'));
assert(
  Array.isArray(kit.files) && kit.files.length <= 100,
  400,
  'INVALID_KIT',
  'Not a project kit',
);
const out = resolve(target);
try {
  await lstat(out);
  throw new Error('Use a new destination directory to avoid overwriting project code');
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}
const files = kit.files.map((f) => ({ path: safePath(f.path), content: f.content }));
assert(
  new Set(files.map((f) => f.path)).size === files.length,
  400,
  'DUPLICATE_PATH',
  'Duplicate kit paths',
);
for (const f of files)
  assert(
    typeof f.content === 'string' && f.content.length < 1000000,
    400,
    'INVALID_FILE',
    'Invalid kit source',
  );
await mkdir(out, { recursive: true });
for (const f of files) {
  const dest = join(out, f.path);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, f.content, { flag: 'wx' });
}
console.log(
  `Exported ${files.length} inspectable files to ${out}. Run your host typecheck and tests before importing.`,
);
