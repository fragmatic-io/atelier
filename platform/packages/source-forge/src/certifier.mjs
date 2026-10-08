// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { runProcess } from '../../providers/src/cli.mjs';
import { assert } from '../../conversation/src/common.mjs';
import { qualityContractFor } from './quality-contract.mjs';

const require = createRequire(import.meta.url);
const byteHash = (value) => createHash('sha256').update(value).digest('hex');
export const CERTIFIER_PROTOCOL = 2;

export function playwrightBrowserCache({ platform = process.platform, home = homedir() } = {}) {
  if (platform === 'darwin') return join(home, 'Library', 'Caches', 'ms-playwright');
  if (platform === 'win32') return join(home, 'AppData', 'Local', 'ms-playwright');
  return join(home, '.cache', 'ms-playwright');
}
export function expectedCases(qualityContract = null) {
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
  if (qualityContract?.profile === 'production') {
    for (const width of [320, 768])
      for (const theme of ['light', 'dark'])
        out.push({ name: `ready-${width}-${theme}`, width, theme, state: 'ready', direction: 'ltr' });
    out.push({ name: 'ready-390-light-rtl', width: 390, theme: 'light', state: 'ready', direction: 'rtl' });
    out.push({ name: 'ready-1280-dark-rtl', width: 1280, theme: 'dark', state: 'ready', direction: 'rtl' });
  }
  for (const scenario of qualityContract?.scenarios ?? [])
    for (const width of [390, 1280])
      out.push({ name: `scenario-${scenario.id}-${width}-light`, width, theme: 'light', state: 'ready', direction: 'ltr', scenario });
  return out;
}

/** Reject stale containers, missing states, forged captures, and oracle mismatch.
 * This validates trusted runner output; it never turns user-uploaded images into
 * a certificate for generated source. */
export function verifyBrowserEvidence(report, compiled, { runs = expectedCases(qualityContractFor(compiled)), runnerHash, axeHash = null } = {}) {
  const quality = qualityContractFor(compiled);
  assert(report.protocol === CERTIFIER_PROTOCOL && report.runner === 'chromium-sandboxed-react-v2', 409, 'CERTIFIER_PROTOCOL', 'Rebuild the certifier image for this evidence protocol');
  assert(report.digest === compiled.digest && report.designContextHash === (compiled.designContext?.hash ?? null) && report.qualityContractHash === (quality?.hash ?? null), 409, 'CERTIFIER_BINDING', 'Browser evidence does not match the source, design context and task oracle');
  assert(report.profile === (quality?.profile ?? 'standard'), 409, 'CERTIFIER_POLICY', 'Browser evidence used a different quality policy');
  if (runnerHash) assert(report.runnerHash === runnerHash, 409, 'CERTIFIER_RUNNER_CHANGED', 'Rebuild the certifier image after runner changes');
  assert(report.axeHash === axeHash, 409, 'CERTIFIER_AXE_CHANGED', 'Accessibility evidence used a different engine');
  assert(Array.isArray(report.checks) && report.checks.length === runs.length, 409, 'EVIDENCE_INVALID', 'Browser evidence must cover every required case exactly once');
  const cases = new Map(runs.map((item) => [item.name, item]));
  const seen = new Set();
  for (const check of report.checks) {
    const expected = cases.get(check.name);
    assert(expected && !seen.has(check.name) && typeof check.passed === 'boolean', 409, 'EVIDENCE_INVALID', 'Unknown or duplicate browser case');
    seen.add(check.name);
    if (check.passed) {
      const count = expected.scenario ? 1 : expected.state === 'ready' ? compiled.kit.tasks.length : 0;
      assert(check.tasks === count, 409, 'EVIDENCE_TASKS', 'Passing evidence omitted required tasks');
      if (expected.scenario)
        assert(check.independentScenario === true && check.assertions === expected.scenario.assertions.length && check.verifiedCalls === expected.scenario.calls.length, 409, 'EVIDENCE_ORACLE', 'Independent task assertions or exact action checks were omitted');
      if (quality?.profile === 'production')
      {
        const phases = count ? ['initial', 'complete'] : ['initial'];
        const actualPhases = check.accessibility?.phases ?? [];
        assert(check.accessibility?.engine === 'axe-core' && check.accessibility.violations?.length === 0 && axeHash && actualPhases.length === phases.length && phases.every((phase) => actualPhases.filter((item) => item.phase === phase && item.engine === 'axe-core' && item.violations?.length === 0).length === 1), 409, 'ACCESSIBILITY_EVIDENCE_REQUIRED', 'Production requires passing actual axe analysis before and after task interactions');
      }
    }
  }
  assert(report.passed === report.checks.every((item) => item.passed), 409, 'EVIDENCE_INVALID', 'Browser evidence summary differs from its cases');
  assert(Array.isArray(report.captures) && report.captures.length >= runs.length && report.captures.length <= runs.length * 2, 409, 'CAPTURE_EVIDENCE_REQUIRED', 'Every case requires bounded trusted screenshot evidence');
  const captureKeys = new Set(), capturedCases = new Set();
  let totalBytes = 0;
  for (const capture of report.captures) {
    const expected = cases.get(capture.name), key = `${capture.name}:${capture.phase}`;
    assert(expected && !captureKeys.has(key) && ['initial', 'complete', 'failure'].includes(capture.phase), 409, 'CAPTURE_EVIDENCE_INVALID', 'Unknown or duplicate screenshot capture');
    assert(capture.width === expected.width && capture.theme === expected.theme && capture.state === expected.state && capture.direction === expected.direction && capture.capture === 'viewport', 409, 'CAPTURE_EVIDENCE_INVALID', 'Screenshot metadata does not match its browser case');
    assert(typeof capture.dataUrl === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(capture.dataUrl), 409, 'CAPTURE_EVIDENCE_INVALID', 'Screenshot must contain bounded JPEG image bytes');
    const bytes = Buffer.from(capture.dataUrl.slice(capture.dataUrl.indexOf(',') + 1), 'base64');
    assert(bytes.length > 0 && bytes.length <= 1024 * 1024 && capture.bytes === bytes.length && capture.sha256 === byteHash(bytes) && bytes[0] === 255 && bytes[1] === 216, 409, 'CAPTURE_HASH_MISMATCH', 'Screenshot bytes do not match their retained hash');
    totalBytes += bytes.length;
    assert(totalBytes <= 8 * 1024 * 1024, 413, 'CAPTURE_SIZE', 'Browser screenshot evidence exceeds 8 MB');
    captureKeys.add(key);
    capturedCases.add(capture.name);
  }
  assert(runs.every((item) => capturedCases.has(item.name)), 409, 'CAPTURE_EVIDENCE_REQUIRED', 'Screenshot evidence omitted a required browser case');
  if (quality?.profile === 'production')
    for (const check of report.checks.filter((item) => item.passed)) {
      assert(captureKeys.has(`${check.name}:initial`) && (!check.tasks || captureKeys.has(`${check.name}:complete`)), 409, 'CAPTURE_EVIDENCE_REQUIRED', 'Passing production tasks require initial and completed-state captures');
    }
  return report;
}
export async function certifySourceKit(
  compiled,
  {
    python = process.env.ATELIER_PYTHON ?? 'python3',
    timeoutMs = 240000,
    signal,
    evidenceDir,
    mode = process.env.ATELIER_CERTIFIER_MODE ?? 'local',
    image = process.env.ATELIER_CERTIFIER_IMAGE ?? 'atelier-certifier:2.3',
    scratchRoot = process.env.ATELIER_CERTIFIER_SCRATCH ?? tmpdir(),
  } = {},
) {
  const { verifyCompilation, sandboxDocument } = await import('./compiler.mjs');
  verifyCompilation(compiled);
  const quality = qualityContractFor(compiled);
  assert(['local', 'docker'].includes(mode), 400, 'CERTIFIER_MODE', 'Unknown certifier mode');
  assert(
    process.env.NODE_ENV !== 'production' || mode === 'docker',
    503,
    'ISOLATED_CERTIFIER_REQUIRED',
    'Production source certification requires an isolated network-disabled container',
  );
  assert(process.env.NODE_ENV !== 'production' || quality?.profile === 'production', 409, 'PRODUCTION_QUALITY_REQUIRED', 'Production source certification requires an immutable production task oracle');
  const scratch = resolve(scratchRoot);
  await mkdir(scratch, { recursive: true, mode: 0o700 });
  const directory = await mkdtemp(join(scratch, 'atelier-cert-'));
  try {
    const runnerPath = fileURLToPath(new URL('../../../scripts/certify-source.py', import.meta.url));
    const runnerHash = byteHash(await readFile(runnerPath));
    let axeHash = null;
    if (quality?.profile === 'production') {
      let axe;
      try { axe = await readFile(require.resolve('axe-core/axe.min.js')); }
      catch { assert(false, 503, 'ACCESSIBILITY_ENGINE_REQUIRED', 'Install the locked axe-core dependency before production certification'); }
      axeHash = byteHash(axe);
      await writeFile(join(directory, 'axe.min.js'), axe, { mode: 0o600 });
    }
    const runs = [];
    for (const c of expectedCases(quality)) {
      const doc = sandboxDocument(compiled, { ...c, ...(c.scenario ? { data: c.scenario.data } : {}) }),
        file = c.name + '.html';
      await writeFile(join(directory, file), doc.html, { mode: 0o600 });
      runs.push({
        ...c,
        file,
        channel: doc.channel,
        tasks: c.state === 'ready' && !c.scenario ? compiled.kit.tasks : [],
      });
    }
    await writeFile(
      join(directory, 'input.json'),
      JSON.stringify({
        protocol: CERTIFIER_PROTOCOL,
        digest: compiled.digest,
        designContextHash: compiled.designContext?.hash ?? null,
        qualityContractHash: quality?.hash ?? null,
        profile: quality?.profile ?? 'standard',
        axeHash,
        runs,
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
          maxBytes: 16 * 1024 * 1024,
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
      for (const name of ['CHROMIUM_PATH', 'ATELIER_BROWSER_NO_SANDBOX', 'PLAYWRIGHT_NODEJS_PATH'])
        if (process.env[name]) env[name] = process.env[name];
      result = await runProcess(
        python,
        [runnerPath, directory],
        { cwd: directory, env, timeoutMs, maxBytes: 16 * 1024 * 1024, signal },
      );
    }
    const report = JSON.parse(result.stdout);
    verifyBrowserEvidence(report, compiled, { runs, runnerHash, axeHash });
    if (evidenceDir) {
      await mkdir(evidenceDir, { recursive: true, mode: 0o700 });
      for (const capture of report.captures)
        await writeFile(join(evidenceDir, `${capture.name}-${capture.phase}.jpg`), Buffer.from(capture.dataUrl.split(',')[1], 'base64'), { mode: 0o600 });
      await writeFile(join(evidenceDir, 'capture-manifest.json'), JSON.stringify({ digest: compiled.digest, designContextHash: report.designContextHash, qualityContractHash: report.qualityContractHash, captures: report.captures.map(({ dataUrl, ...metadata }) => metadata) }, null, 2), { mode: 0o600 });
    }
    return { ...report, isolation: mode };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
