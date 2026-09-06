// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { access, cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { scanProject } from '../../scanner/src/index.mjs';
import {
  buildProjectModel,
  buildSearchIndex,
  loadProjectModel,
  modelSummary,
  saveProjectModel,
  searchProjectModel,
} from '../../project-model/src/index.mjs';
import { ComponentForge, componentArtifactSummary } from '../../component-forge/src/index.mjs';
import { compileAdditiveExperience } from '../../experience-compiler/src/index.mjs';
import { Evaluator } from '../../evaluator/src/index.mjs';
import {
  generateSigningKeyPair,
  signBundle,
  verifySignedBundle,
} from '../../runtime/src/index.mjs';
import { mineWorkflowOpportunities } from '../../workflow/src/index.mjs';
import { writeStudio } from '../../studio/src/index.mjs';

const VERSION = '2.0.0-alpha.1';

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function parseArgs(argv) {
  const positionals = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }
    const [rawKey, inline] = arg.slice(2).split(/=(.*)/s);
    if (inline !== undefined) flags[rawKey] = inline;
    else if (argv[i + 1] && !argv[i + 1].startsWith('--')) flags[rawKey] = argv[++i];
    else flags[rawKey] = true;
  }
  return { positionals, flags };
}

async function loadConfig(projectRoot) {
  for (const name of ['atelier.config.mjs', 'atelier.config.js']) {
    const file = join(projectRoot, name);
    if (await exists(file)) {
      const module = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
      return module.default ?? module.config ?? {};
    }
  }
  return {};
}

function mergeConfigIntoScan(scan, config) {
  return {
    ...scan,
    projectId: config.projectId ?? scan.projectId,
    slots: mergeById(scan.slots, config.slots ?? []),
    components: mergeById(scan.components, config.components ?? []),
    permissions: mergeById(
      scan.permissions,
      (config.permissions ?? []).map((x) => (typeof x === 'string' ? { id: x } : x)),
    ),
  };
}

function mergeById(a = [], b = []) {
  const map = new Map([...a, ...b].map((x) => [x.id, x]));
  return [...map.values()];
}

async function ensureArtifacts(projectRoot, { strict = false, rescan = false } = {}) {
  const atelierDir = join(projectRoot, '.atelier');
  const modelPath = join(atelierDir, 'project-model.json');
  if (!rescan && (await exists(modelPath))) {
    return {
      model: await loadProjectModel(modelPath),
      config: await loadConfig(projectRoot),
      atelierDir,
      modelPath,
      scanned: false,
    };
  }
  const config = await loadConfig(projectRoot);
  const raw = await scanProject(projectRoot, {
    strict,
    projectId: config.projectId,
    typescript: config.scanner?.typescript !== false,
  });
  const scan = mergeConfigIntoScan(raw, config);
  const model = buildProjectModel(scan, {
    projectId: config.projectId ?? scan.projectId,
    capabilityOverrides: config.capabilityOverrides ?? {},
    designGenome: scan.designGenome,
  });
  await mkdir(atelierDir, { recursive: true });
  await saveProjectModel(modelPath, model);
  await writeFile(
    join(atelierDir, 'scan-report.json'),
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        rootHash: raw.rootHash,
        sourceSummary: raw.sourceSummary,
        adapters: raw.adapters,
        summary: modelSummary(model),
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(atelierDir, 'design-genome.json'),
    `${JSON.stringify(model.designGenome, null, 2)}\n`,
  );
  return { model, config, atelierDir, modelPath, scanned: true };
}

async function readJsonIfExists(file, fallback) {
  if (!(await exists(file))) return fallback;
  return JSON.parse(await readFile(file, 'utf8'));
}

async function listJson(dir) {
  if (!(await exists(dir))) return [];
  const names = (await readdir(dir)).filter((name) => name.endsWith('.json')).sort();
  return Promise.all(names.map((name) => readJsonIfExists(join(dir, name), null))).then((items) =>
    items.filter(Boolean),
  );
}

async function ensureDevSigningKeys(atelierDir) {
  const keyDir = join(atelierDir, 'keys');
  const metaFile = join(keyDir, 'development-key.json');
  if (await exists(metaFile)) return JSON.parse(await readFile(metaFile, 'utf8'));
  const pair = generateSigningKeyPair({ keyId: 'atelier-development-key' });
  await mkdir(keyDir, { recursive: true });
  await writeFile(metaFile, `${JSON.stringify(pair, null, 2)}\n`, { mode: 0o600 });
  return pair;
}

function defaultGoal(model, slotId) {
  const entity = model.entities[0]?.name ?? 'record';
  return `Understand this ${entity} and take the next valid action`;
}

async function commandInit(args) {
  const target = resolve(args.positionals[1] ?? '.');
  await mkdir(target, { recursive: true });
  const configFile = join(target, 'atelier.config.mjs');
  if (!(await exists(configFile))) {
    await writeFile(
      configFile,
      `export default {
  projectId: '${target.split(/[\\/]/).at(-1)}',
  scanner: { typescript: true },
  generated: { directory: './src/atelier-generated' },
  runtime: { allowedAdaptationLevel: 2, fallback: 'host_ui' },
  telemetry: { mode: 'semantic', captureValues: false },
  slots: [
    {
      id: 'entity.detail.right-rail',
      mode: 'inline',
      contextSchema: { type: 'object', additionalProperties: true },
      allowedCapabilityGroups: ['*'],
      allowWriteActions: false,
      allowedPiiFields: [],
      maxAdaptationLevel: 2,
      fallback: 'host_ui',
    },
  ],
  capabilityOverrides: {},
};
`,
    );
  }
  console.log(JSON.stringify({ ok: true, command: 'init', target, configFile }, null, 2));
}

async function commandScan(args) {
  const projectRoot = resolve(args.positionals[1] ?? '.');
  const result = await ensureArtifacts(projectRoot, {
    strict: Boolean(args.flags.strict),
    rescan: true,
  });
  console.log(
    JSON.stringify(
      {
        ok: true,
        command: 'scan',
        projectRoot,
        modelPath: result.modelPath,
        summary: modelSummary(result.model),
      },
      null,
      2,
    ),
  );
}

async function commandInspect(args) {
  const projectRoot = resolve(args.positionals[1] ?? '.');
  const query = args.positionals.slice(2).join(' ') || args.flags.query || '';
  const { model } = await ensureArtifacts(projectRoot);
  const result = query
    ? searchProjectModel(model, query, { limit: Number(args.flags.limit ?? 20) })
    : modelSummary(model);
  console.log(JSON.stringify({ ok: true, command: 'inspect', query, result }, null, 2));
}

async function commandPropose(args) {
  const projectRoot = resolve(args.positionals[1] ?? '.');
  const { model, config, atelierDir } = await ensureArtifacts(projectRoot);
  const slotId = String(args.flags.slot ?? config.defaultSlot ?? model.slots[0]?.id ?? '');
  if (!slotId) throw new Error('No slot available. Add a slot to atelier.config.mjs.');
  const role = String(args.flags.role ?? 'operator');
  const permissions =
    args.flags.permissions !== undefined
      ? String(args.flags.permissions).split(',').filter(Boolean)
      : [...(config.defaultPermissions ?? config.permissions ?? [])];
  const goal = String(args.flags.goal ?? defaultGoal(model, slotId));
  const output = compileAdditiveExperience({
    actor: role,
    context: { route: args.flags.route ?? model.routes[0]?.path ?? '/', role, permissions },
    goal,
    projectModel: model,
    slotId,
    contextClass: {
      role,
      taskCluster: args.flags.task ?? 'understand-and-act',
      entityType: args.flags.entity ?? model.entities[0]?.id ?? 'record',
      locale: args.flags.locale ?? 'en',
      density: args.flags.density ?? model.designGenome?.grammar?.density ?? 'balanced',
    },
  });
  const evaluator = new Evaluator();
  const evaluation = evaluator.evaluateBundle(output.bundle, model);
  if (!evaluation.approved && !args.flags['allow-unapproved']) {
    const error = new Error(
      'Generated bundle did not pass evaluation. Use --allow-unapproved only for inspection.',
    );
    error.details = evaluation;
    throw error;
  }
  const keys = await ensureDevSigningKeys(atelierDir);
  const signed = signBundle(output.bundle, keys);
  verifySignedBundle(signed, { [keys.keyId]: keys.publicKey });
  const bundleDir = join(atelierDir, 'bundles');
  const evalDir = join(atelierDir, 'evaluations');
  await mkdir(bundleDir, { recursive: true });
  await mkdir(evalDir, { recursive: true });
  const bundlePath = join(bundleDir, `${signed.bundleId}.json`);
  const evalPath = join(evalDir, `${signed.bundleId}.json`);
  await writeFile(bundlePath, `${JSON.stringify(signed, null, 2)}\n`);
  await writeFile(evalPath, `${JSON.stringify(evaluation, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        ok: true,
        command: 'propose',
        bundlePath,
        evalPath,
        evaluation: { approved: evaluation.approved, score: evaluation.score },
        task: output.task,
        resolution: output.resolution.decision,
      },
      null,
      2,
    ),
  );
}

async function commandForge(args) {
  const projectRoot = resolve(args.positionals[1] ?? '.');
  const { model, modelPath } = await ensureArtifacts(projectRoot);
  const name = args.flags.name;
  const goal = String(args.flags.goal ?? 'Provide a project-native contextual intervention panel');
  const brief = {
    goal,
    requiredInformation: String(args.flags.fields ?? '')
      .split(',')
      .filter(Boolean),
    candidateActions: String(args.flags.actions ?? '')
      .split(',')
      .filter(Boolean),
  };
  if (!brief.requiredInformation.length) {
    const read = model.capabilities.find((x) => x.kind === 'query');
    brief.requiredInformation = Object.keys(
      read?.outputSchema?.properties ?? read?.outputSchema?.items?.properties ?? {},
    )
      .slice(0, 6)
      .map((field) => `${read?.id}.${field}`);
  }
  const forge = new ComponentForge();
  const result = forge.generate(brief, model, model.designGenome, {
    name,
    force: Boolean(args.flags.force),
  });
  const written = await forge.write(projectRoot, result);
  if (result.kind === 'forged') {
    model.components = mergeById(model.components, [result.contract]);
    model.projectVersion = result.contract.contentHash.slice(0, 20);
    model.searchIndex = buildSearchIndex(model);
    await saveProjectModel(modelPath, model);
  }
  console.log(
    JSON.stringify(
      { ok: true, command: 'forge', result: componentArtifactSummary(result), written },
      null,
      2,
    ),
  );
}

async function commandEvaluate(args) {
  const projectRoot = resolve(args.positionals[1] ?? '.');
  const { model, atelierDir } = await ensureArtifacts(projectRoot);
  const bundles = await listJson(join(atelierDir, 'bundles'));
  if (!bundles.length) throw new Error('No bundles to evaluate. Run propose first.');
  const evaluator = new Evaluator({ threshold: Number(args.flags.threshold ?? 0.86) });
  const reports = bundles.map((bundle) => evaluator.evaluateBundle(bundle, model));
  const evalDir = join(atelierDir, 'evaluations');
  await mkdir(evalDir, { recursive: true });
  for (const report of reports)
    await writeFile(
      join(evalDir, `${report.bundleId}.json`),
      `${JSON.stringify(report, null, 2)}\n`,
    );
  console.log(
    JSON.stringify(
      {
        ok: reports.every((x) => x.approved),
        command: 'evaluate',
        reports: reports.map((x) => ({
          bundleId: x.bundleId,
          approved: x.approved,
          score: x.score,
          blockers: x.blockers.length,
        })),
      },
      null,
      2,
    ),
  );
  if (reports.some((x) => !x.approved)) process.exitCode = 1;
}

async function loadWorkflowEvents(projectRoot, config) {
  const file = resolve(projectRoot, config.telemetry?.eventsFile ?? 'atelier.events.json');
  return readJsonIfExists(file, []);
}

async function commandStudio(args) {
  const projectRoot = resolve(args.positionals[1] ?? '.');
  const { model, config, atelierDir } = await ensureArtifacts(projectRoot);
  const events = await loadWorkflowEvents(projectRoot, config);
  const opportunities = mineWorkflowOpportunities(events, {
    minSessions: Number(args.flags['min-sessions'] ?? 2),
    availableSlots: model.slots,
  });
  const bundles = await listJson(join(atelierDir, 'bundles'));
  const evaluations = await listJson(join(atelierDir, 'evaluations'));
  const outputDir = resolve(projectRoot, args.flags.out ?? '.atelier/studio');
  const written = await writeStudio(outputDir, { model, opportunities, bundles, evaluations });
  await writeFile(
    join(atelierDir, 'opportunities.json'),
    `${JSON.stringify(opportunities, null, 2)}\n`,
  );
  console.log(
    JSON.stringify(
      { ok: true, command: 'studio', outputDir, written, opportunities: opportunities.length },
      null,
      2,
    ),
  );
}

async function commandDoctor() {
  const major = Number(process.versions.node.split('.')[0]);
  const checks = [
    { id: 'node-22', pass: major >= 22, detail: process.version },
    { id: 'web-fetch', pass: typeof fetch === 'function', detail: 'global fetch' },
    {
      id: 'structured-clone',
      pass: typeof structuredClone === 'function',
      detail: 'structuredClone',
    },
  ];
  try {
    const keys = generateSigningKeyPair({ keyId: 'doctor' });
    const candidate = {
      bundleId: 'bundle_doctor',
      slotId: 'doctor',
      manifest: { root: { component: 'Alert' } },
    };
    const signed = signBundle(candidate, keys);
    verifySignedBundle(signed, { doctor: keys.publicKey });
    checks.push({ id: 'ed25519', pass: true, detail: 'sign/verify' });
  } catch (error) {
    checks.push({ id: 'ed25519', pass: false, detail: String(error) });
  }
  const ok = checks.every((x) => x.pass);
  console.log(JSON.stringify({ ok, command: 'doctor', version: VERSION, checks }, null, 2));
  if (!ok) process.exitCode = 1;
}

async function commandSelfTest() {
  const root = resolve(import.meta.dirname, '../../..');
  await new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [join(root, 'scripts/self-test.mjs')], {
      stdio: 'inherit',
      cwd: root,
    });
    child.on('exit', (code) =>
      code === 0 ? resolvePromise() : reject(new Error(`Self-test failed with exit ${code}`)),
    );
  });
}

function help() {
  return `Atelier V2 ${VERSION}\n\nUsage:\n  atelier init [project]\n  atelier scan [project] [--strict]\n  atelier inspect [project] [query]\n  atelier propose [project] --slot <id> --goal <goal> [--role operator]\n  atelier forge [project] --name <ComponentName> [--goal <goal>] [--force]\n  atelier evaluate [project]\n  atelier studio [project] [--out .atelier/studio]\n  atelier doctor\n  atelier self-test\n`;
}

export async function main(argv) {
  const args = parseArgs(argv);
  const command = args.positionals[0] ?? 'help';
  if (['help', '--help', '-h'].includes(command)) {
    console.log(help());
    return;
  }
  if (command === 'version') {
    console.log(VERSION);
    return;
  }
  const commands = {
    init: commandInit,
    scan: commandScan,
    inspect: commandInspect,
    propose: commandPropose,
    forge: commandForge,
    evaluate: commandEvaluate,
    studio: commandStudio,
    doctor: commandDoctor,
    'self-test': commandSelfTest,
  };
  const handler = commands[command];
  if (!handler) throw new Error(`Unknown command: ${command}\n\n${help()}`);
  await handler(args);
}

export { parseArgs, ensureArtifacts };
