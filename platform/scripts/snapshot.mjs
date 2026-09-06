// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { readdir, readFile, writeFile, lstat } from 'node:fs/promises';
import { resolve, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCE_EXTENSIONS, validateSnapshot } from '../packages/control-plane/src/services.mjs';
export async function createSnapshot(root) {
  root = resolve(root);
  const files = [];
  async function walk(rel = '') {
    for (const e of await readdir(join(root, rel), { withFileTypes: true })) {
      if (
        e.name.startsWith('.') ||
        ['node_modules', 'dist', 'coverage', 'data', 'vendor', 'evidence'].includes(e.name)
      )
        continue;
      const path = rel ? `${rel}/${e.name}` : e.name;
      const info = await lstat(join(root, path));
      if (info.isSymbolicLink()) continue;
      if (e.isDirectory()) await walk(path);
      else if (SOURCE_EXTENSIONS.has(extname(e.name)) && info.size <= 512 * 1024)
        files.push({ path, content: await readFile(join(root, path), 'utf8') });
    }
  }
  await walk();
  return validateSnapshot({ files });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const s = await createSnapshot(process.argv[2] ?? '.');
  if (process.argv[3]) {
    await writeFile(resolve(process.argv[3]), JSON.stringify(s), { flag: 'wx', mode: 0o600 });
    console.log(
      JSON.stringify({ written: resolve(process.argv[3]), files: s.files.length, bytes: s.bytes }),
    );
  } else process.stdout.write(JSON.stringify(s));
}
