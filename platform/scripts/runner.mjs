// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { readFile, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { CliProvider } from '../packages/providers/src/cli.mjs';
import { sleep } from '../packages/control-plane/src/util.mjs';
import { appendPrivateRunnerDiagnostic } from './runner-diagnostics.mjs';
const flag = process.argv.indexOf('--config');
if (flag < 0) throw new Error('Usage: node scripts/runner.mjs --config /private/runner.json');
const path = process.argv[flag + 1];
const info = await stat(path);
if (process.platform !== 'win32' && info.mode & 0o077)
  throw new Error('Runner configuration contains a credential. Run chmod 600 on it.');
const config = JSON.parse(await readFile(path, 'utf8'));
const origin = new URL(config.server);
if (
  origin.protocol !== 'https:' &&
  !(origin.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname))
)
  throw new Error('Runner control-plane connection requires HTTPS, except loopback development.');
if (origin.username || origin.password || origin.search || origin.hash)
  throw new Error('Use a plain control-plane origin');
const workerId = randomUUID();
const providers = new Map();
for (const kind of config.providers ?? []) {
  const local = config.accounts?.[kind] ?? {};
  if (!local.home || !local.home.startsWith('/'))
    throw new Error(
      'Configure a dedicated absolute account HOME for each project runner; shared developer homes are not accepted',
    );
  const privateEnv = { ...process.env };
  delete privateEnv.CODEX_HOME;
  delete privateEnv.CLAUDE_CONFIG_DIR;
  delete privateEnv.OPENAI_API_KEY;
  delete privateEnv.CODEX_API_KEY;
  delete privateEnv.CLAUDE_CODE_OAUTH_TOKEN;
  delete privateEnv.ANTHROPIC_API_KEY;
  if (local.apiKeyEnv) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(local.apiKeyEnv))
      throw new Error('Invalid API key environment name');
    privateEnv[kind === 'codex-cli' ? 'CODEX_API_KEY' : 'ANTHROPIC_API_KEY'] =
      process.env[local.apiKeyEnv];
  }
  const p = new CliProvider({
    kind,
    model: local.model,
    effort: local.effort,
    executable: local.executable,
    home: local.home,
    env: privateEnv,
    authMode: local.authMode ?? (local.apiKeyEnv ? 'api' : 'account'),
  });
  console.log(await p.doctor());
  providers.set(kind, p);
}
let stopping = false,
  active = null;
for (const s of ['SIGTERM', 'SIGINT'])
  process.on(s, () => {
    stopping = true;
    active?.abort();
  });
async function post(path, body) {
  const response = await fetch(new URL('/api/runner/' + path, origin), {
    method: 'POST',
    redirect: 'error',
    headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const value = await response.json();
  if (!response.ok)
    throw Object.assign(new Error(value.error?.message ?? 'Runner request failed'), {
      status: response.status,
    });
  return value;
}
while (!stopping) {
  try {
    const { task } = await post('claim', { workerId });
    if (!task) {
      await sleep(1500);
      continue;
    }
    const provider = providers.get(task.provider);
    if (!provider) throw new Error('No locally configured account for this task provider');
    active = new AbortController();
    const heartbeat = setInterval(
      () =>
        post('heartbeat', { taskId: task.id, workerId, fence: task.fence }).catch(() =>
          active?.abort(),
        ),
      8000,
    );
    let result, error;
    try {
      const adapter = new CliProvider({
        ...provider,
        model: task.request.model,
        effort: task.request.effort,
        checkCapabilities: false,
      });
      result = await adapter.generate({ ...task.request, signal: active.signal });
    } catch (e) {
      error = {
        code: e.code ?? 'RUNNER_ERROR',
        message: 'Local model call failed. Inspect the private runner log.',
      };
      try {
        await appendPrivateRunnerDiagnostic(path, {
          taskId: task.id,
          provider: task.provider,
          code: error.code,
          diagnostics: e.privateDiagnostics,
        });
      } catch {
        console.error(JSON.stringify({ event: 'runner.diagnostic.failed', taskId: task.id }));
      }
      console.error(
        JSON.stringify({ event: 'runner.task.failed', taskId: task.id, code: error.code }),
      );
    } finally {
      clearInterval(heartbeat);
      active = null;
    }
    try {
      await post('complete', { taskId: task.id, workerId, fence: task.fence, result, error });
    } catch (e) {
      console.error(JSON.stringify({ event: 'runner.result.rejected', status: e.status }));
    }
  } catch (e) {
    console.error(
      JSON.stringify({
        event: 'runner.connection.failed',
        status: e.status ?? null,
        message: e.message,
      }),
    );
    if ([401, 403].includes(e.status)) break;
    await sleep(3000);
  }
}
