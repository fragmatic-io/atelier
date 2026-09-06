// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/** Local-only integration example. Replace the demo subject with your real host session. */
import { chmodSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HostBridge, SqliteActionLedger } from '../../packages/host-sdk/src/index.mjs';
import { assert, safeError } from '../../packages/control-plane/src/util.mjs';
if (process.env.NODE_ENV === 'production')
  throw new Error(
    'This example uses a fixed DEMO user and must not run in production. Integrate HostBridge with your application authentication.',
  );
const tenantId = process.env.ATELIER_TENANT_ID,
  projectId = process.env.ATELIER_PROJECT_ID,
  token = process.env.ATELIER_HOST_TOKEN;
assert(
  tenantId && projectId && token,
  400,
  'CONFIG_REQUIRED',
  'Set ATELIER_TENANT_ID, ATELIER_PROJECT_ID and ATELIER_HOST_TOKEN from Studio; publish a staging customer.detail.right-rail release first.',
);
const data = resolve(process.env.ATELIER_HOST_DATA_DIR ?? '.atelier-host-data');
await mkdir(data, { recursive: true, mode: 0o700 });
const business = new DatabaseSync(join(data, 'business.sqlite'));
business.exec(
  "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS customers(id TEXT PRIMARY KEY,status TEXT NOT NULL,risk_score INTEGER NOT NULL,interventions INTEGER NOT NULL) STRICT; INSERT OR IGNORE INTO customers VALUES('northstar','at_risk',72,0);",
);
chmodSync(join(data, 'business.sqlite'), 0o600);
business.exec(
  'CREATE TABLE IF NOT EXISTS business_operations(id TEXT PRIMARY KEY,result TEXT NOT NULL) STRICT',
);
/** The business update and its idempotency record commit in ONE transaction. */
function once(operationId, work) {
  business.exec('BEGIN IMMEDIATE');
  try {
    const previous = business
      .prepare('SELECT result FROM business_operations WHERE id=?')
      .get(operationId);
    if (previous) {
      business.exec('COMMIT');
      return JSON.parse(previous.result);
    }
    const result = work();
    business
      .prepare('INSERT INTO business_operations VALUES(?,?)')
      .run(operationId, JSON.stringify(result));
    business.exec('COMMIT');
    return result;
  } catch (e) {
    business.exec('ROLLBACK');
    throw e;
  }
}
let key;
try {
  key = await readFile(join(data, 'confirmation.key'));
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
  key = randomBytes(32);
  await writeFile(join(data, 'confirmation.key'), key, { mode: 0o600 });
}
const ledger = new SqliteActionLedger(join(data, 'actions.sqlite')),
  subject = {
    id: 'local-demo-operator',
    role: 'support_manager',
    permissions: ['customer.read', 'customer.intervene', 'customer.archive'],
  };
const bridge = new HostBridge({
  tenantId,
  projectId,
  environment: 'staging',
  origin: process.env.ATELIER_CONTROL_ORIGIN ?? 'http://127.0.0.1:4310',
  token,
  confirmationKey: key,
  ledger,
  authorize: async ({ context, input }) => context?.customerId === 'northstar',
  loaders: {
    'customer.get': async ({ input }) => {
      assert(input.customerId === 'northstar', 403, 'ENTITY_DENIED', 'Unknown demo customer');
      const row = business.prepare('SELECT * FROM customers WHERE id=?').get('northstar');
      return {
        id: row.id,
        name: 'Northstar Labs',
        email: 'private.demo@example.test',
        status: row.status,
        riskScore: row.risk_score,
        openIncidents: 3,
        plan: 'Business',
        lastContactAt: '2026-08-24T09:00:00Z',
        nextBestAction: row.interventions
          ? 'Intervention recorded — follow up with the account team'
          : 'Review the escalation and record an intervention',
      };
    },
  },
  executors: {
    'intervention.create': async ({ input, context, operationId }) => {
      assert(
        input.customerId === context.customerId,
        403,
        'ENTITY_DENIED',
        'Action targets a different customer',
      );
      return once(operationId, () => {
        business
          .prepare('UPDATE customers SET interventions=interventions+1,status=? WHERE id=?')
          .run('escalated', context.customerId);
        return { ok: true, operationId };
      });
    },
    'customer.archive': async ({ input, context, operationId }) => {
      assert(
        input.customerId === context.customerId,
        403,
        'ENTITY_DENIED',
        'Action targets a different customer',
      );
      return once(operationId, () => {
        business
          .prepare('UPDATE customers SET status=? WHERE id=?')
          .run('archived', context.customerId);
        return { ok: true, operationId };
      });
    },
  },
});
const csrf = randomBytes(32).toString('base64url'),
  port = Number(process.env.HOST_PORT ?? 4311),
  origin = `http://127.0.0.1:${port}`,
  root = fileURLToPath(new URL('./', import.meta.url));
function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}
const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; object-src 'none'",
  );
  try {
    assert(req.headers.host === `127.0.0.1:${port}`, 400, 'HOST_DENIED', 'Invalid host');
    if (req.method === 'GET') {
      const assets = {
        '/': 'index.html',
        '/host.mjs': 'host.mjs',
        '/host.css': 'host.css',
        '/surface.mjs': '../../packages/surface/src/browser.mjs',
        '/surface.css': '../studio/web/surface.css',
        '/host-client.mjs': '../../packages/surface/src/host-client.mjs',
      };
      if (req.url === '/api/bootstrap') return json(res, 200, { csrf });
      assert(assets[req.url], 404, 'NOT_FOUND', 'Not found');
      res.setHeader(
        'Content-Type',
        req.url.endsWith('.mjs')
          ? 'text/javascript'
          : req.url.endsWith('.css')
            ? 'text/css'
            : 'text/html',
      );
      res.end(await readFile(join(root, assets[req.url])));
      return;
    }
    assert(
      req.method === 'POST' &&
        req.headers.origin === origin &&
        req.headers['x-csrf-token'] === csrf,
      403,
      'CSRF_FAILED',
      'Use the authorized local app',
    );
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      assert(raw.length < 100000, 413, 'BODY_TOO_LARGE', 'Request is too large');
    }
    const body = JSON.parse(raw);
    const args = { ...body, subject, context: { customerId: 'northstar' } };
    if (req.url === '/api/atelier/resolve')
      return json(res, 200, await bridge.resolve(subject, body.slotId, args.context));
    if (req.url === '/api/atelier/load')
      return json(res, 200, await bridge.load({ ...args, input: { customerId: 'northstar' } }));
    if (req.url === '/api/atelier/confirm') return json(res, 200, await bridge.confirm(args));
    if (req.url === '/api/atelier/dispatch') return json(res, 200, await bridge.dispatch(args));
    throw new Error('Unknown endpoint');
  } catch (e) {
    json(res, e.status ?? 500, { error: safeError(e) });
  }
});
server.listen(port, '127.0.0.1', () =>
  console.log(
    `Local host-app example: ${origin} (fixed demo user; not a production authentication example)`,
  ),
);
for (const sig of ['SIGINT', 'SIGTERM'])
  process.on(sig, () =>
    server.close(() => {
      business.close();
      ledger.close();
      process.exit(0);
    }),
  );
