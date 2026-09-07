#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function resolveBrowserPython({
  root,
  configured = process.env.ATELIER_PYTHON,
  platform = process.platform,
} = {}) {
  if (configured?.trim()) return configured.trim();
  const local =
    platform === 'win32'
      ? join(root, '.venv', 'Scripts', 'python.exe')
      : join(root, '.venv', 'bin', 'python');
  try {
    await access(local, constants.X_OK);
    return local;
  } catch {
    throw new Error(
      'BROWSER_RUNTIME_REQUIRED: set ATELIER_PYTHON to a Python environment with Playwright 1.62.0, or create platform/.venv as documented in README.md.',
    );
  }
}
export async function runBrowserIntegration({
  root = resolve(fileURLToPath(new URL('../', import.meta.url))),
  env = process.env,
} = {}) {
  const python = await resolveBrowserPython({
    root,
    configured: env.ATELIER_PYTHON,
    platform: process.platform,
  });
  return new Promise((resolveRun, reject) => {
    const child = spawn(python, ['scripts/browser-integration.py'], {
      cwd: root,
      env: { ...env, ATELIER_PYTHON: python },
      shell: false,
      stdio: 'inherit',
    });
    child.on('error', (error) => reject(new Error(`BROWSER_RUNTIME_START_FAILED: ${error.message}`)));
    child.on('close', (code, signal) => {
      if (signal)
        return reject(new Error(`BROWSER_INTEGRATION_SIGNAL: process stopped by ${signal}`));
      resolveRun(code ?? 1);
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await runBrowserIntegration();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
