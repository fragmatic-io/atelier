// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { compileSourceKit } from '../packages/source-forge/src/compiler.mjs';
import { certifySourceKit } from '../packages/source-forge/src/certifier.mjs';
const out = resolve(process.env.ATELIER_EVIDENCE_DIR ?? 'evidence/current/reference-components');
await mkdir(out, { recursive: true });
const available = (await readdir('examples/source-kits')).filter((n) => n.endsWith('.json')).sort(),
  selected = available.filter(
    (n) => !process.env.ATELIER_ONLY_KIT || n === process.env.ATELIER_ONLY_KIT + '.json',
  );
if (!selected.length)
  throw Object.assign(
    new Error(
      process.env.ATELIER_ONLY_KIT
        ? `Unknown reference kit: ${process.env.ATELIER_ONLY_KIT}`
        : 'No reference source kits found',
    ),
    { code: 'REFERENCE_KIT_REQUIRED' },
  );
const results = [];
for (const name of selected) {
  try {
    const kit = JSON.parse(await readFile(join('examples/source-kits', name), 'utf8')),
      compiled = await compileSourceKit(kit, {
        projectVersion: 'reference-suite-v23',
        approvedActions: kit.actions,
      }),
      report = await certifySourceKit(compiled, { evidenceDir: join(out, kit.id) });
    await writeFile(join(out, kit.id + '.json'), JSON.stringify(report, null, 2));
    results.push({
      id: kit.id,
      digest: compiled.digest,
      passed: report.passed,
      checks: report.checks.length,
      failures: report.checks.filter((c) => !c.passed),
    });
  } catch (e) {
    results.push({
      id: name.replace('.json', ''),
      passed: false,
      error: { code: e.code ?? 'FAILED', message: e.message, details: e.details ?? null },
    });
  }
  await writeFile(
    join(out, 'summary.json'),
    JSON.stringify(
      {
        passed: results.every((x) => x.passed),
        kits: results,
        checks: results.reduce((n, r) => n + (r.checks ?? 0), 0),
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(results.at(-1)));
}
if (results.some((x) => !x.passed)) process.exitCode = 1;
