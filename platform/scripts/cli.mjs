#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { fileURLToPath } from 'node:url';
const routes = {
  start: './start.mjs',
  demo: './start.mjs',
  worker: './worker.mjs',
  admin: './admin.mjs',
  runner: './runner.mjs',
  snapshot: './snapshot.mjs',
  verify: './reconstruction-verify.mjs',
  'verify-host': './verify-host.mjs',
  'export-kit': './export-kit.mjs',
  local: '../packages/cli/bin/atelier.mjs',
};
const [command, ...args] = process.argv.slice(2);
if (!command || ['help', '--help', '-h'].includes(command)) {
  console.log(
    `Atelier Platform 2.3\n\n  atelier demo                 Start Studio with a local, randomly credentialed demo\n  atelier start                Start the control plane\n  atelier worker               Run a dedicated durable build worker\n  atelier admin <command>      Bootstrap, backup, verify, reset-password, rewrap-keys\n  atelier runner --config FILE Run a project-bound Codex/Claude runner\n  atelier snapshot ROOT OUT    Export a safe source snapshot (does not upload)\n  atelier export-kit FILE DIR  Unpack an approved generated component kit\n  atelier verify               Run offline tests and distribution checks\n  atelier verify-host DIR      Typecheck the actual host application\n  atelier local --help         Lower-level local authoring utilities\n\nSee README.md, docs/OPERATIONS.md and docs/PROVIDERS.md.`,
  );
} else if (!routes[command]) {
  console.error('Unknown command. Run atelier --help');
  process.exitCode = 2;
} else {
  const target = new URL(routes[command], import.meta.url);
  process.argv = [
    process.execPath,
    fileURLToPath(target),
    ...args,
    ...(command === 'demo' ? ['--demo'] : []),
  ];
  await import(target.href);
}
