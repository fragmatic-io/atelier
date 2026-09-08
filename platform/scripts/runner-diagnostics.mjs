// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { open, stat } from 'node:fs/promises';

const MAX_DIAGNOSTIC_CHARS = 32_000;

function bounded(value) {
  return String(value ?? '').slice(-MAX_DIAGNOSTIC_CHARS);
}

export async function appendPrivateRunnerDiagnostic(configPath, record) {
  const diagnostics = record?.diagnostics;
  if (!diagnostics) return null;
  const logPath = `${configPath}.diagnostics.log`;
  const file = await open(logPath, 'a', 0o600);
  try {
    const info = await stat(logPath);
    if (process.platform !== 'win32' && info.mode & 0o077)
      throw new Error('Runner diagnostic log must be mode 600');
    await file.appendFile(
      `${JSON.stringify({
        at: new Date().toISOString(),
        taskId: record.taskId,
        provider: record.provider,
        code: record.code,
        exitCode: diagnostics.exitCode,
        stderr: bounded(diagnostics.stderr),
        stdout: bounded(diagnostics.stdout),
      })}\n`,
    );
  } finally {
    await file.close();
  }
  return logPath;
}
