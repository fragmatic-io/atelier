import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ApiProvider } from '../../packages/providers/src/api.mjs';
import { CliProvider, runProcess, cliEnvironment } from '../../packages/providers/src/cli.mjs';
import { validateOutput, checkSchema } from '../../packages/providers/src/schema.mjs';
import { validateData } from '../../packages/providers/src/data-schema.mjs';
import { ProviderError, requestJson } from '../../packages/providers/src/http.mjs';
import { fixture } from './helpers.mjs';
const schema = {
    type: 'object',
    properties: { ok: { type: 'boolean' } },
    required: ['ok'],
    additionalProperties: false,
  },
  request = { system: 'Return a checked artifact', input: { project: 'p' }, schema };
for (const kind of ['openai', 'anthropic', 'gemini', 'openai-compatible'])
  test(`${kind}: actual wire envelope and structured output contract (mock transport)`, async () => {
    let seen;
    const provider = new ApiProvider({
      kind,
      key: 'test-secret',
      model: 'test-model',
      baseUrl: 'https://approved.example/v1',
      request: async (url, options) => {
        seen = { url, ...options };
        if (kind === 'openai')
          return {
            output: [{ content: [{ type: 'output_text', text: '{"ok":true}' }] }],
            usage: { input_tokens: 10, output_tokens: 3 },
          };
        if (kind === 'anthropic')
          return {
            content: [{ type: 'tool_use', name: 'emit_artifact', input: { ok: true } }],
            usage: { input_tokens: 10, output_tokens: 3, cache_read_input_tokens: 2 },
          };
        if (kind === 'gemini')
          return {
            candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"ok":true}' }] } }],
            usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 3 },
          };
        return {
          choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 3 },
        };
      },
    });
    const out = await provider.generate(request);
    assert.equal(out.value.ok, true);
    assert.equal(out.usage.outputTokens, 3);
    assert.ok(seen.url.startsWith('https://'));
    assert.equal(seen.body.model ?? 'test-model', 'test-model');
    if (kind === 'openai') {
      assert.equal(seen.body.store, false);
      assert.deepEqual(seen.body.text.format.schema, schema);
    }
    if (kind === 'anthropic') {
      assert.equal(seen.body.tool_choice.name, 'emit_artifact');
      assert.equal(out.usage.inputTokens, 12);
    }
  });
test('model output fails closed on undeclared props, missing fields, executable instructions', () => {
  assert.throws(() => validateOutput({ ok: true, code: 'eval(1)' }, schema));
  assert.throws(() => validateOutput({}, schema));
  assert.throws(() => validateOutput(JSON.parse('{"ok":true,"__proto__":{"admin":true}}'), schema));
  assert.throws(() => checkSchema({ type: 'object', evil: true }));
});
test('API adapter detects refusal, incomplete output and malformed JSON', async () => {
  for (const payload of [
    { status: 'incomplete' },
    { output: [{ content: [{ type: 'refusal' }] }] },
    { output_text: 'not json' },
  ]) {
    const p = new ApiProvider({
      kind: 'openai',
      key: 'test-key',
      model: 'test-model',
      request: async () => payload,
    });
    await assert.rejects(() => p.generate(request));
  }
});
test('vision payloads are bounded and typed, cannot reference arbitrary remote images', async () => {
  const p = new ApiProvider({
    kind: 'openai',
    key: 'test-key',
    model: 'test-model',
    request: () => assert.fail('must not send'),
  });
  await assert.rejects(
    () => p.generate({ ...request, images: [{ dataUrl: 'https://metadata.internal/image' }] }),
    /bounded|image/i,
  );
});
test('HTTP egress rejects unapproved, insecure and private loopback targets before transport', async () => {
  for (const url of ['http://api.openai.com/v1', 'https://127.0.0.1/', 'https://bad.example/'])
    await assert.rejects(() =>
      requestJson(url, { allowedHosts: ['api.openai.com', '127.0.0.1'], body: {} }),
    );
});
test('data contracts validate nested types, enum, array size and format', () => {
  const s = {
    type: 'object',
    required: ['id', 'kind'],
    additionalProperties: false,
    properties: {
      id: { type: 'integer' },
      kind: { enum: ['a', 'b'] },
      at: { type: 'string', format: 'date-time' },
    },
  };
  assert.equal(validateData({ id: 2, kind: 'a' }, s).id, 2);
  for (const v of [
    { id: '2', kind: 'a' },
    { id: 2, kind: 'c' },
    { id: 2, kind: 'a', at: 'not-date' },
  ])
    assert.throws(() => validateData(v, s));
});
for (const kind of ['codex-cli', 'claude-cli'])
  test(`${kind}: shell-free executable contract, stdin, safety flags and usage (fake CLI)`, async (t) => {
    const dir = await mkdtemp(join(tmpdir(), 'atelier-cli-fixture-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const exe = join(dir, 'fake-cli');
    await writeFile(
      exe,
      `#!/usr/bin/env node
const fs=require('node:fs');const a=process.argv.slice(2);if(a.includes('--version')){console.log('contract-fixture 1');process.exit(0)}if(a.includes('--help')){console.log('--sandbox --output-schema --output-last-message --ephemeral --bare --tools --json-schema --no-session-persistence --strict-mcp-config --ignore-user-config --ignore-rules --model --effort');process.exit(0)}
let input='';process.stdin.on('data',x=>input+=x);process.stdin.on('end',()=>{if(!input.includes('project-data'))process.exit(7);if(a.includes('exec')){if(a[a.indexOf('--sandbox')+1]!=='read-only'||!a.includes('--ephemeral'))process.exit(8);fs.writeFileSync(a[a.indexOf('--output-last-message')+1],JSON.stringify({ok:true}));console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:11,output_tokens:3}}));}else{if(!a.includes('--bare')||a[a.indexOf('--tools')+1]!==''||!a.includes('--strict-mcp-config')||a[a.indexOf('--model')+1]!=='test-model'||a[a.indexOf('--effort')+1]!=='high')process.exit(9);console.log(JSON.stringify({structured_output:{ok:true},usage:{input_tokens:11,output_tokens:3},is_error:false}));}});`,
    );
    await chmod(exe, 0o700);
    const p = new CliProvider({ kind, executable: exe, home: dir, model: 'test-model' });
    assert.ok((await p.doctor()).safetyFlags.length >= 4);
    const out = await p.generate(request);
    assert.equal(out.value.ok, true);
    assert.equal(out.usage.inputTokens, 11);
    await assert.rejects(
      () => p.generate({ ...request, images: [{ dataUrl: 'data:image/png;base64,AA==' }] }),
      /API vision/i,
    );
  });
test('Claude CLI defaults pin Opus 4.8 at high effort', () => {
  const provider = new CliProvider({ kind: 'claude-cli', home: '/dedicated/home' });
  assert.equal(provider.model, 'claude-opus-4-8');
  assert.equal(provider.effort, 'high');
});
test('Claude CLI connection persists the pinned default model and effort', async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  const runner = f.service.registerRunner(f.who, f.tenant.id, f.project.id, {
    name: 'Claude runner',
    providers: ['claude-cli'],
  });
  const connection = f.service.createConnection(f.who, f.tenant.id, {
    projectId: f.project.id,
    name: 'Claude account',
    kind: 'claude-cli',
    runnerId: runner.id,
  });
  assert.equal(connection.config.model, 'claude-opus-4-8');
  assert.equal(connection.config.effort, 'high');
});
test('CLI process enforces timeout, cancellation and maximum output', async () => {
  await assert.rejects(
    () => runProcess(process.execPath, ['-e', 'setTimeout(()=>{},5000)'], { timeoutMs: 40 }),
    /deadline/,
  );
  const ac = new AbortController();
  setTimeout(() => ac.abort(), 20);
  await assert.rejects(
    () => runProcess(process.execPath, ['-e', 'setTimeout(()=>{},5000)'], { signal: ac.signal }),
    /cancelled/,
  );
  await assert.rejects(
    () =>
      runProcess(process.execPath, ['-e', 'process.stdout.write("a".repeat(10000))'], {
        maxBytes: 100,
      }),
    /byte limit/,
  );
});
test('CLI environment preserves OS account identity but strips control-plane and unrelated tenant secrets', () => {
  const env = cliEnvironment('claude-cli', {
    home: '/dedicated/home',
    env: {
      PATH: '/usr/bin',
      USER: 'runner',
      LOGNAME: 'runner',
      ATELIER_MASTER_KEYS: 'secret',
      DATABASE_URL: 'private',
      OPENAI_API_KEY: 'other',
      ANTHROPIC_API_KEY: 'own',
    },
  });
  assert.equal(env.HOME, '/dedicated/home');
  assert.equal(env.USER, 'runner');
  assert.equal(env.LOGNAME, 'runner');
  assert.equal(env.ATELIER_MASTER_KEYS, undefined);
  assert.equal(env.OPENAI_API_KEY, undefined);
  assert.equal(env.ANTHROPIC_API_KEY, 'own');
});
