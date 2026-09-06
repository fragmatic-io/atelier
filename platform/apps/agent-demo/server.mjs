// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/** Deliberately local demonstration. No live model is simulated as an AI success.
 * Normal durable jobs, authorization, data bindings and writes are exercised. */
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { loadConfig, openServices } from '../../packages/control-plane/src/config.mjs';
import { createControlServer } from '../../packages/control-plane/src/server.mjs';
import { BuildPipeline, Worker } from '../../packages/control-plane/src/pipeline.mjs';
import { AgentHostBridge, SqliteToolReceipts } from '../../packages/conversation/src/host.mjs';
import { SqliteActionLedger } from '../../packages/host-sdk/src/index.mjs';
import { assert, safeError } from '../../packages/control-plane/src/util.mjs';
if (process.env.NODE_ENV === 'production')
  throw new Error(
    'This example has a fixed local identity and offline model fixture. Production mode is refused.',
  );
const config = await loadConfig({
  ...process.env,
  PORT: process.env.CONTROL_PORT ?? '4310',
  ATELIER_ENABLE_EXAMPLES: 'true',
});
const services = openServices(config);
const { db, service } = services;
let link;
try {
  link = JSON.parse(await readFile(join(config.dataDir, 'agent-demo-link.json'), 'utf8'));
} catch {
  db.close();
  throw new Error(
    'First run node scripts/seed-experiences.mjs. It runs actual browser checks before publishing the curated reference components.',
  );
}
const fixtureFactory = () => ({
  generate: async (request) => {
    const input = request.input ?? {};
    if (!Array.isArray(input.messages) || !Array.isArray(input.components))
      throw new Error(
        'The offline fixture handles conversation turns only, not source generation.',
      );
    const base = { message: '', toolCalls: [], calculations: [], artifacts: [], suggestions: [] };
    const latest = input.messages.filter((m) => m.role === 'user').at(-1)?.content?.text ?? '';
    const customer = /customer|northstar|account|risk|check.in/i.test(latest);
    const sources = Object.keys(input.datasets ?? {});
    const component = input.components.find((c) => c.grounding === (customer ? 'bound' : 'static'));
    let value;
    if (customer && !sources.length) {
      value = {
        ...base,
        message:
          'Explicit offline fixture: I will request the current customer through the authorized host API. No live model was called.',
        toolCalls: [
          {
            capabilityId: 'customer.get',
            inputJson: JSON.stringify({ customerId: input.context.customerId }),
          },
        ],
      };
    } else if (customer && component) {
      value = {
        ...base,
        message:
          'This interactive component is bound to the actual host result. A check-in still requires your explicit confirmation and current backend authorization.',
        artifacts: [
          {
            title: component.name,
            componentId: component.id,
            bindingJson: JSON.stringify({ customer: { source: sources.at(-1), path: '' } }),
            dataJson: '{}',
          },
        ],
        suggestions: ['Show a delivery board', 'Inspect customer context'],
      };
    } else {
      value = {
        ...base,
        message:
          'Offline demonstration, not an AI response: this is an approved React reference component from this project.',
        artifacts: component
          ? [
              {
                title: component.name,
                componentId: component.id,
                bindingJson: '{}',
                dataJson: '{}',
              },
            ]
          : [],
        suggestions: ['Inspect the customer risk'],
      };
    }
    return {
      value,
      usage: { inputTokens: 0, outputTokens: 0 },
      provider: 'controlled-offline-fixture',
      model: 'no-live-model',
    };
  },
});
const pipeline = new BuildPipeline(service, {
  apiFactory: fixtureFactory,
  owner: 'local-agent-demo',
});
const worker = new Worker(pipeline);
worker.start();
const control = createControlServer(service, {
  origin: config.origin,
  production: false,
  worker,
  enableExamples: true,
});
await new Promise((ok, bad) => {
  control.server.once('error', bad);
  control.server.listen(config.port, config.bind, ok);
});
const dataDir = join(config.dataDir, 'agent-host');
await mkdir(dataDir, { recursive: true, mode: 0o700 });
const business = new DatabaseSync(join(dataDir, 'business.sqlite'));
business.exec(
  "PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;CREATE TABLE IF NOT EXISTS customers(id TEXT PRIMARY KEY,name TEXT NOT NULL,risk INTEGER NOT NULL,interventions INTEGER NOT NULL DEFAULT 0);CREATE TABLE IF NOT EXISTS operations(id TEXT PRIMARY KEY,result TEXT NOT NULL);INSERT OR IGNORE INTO customers VALUES('northstar','Northstar Retail',68,0)",
);
const ledger = new SqliteActionLedger(join(dataDir, 'ledger.sqlite'));
const receipts = new SqliteToolReceipts(business);
const subject = {
  id: 'demo-operator',
  role: 'support_manager',
  permissions: ['customer.read', 'customer.intervene'],
};
const port = Number(process.env.HOST_PORT ?? 4311),
  origin = `http://127.0.0.1:${port}`;
let confirmationKey;
try {
  confirmationKey = Buffer.from(
    await readFile(join(dataDir, 'confirmation.key'), 'utf8'),
    'base64',
  );
} catch {
  confirmationKey = randomBytes(32);
  await writeFile(join(dataDir, 'confirmation.key'), confirmationKey.toString('base64'), {
    mode: 0o600,
    flag: 'wx',
  });
}
function once(operationId, operation) {
  business.exec('BEGIN IMMEDIATE');
  try {
    const previous = business.prepare('SELECT result FROM operations WHERE id=?').get(operationId);
    if (previous) {
      business.exec('COMMIT');
      return JSON.parse(previous.result);
    }
    const result = operation();
    business.prepare('INSERT INTO operations VALUES(?,?)').run(operationId, JSON.stringify(result));
    business.exec('COMMIT');
    return result;
  } catch (error) {
    business.exec('ROLLBACK');
    throw error;
  }
}
const bridge = new AgentHostBridge({
  ...link,
  origin: config.origin,
  frameOrigin: origin,
  ledger,
  receipts,
  confirmationKey,
  authorize: async ({ subject: s, input, capability }) =>
    s.id === subject.id &&
    input.customerId === 'northstar' &&
    capability.requiredPermissions.every((p) => s.permissions.includes(p)),
  loaders: {
    'customer.get': async () => {
      const c = business.prepare('SELECT * FROM customers WHERE id=?').get('northstar');
      return {
        id: c.id,
        name: c.name,
        riskScore: c.risk,
        status: c.interventions ? 'healthy' : 'at_risk',
        email: 'private@example.test',
      };
    },
  },
  executors: {
    'intervention.create': async ({ input, operationId }) =>
      once(operationId, () => {
        business
          .prepare('UPDATE customers SET interventions=interventions+1 WHERE id=?')
          .run(input.customerId);
        return { id: operationId, status: 'created' };
      }),
  },
});
const csrf = randomBytes(32).toString('base64url');
const directory = fileURLToPath(new URL('./', import.meta.url));
const assets = {
  '/': 'index.html',
  '/host.mjs': 'host.mjs',
  '/lab.css': '../studio/web/lab.css',
  '/client.mjs': '../../packages/conversation/src/client.mjs',
  '/journal.mjs': '../../packages/conversation/src/journal.mjs',
  '/chat.mjs': '../../packages/conversation/src/chat.mjs',
  '/frame.mjs': '../../packages/conversation/src/frame.mjs',
};
const send = (res, status, value) => {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(value));
};
const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader(
    'Content-Security-Policy',
    `default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-src ${config.origin}; frame-ancestors 'none'; object-src 'none'; base-uri 'none'`,
  );
  try {
    assert(req.headers.host === `127.0.0.1:${port}`, 400, 'HOST_DENIED', 'Invalid host header');
    if (req.method === 'GET') {
      if (req.url === '/api/bootstrap')
        return send(res, 200, {
          csrf,
          subject: { displayName: 'Demo operator', id: subject.id },
          context: { customerId: 'northstar' },
          tenantId: link.tenantId,
          projectId: link.projectId,
          customer: business.prepare('SELECT * FROM customers').get(),
        });
      assert(Object.hasOwn(assets, req.url), 404, 'NOT_FOUND', 'Not found');
      res.setHeader(
        'Content-Type',
        req.url.endsWith('.mjs')
          ? 'text/javascript; charset=utf-8'
          : req.url.endsWith('.css')
            ? 'text/css; charset=utf-8'
            : 'text/html; charset=utf-8',
      );
      res.end(await readFile(join(directory, assets[req.url])));
      return;
    }
    assert(
      req.method === 'POST' &&
        req.headers.origin === origin &&
        req.headers['x-csrf-token'] === csrf,
      403,
      'CSRF_FAILED',
      'Use the current host session',
    );
    assert(req.url === '/api/agent', 404, 'NOT_FOUND', 'Unknown endpoint');
    assert(
      req.headers['content-type']?.startsWith('application/json'),
      415,
      'CONTENT_TYPE',
      'Use JSON',
    );
    let bytes = 0;
    const chunks = [];
    for await (const c of req) {
      bytes += c.length;
      assert(bytes < 2 * 1024 * 1024, 413, 'BODY_TOO_LARGE', 'Request is too large');
      chunks.push(c);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const action = body.action;
    let result;
    if (action === 'confirm')
      result = await bridge.confirm({ subject, threadId: body.threadId, callId: body.callId });
    else if (action === 'execute')
      result = await bridge.execute({
        subject,
        threadId: body.threadId,
        callId: body.callId,
        ticket: body.input?.ticket,
        deny: body.input?.deny,
      });
    else if (action === 'client-lease')
      result = await bridge.clientLease({ subject, threadId: body.threadId, callId: body.callId });
    else if (action === 'client-result')
      result = await bridge.clientResult({
        subject,
        threadId: body.threadId,
        callId: body.callId,
        ...body.input,
      });
    else {
      const { host: untrustedHost, action: ignored, frameOrigin: untrustedOrigin, ...input } = body;
      if (action === 'create')
        input.input = { ...input.input, context: { customerId: 'northstar' } };
      result = await bridge.request(subject, action, input);
    }
    send(res, 200, result);
  } catch (error) {
    send(res, error.status ?? 500, { error: safeError(error) });
  }
});
server.listen(port, '127.0.0.1', () =>
  console.log(
    `Experience Lab: ${config.origin}/lab\nHost integration: ${origin}\nExplicit local identity and controlled offline model fixture; authorization and database writes are real.`,
  ),
);
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  server.close();
  await worker.stop();
  await control.close();
  ledger.close();
  business.close();
  db.close();
  process.exit(0);
}
process.on('SIGTERM', close);
process.on('SIGINT', close);
