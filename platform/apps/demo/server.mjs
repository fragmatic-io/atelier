// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { scanProject } from '../../packages/scanner/src/index.mjs';
import { buildProjectModel } from '../../packages/project-model/src/index.mjs';
import { compileAdditiveExperience } from '../../packages/experience-compiler/src/index.mjs';
import { Evaluator } from '../../packages/evaluator/src/index.mjs';
import {
  createRuntime,
  generateSigningKeyPair,
  signBundle,
  verifySignedBundle,
} from '../../packages/runtime/src/index.mjs';
import {
  DEFAULT_STYLES,
  escapeHtml,
  renderBundle,
} from '../../packages/adapters/dom/src/index.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const FIXTURE = join(ROOT, 'fixtures/sample-app');

const CUSTOMERS = {
  c_101: {
    id: 'c_101',
    name: 'Aperture Labs',
    email: 'ops@aperture.invalid',
    status: 'at_risk',
    riskScore: 82,
    plan: 'Enterprise',
    openIncidents: 3,
    lastContactAt: '2026-09-03T08:30:00Z',
    nextBestAction: 'Call the account owner and review incident INC-492.',
  },
  c_202: {
    id: 'c_202',
    name: 'Northstar Manufacturing',
    email: 'admin@northstar.invalid',
    status: 'healthy',
    riskScore: 18,
    plan: 'Growth',
    openIncidents: 0,
    lastContactAt: '2026-09-01T12:00:00Z',
    nextBestAction: 'No intervention required.',
  },
};
const interventions = [];

async function loadConfig() {
  const module = await import(
    `${pathToFileURL(join(FIXTURE, 'atelier.config.mjs')).href}?t=${Date.now()}`
  );
  return module.default;
}

function mergeById(a = [], b = []) {
  return [...new Map([...a, ...b].map((x) => [x.id, x])).values()];
}

export async function buildDemoState() {
  const config = await loadConfig();
  const scan = await scanProject(FIXTURE, { projectId: config.projectId, typescript: false });
  scan.slots = mergeById(scan.slots, config.slots);
  scan.permissions = mergeById(
    scan.permissions,
    config.permissions.map((id) => ({ id })),
  );
  const projectModel = buildProjectModel(scan, {
    projectId: config.projectId,
    capabilityOverrides: config.capabilityOverrides,
    designGenome: scan.designGenome,
  });
  const context = {
    projectId: projectModel.projectId,
    projectVersion: projectModel.projectVersion,
    slotId: 'customer.detail.right-rail',
    role: 'support_manager',
    permissions: ['customer.read', 'customer.intervene', 'customer.archive'],
    taskCluster: 'understand-and-act',
    entity: { type: 'Customer', id: 'c_101' },
    locale: 'en',
    density: projectModel.designGenome.grammar.density,
    userId: 'u_demo',
  };
  const compiled = compileAdditiveExperience({
    actor: context.role,
    context,
    goal: 'Understand this customer escalation and choose the next intervention',
    successCriteria: [
      'Customer risk and next-best action are visible without leaving the record.',
      'Intervention and archive actions are permission checked and confirmed.',
      'Customer email is not exposed in this slot.',
    ],
    projectModel,
    slotId: context.slotId,
    contextClass: {
      role: context.role,
      taskCluster: context.taskCluster,
      entityType: context.entity.type,
      locale: context.locale,
      density: context.density,
    },
  });
  const evaluation = new Evaluator().evaluateBundle(compiled.bundle, projectModel);
  if (!evaluation.approved)
    throw new Error(`Demo bundle failed evaluation: ${JSON.stringify(evaluation.blockers)}`);
  const keys = generateSigningKeyPair({ keyId: 'demo-key' });
  const signedBundle = signBundle(compiled.bundle, keys);
  verifySignedBundle(signedBundle, { [keys.keyId]: keys.publicKey });
  const runtime = createRuntime({
    projectModel,
    publicKeys: { [keys.keyId]: keys.publicKey },
    bundles: [{ context, bundle: signedBundle }],
    loaders: {
      'customer.get': async (ctx) => CUSTOMERS[ctx.entity?.id ?? 'c_101'] ?? null,
    },
    executors: {
      'intervention.create': async (input, ctx) => {
        if (!CUSTOMERS[input.customerId ?? ctx.entity?.id]) throw new Error('Customer not found');
        const created = {
          id: `int_${interventions.length + 1}`,
          customerId: input.customerId ?? ctx.entity.id,
          kind: input.kind,
          reason: input.reason,
          createdAt: new Date().toISOString(),
        };
        interventions.push(created);
        return created;
      },
      'customer.archive': async (_input, ctx) => {
        const customer = CUSTOMERS[ctx.entity?.id];
        if (!customer) throw new Error('Customer not found');
        customer.status = 'archived';
        return { id: customer.id, status: 'archived' };
      },
    },
    confirm: async ({ context: actionContext }) => actionContext.confirmed === true,
  });
  return { config, projectModel, context, compiled, evaluation, keys, signedBundle, runtime };
}

function json(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(body);
}

async function bodyJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function renderHostPage(state, customerId = 'c_101') {
  const context = { ...state.context, entity: { type: 'Customer', id: customerId } };
  let resolved = await state.runtime.resolver.resolve(
    context,
    state.runtime.slots.get(context.slotId),
  );
  // The structure is cohort-cached; a new entity ID should still resolve to the
  // same exact structural key because entity IDs never enter that key.
  const data = {};
  for (const query of resolved.bundle.experiencePlan.queryPlan) {
    data[query.capabilityId] = await state.runtime.data.resolve(
      { source: query.capabilityId, select: query.fields },
      context,
    );
  }
  const extension = renderBundle(resolved.bundle, data);
  const customer = CUSTOMERS[customerId];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(customer.name)} · Support Console</title><style>
  :root{--surface:#fff;--background:#f7f7f5;--text:#171717;--muted:#efefeb;--border:#deded8;--primary:#222;--primary-contrast:#fff;--danger:#a11f2b;--radius:.75rem;font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:var(--text);background:var(--background)}*{box-sizing:border-box}body{margin:0}.shell{display:grid;grid-template-columns:220px 1fr;min-height:100vh}.nav{padding:1.25rem;border-right:1px solid var(--border);background:#f1f1ed}.nav strong{display:block;margin-bottom:1.5rem}.nav a{display:block;padding:.55rem;color:inherit;text-decoration:none;border-radius:.5rem}.nav a.active{background:#fff}.content{padding:2rem}.layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(290px,380px);gap:1.5rem;max-width:1200px;margin:auto}.host-card{background:#fff;border:1px solid var(--border);border-radius:var(--radius);padding:1.25rem}.host-header{display:flex;justify-content:space-between;gap:1rem;align-items:start}.host-header h1{margin:0}.muted{color:#6b7280}.status{padding:.25rem .5rem;border-radius:999px;background:#fef3c7;color:#92400e;font-size:.8rem}.host-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:.75rem;margin-top:1.5rem}.host-grid>div{padding:1rem;background:#fafaf8;border-radius:.6rem}.host-grid strong{display:block;font-size:1.5rem}.activity{margin-top:1rem}.activity li{padding:.8rem 0;border-bottom:1px solid #eee}@media(max-width:900px){.shell{grid-template-columns:1fr}.nav{display:none}.layout{grid-template-columns:1fr}.atelier-rail{order:-1}}${DEFAULT_STYLES}</style></head><body>
  <div class="shell"><nav class="nav"><strong>Support Console</strong><a>Inbox</a><a class="active">Customers</a><a>Incidents</a><a>Reports</a></nav><main class="content"><div class="layout">
    <div><section class="host-card"><div class="host-header"><div><p class="muted">Customer ${escapeHtml(customer.id)}</p><h1>${escapeHtml(customer.name)}</h1><p class="muted">${escapeHtml(customer.plan)} plan</p></div><span class="status">${escapeHtml(customer.status)}</span></div><div class="host-grid"><div><span class="muted">Risk score</span><strong>${escapeHtml(customer.riskScore)}</strong></div><div><span class="muted">Open incidents</span><strong>${escapeHtml(customer.openIncidents)}</strong></div><div><span class="muted">Last contact</span><strong>${escapeHtml(customer.lastContactAt.slice(0, 10))}</strong></div></div></section><section class="host-card activity"><h2>Recent activity</h2><ol><li>INC-492 moved to investigating</li><li>Health score dropped by 14 points</li><li>Account owner requested a callback</li></ol></section></div>
    <aside class="atelier-rail"><p class="muted">Additive Atelier extension · ${escapeHtml(resolved.source)}</p><div id="atelier-slot">${extension}</div></aside>
  </div></main></div><script>
  document.getElementById('atelier-slot').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-atelier-action]'); if (!button) return;
    const action = button.dataset.atelierAction;
    const confirmed = window.confirm('Confirm ' + action + '?'); if (!confirmed) return;
    const input = action === 'intervention.create' ? { customerId: '${escapeHtml(customer.id)}', kind: 'call', reason: 'Atelier demo intervention' } : {};
    const response = await fetch('/api/atelier/action', { method: 'POST', headers: { 'content-type': 'application/json', 'x-atelier-confirmed': 'true' }, body: JSON.stringify({ capabilityId: action, input, customerId: '${escapeHtml(customer.id)}' }) });
    const payload = await response.json(); window.alert(payload.ok ? 'Action completed' : payload.message);
  });
  </script></body></html>`;
}

export async function createDemoServer({ port = 4310, host = '127.0.0.1' } = {}) {
  const state = await buildDemoState();
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host ?? `${host}:${port}`}`);
      if (req.method === 'GET' && url.pathname === '/health')
        return json(res, 200, {
          ok: true,
          projectVersion: state.projectModel.projectVersion,
          bundleId: state.signedBundle.bundleId,
          evaluation: state.evaluation.score,
        });
      if (req.method === 'GET' && url.pathname === '/api/atelier/bundle')
        return json(res, 200, state.signedBundle);
      if (req.method === 'GET' && url.pathname.startsWith('/api/customers/')) {
        const id = url.pathname.split('/').at(-1);
        const customer = CUSTOMERS[id];
        return customer
          ? json(res, 200, customer)
          : json(res, 404, { ok: false, message: 'Not found' });
      }
      if (req.method === 'POST' && url.pathname === '/api/atelier/action') {
        const body = await bodyJson(req);
        const context = {
          ...state.context,
          entity: { type: 'Customer', id: body.customerId ?? 'c_101' },
          confirmed: req.headers['x-atelier-confirmed'] === 'true',
          bundleId: state.signedBundle.bundleId,
        };
        const result = await state.runtime.dispatcher.dispatch(
          body.capabilityId,
          body.input ?? {},
          context,
        );
        return json(res, 200, result);
      }
      if (
        req.method === 'GET' &&
        (url.pathname === '/' || /^\/customers\/[^/]+$/.test(url.pathname))
      ) {
        const id = url.pathname === '/' ? 'c_101' : url.pathname.split('/').at(-1);
        if (!CUSTOMERS[id]) return json(res, 404, { ok: false, message: 'Not found' });
        const html = await renderHostPage(state, id);
        res.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'content-security-policy':
            "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
          'x-frame-options': 'DENY',
          'x-content-type-options': 'nosniff',
        });
        return res.end(html);
      }
      return json(res, 404, { ok: false, message: 'Not found' });
    } catch (error) {
      return json(
        res,
        error.code === 'PERMISSION_DENIED'
          ? 403
          : error.code === 'ACTION_NOT_CONFIRMED'
            ? 409
            : 500,
        {
          ok: false,
          code: error.code ?? 'DEMO_ERROR',
          message: error.message,
          details: error.details,
        },
      );
    }
  });
  await new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolvePromise);
  });
  const address = server.address();
  const actualPort = typeof address === 'object' ? address.port : port;
  return {
    state,
    server,
    url: `http://${host}:${actualPort}`,
    close: () =>
      new Promise((resolvePromise, reject) =>
        server.close((error) => (error ? reject(error) : resolvePromise())),
      ),
  };
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const port = Number(process.env.PORT ?? 4310);
  const demo = await createDemoServer({ port });
  console.log(`Atelier V2 demo: ${demo.url}`);
}
