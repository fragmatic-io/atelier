// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { readFile, writeFile } from 'node:fs/promises';
import { compileSourceKit } from './compiler.mjs';
try {
  const request = JSON.parse(await readFile(process.argv[2], 'utf8'));
  const result = await compileSourceKit(request.kit, request.options);
  await writeFile(process.argv[3], JSON.stringify({ ok: true, result }), { mode: 0o600 });
} catch (error) {
  await writeFile(
    process.argv[3],
    JSON.stringify({
      ok: false,
      error: {
        code: error.code ?? 'COMPILE_FAILED',
        message: error.message,
        details: error.details ?? null,
      },
    }),
    { mode: 0o600 },
  );
  process.exitCode = 1;
}
