// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runProcess } from '../../providers/src/cli.mjs';
import { assert } from '../../conversation/src/common.mjs';

export function playwrightBrowserCache({ platform = process.platform, home = homedir() } = {}) {
  if (platform === 'darwin') return join(home, 'Library', 'Caches', 'ms-playwright');
  if (platform === 'win32') return join(home, 'AppData', 'Local', 'ms-playwright');
  return join(home, '.cache', 'ms-playwright');
}
export function expectedCases() {
  const out = [];
  for (const width of [390, 1280])
    for (const theme of ['light', 'dark'])
      for (const state of ['ready', 'loading', 'empty', 'error'])
        out.push({ name: `${state}-${width}-${theme}`, width, theme, state, direction: 'ltr' });
  out.push({
    name: 'ready-1280-light-rtl',
    width: 1280,
    theme: 'light',
    state: 'ready',
    direction: 'rtl',
  });
  return out;
}
export async function certifySourceKit(
  compiled,
  {
    python = process.env.ATELIER_PYTHON ?? 'python3',
    timeoutMs = 150000,
    signal,
    evidenceDir,
    mode = process.env.ATELIER_CERTIFIER_MODE ?? 'local',
    image = process.env.ATELIER_CERTIFIER_IMAGE ?? 'atelier-certifier:2.3',
    scratchRoot = process.env.ATELIER_CERTIFIER_SCRATCH ?? tmpdir(),
  } = {},
) {
  const { verifyCompilation, sandboxDocument } = await import('./compiler.mjs');
  verifyCompilation(compiled);
  assert(['local', 'docker'].includes(mode), 400, 'CERTIFIER_MODE', 'Unknown certifier mode');
  assert(
    process.env.NODE_ENV !== 'production' || mode === 'docker',
    503,
    'ISOLATED_CERTIFIER_REQUIRED',
    'Production source certification requires an isolated network-disabled container',
  );
  const scratch = resolve(scratchRoot);
  await mkdir(scratch, { recursive: true, mode: 0o700 });
  const directory = await mkdtemp(join(scratch, 'atelier-cert-'));
  try {
    const runs = [];
    for (const c of expectedCases()) {
      const doc = sandboxDocument(compiled, c),
        file = c.name + '.html';
      await writeFile(join(directory, file), doc.html, { mode: 0o600 });
      runs.push({
        ...c,
        file,
        channel: doc.channel,
        tasks: c.state === 'ready' ? compiled.kit.tasks : [],
      });
    }
    await writeFile(
      join(directory, 'input.json'),
      JSON.stringify({
        digest: compiled.digest,
        runs,
        evidenceDir: mode === 'local' ? (evidenceDir ?? null) : null,
      }),
      { mode: 0o600 },
    );
    let result;
    if (mode === 'docker') {
      assert(/^[\w./:@-]+$/.test(image), 400, 'CERTIFIER_IMAGE', 'Invalid image');
      result = await runProcess(
        'docker',
        [
          'run',
          '--rm',
          '--network=none',
          '--read-only',
          '--cap-drop=ALL',
          '--security-opt=no-new-privileges',
          '--pids-limit=128',
          '--memory=768m',
          '--cpus=1',
          '--tmpfs',
          '/tmp:rw,noexec,nosuid,size=256m',
          '--mount',
          `type=bind,src=${directory},dst=/input,readonly`,
          '--entrypoint',
          'python3',
          image,
          '/certify.py',
          '/input',
        ],
        {
          cwd: directory,
          env: { PATH: process.env.PATH },
          timeoutMs,
          maxBytes: 2 * 1024 * 1024,
          signal,
        },
      );
    } else {
      const env = {
        PATH: process.env.PATH,
        HOME: directory,
        LANG: 'C.UTF-8',
        PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH ?? playwrightBrowserCache(),
      };
      for (const name of ['CHROMIUM_PATH', 'ATELIER_BROWSER_NO_SANDBOX'])
        if (process.env[name]) env[name] = process.env[name];
      result = await runProcess(
        python,
        [fileURLToPath(new URL('../../../scripts/certify-source.py', import.meta.url)), directory],
        { cwd: directory, env, timeoutMs, maxBytes: 2 * 1024 * 1024, signal },
      );
    }
    const report = JSON.parse(result.stdout);
    assert(
      report.digest === compiled.digest,
      409,
      'CERTIFIER_BINDING',
      'Evidence does not match the component',
    );
    return { ...report, isolation: mode };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
