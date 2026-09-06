import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { scanProject } from '../packages/scanner/src/index.mjs';
import { buildProjectModel } from '../packages/project-model/src/index.mjs';

export const ROOT = resolve(import.meta.dirname, '..');
export const FIXTURE = join(ROOT, 'fixtures/sample-app');

export async function loadFixtureConfig(projectRoot = FIXTURE) {
  const module = await import(
    `${pathToFileURL(join(projectRoot, 'atelier.config.mjs')).href}?t=${Date.now()}_${Math.random()}`
  );
  return module.default;
}

export function mergeById(a = [], b = []) {
  return [...new Map([...a, ...b].map((x) => [x.id, x])).values()];
}

export async function buildFixtureModel(projectRoot = FIXTURE) {
  const config = await loadFixtureConfig(projectRoot);
  const scan = await scanProject(projectRoot, {
    projectId: config.projectId,
    typescript: false,
    strict: true,
  });
  scan.slots = mergeById(scan.slots, config.slots);
  scan.permissions = mergeById(
    scan.permissions,
    config.permissions.map((id) => ({ id })),
  );
  const model = buildProjectModel(scan, {
    projectId: config.projectId,
    capabilityOverrides: config.capabilityOverrides,
    designGenome: scan.designGenome,
  });
  return { config, scan, model };
}

export async function tempFixture(prefix = 'atelier-v2-') {
  const base = await mkdtemp(join(tmpdir(), prefix));
  const dir = join(base, 'project');
  await cp(FIXTURE, dir, { recursive: true });
  return { dir, cleanup: () => rm(base, { recursive: true, force: true }) };
}
