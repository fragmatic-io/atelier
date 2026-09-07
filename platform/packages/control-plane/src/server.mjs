// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { experienceRoutes } from '../../conversation/src/http.mjs';
import { createServer } from 'node:http';
import { isIP } from 'node:net';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { projectAccess, tenantAccess } from './access.mjs';
import {
  assert,
  AppError,
  safeError,
  noPrototypeKeys,
  parseJson,
  hash,
  id,
  canonical,
} from './util.mjs';
import { safeJob } from './services.mjs';
import { mineWorkflowOpportunities } from '../../workflow/src/index.mjs';
const webRoot = fileURLToPath(new URL('../../../apps/studio/web/', import.meta.url));
const surfaceFile = fileURLToPath(new URL('../../surface/src/browser.mjs', import.meta.url));
const redocFile = createRequire(import.meta.url).resolve('redoc/bundles/redoc.standalone.js');
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
/** Trust one sanitizing loopback proxy, never arbitrary X-Forwarded-For chains.
 * The proxy must OVERWRITE X-Real-IP. Docker/non-loopback proxies are not trusted. */
export function clientAddress(req, trustLoopbackProxy = false) {
  const peer = req.socket.remoteAddress ?? 'unknown';
  if (!trustLoopbackProxy) return peer;
  const loopback = peer === '127.0.0.1' || peer === '::1' || peer === '::ffff:127.0.0.1';
  const forwarded = req.headers['x-real-ip'];
  if (!loopback || typeof forwarded !== 'string' || !isIP(forwarded)) return peer;
  return forwarded;
}
async function readJson(req, max = 10 * 1024 * 1024) {
  assert(
    String(req.headers['content-type'] ?? '').split(';')[0] === 'application/json',
    415,
    'CONTENT_TYPE',
    'Use application/json',
  );
  const declared = Number(req.headers['content-length'] ?? 0);
  assert(declared <= max, 413, 'BODY_TOO_LARGE', 'Request exceeds 10 MB');
  let size = 0;
  const chunks = [];
  for await (const b of req) {
    size += b.length;
    if (size > max) throw new AppError(413, 'BODY_TOO_LARGE', 'Request exceeds 10 MB');
    chunks.push(b);
  }
  let value;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new AppError(400, 'INVALID_JSON', 'Request is not valid JSON');
  }
  noPrototypeKeys(value);
  assert(
    value && typeof value === 'object' && !Array.isArray(value),
    400,
    'INVALID_JSON',
    'Request must be a JSON object',
  );
  return value;
}
function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(JSON.stringify(body));
}
export function createControlServer(
  service,
  {
    origin = 'http://127.0.0.1:4310',
    production = false,
    trustLoopbackProxy = false,
    worker = null,
    log = (event) => console.log(JSON.stringify(event)),
    demo = null,
    enableExamples = false,
  } = {},
) {
  const configured = new URL(origin);
  const experiences = experienceRoutes(service, { production, enableExamples });
  assert(
    !production || configured.protocol === 'https:',
    500,
    'HTTPS_REQUIRED',
    'Production requires an HTTPS public origin behind a TLS reverse proxy',
  );
  let shuttingDown = false;
  let requests = 0,
    failures = 0;
  const server = createServer(async (req, res) => {
    const requestId = randomUUID(),
      start = Date.now();
    requests++;
    res.setHeader('X-Request-ID', requestId);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'",
    );
    if (production)
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    try {
      assert(!shuttingDown, 503, 'DRAINING', 'Server is shutting down');
      const url = new URL(req.url, origin);
      assert(req.headers.host === configured.host, 400, 'INVALID_HOST', 'Host is not recognized');
      if (req.method === 'GET' && url.pathname === '/healthz')
        return send(res, 200, { status: 'ok', version: '2.3.0-rc.1' });
      if (req.method === 'GET' && url.pathname === '/readyz')
        return send(res, 200, {
          ready: !shuttingDown,
          database: service.db.get('SELECT 1 ok')?.ok === 1,
        });
      if (url.pathname.startsWith('/preview/') && req.method === 'GET') {
        const preview = await experiences.components.consumePreview(url.pathname.slice(9));
        res.removeHeader('X-Frame-Options');
        res.setHeader(
          'Content-Security-Policy',
          preview.csp + '; frame-ancestors ' + (preview.frameOrigin ?? configured.origin),
        );
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end(preview.html);
        return;
      }
      if (url.pathname.startsWith('/assets/') && req.method === 'GET') {
        const name = url.pathname.slice(8);
        assert(/^[A-Za-z0-9_.-]+$/.test(name), 404, 'NOT_FOUND', 'Asset not found');
        const modules = {
          'client.mjs': 'client.mjs',
          'agent-client.mjs': 'client.mjs',
          'journal.mjs': 'journal.mjs',
          'agent-journal.mjs': 'journal.mjs',
          'frame.mjs': 'frame.mjs',
          'artifact-frame.mjs': 'frame.mjs',
          'chat.mjs': 'chat.mjs',
        };
        const path =
          name === 'redoc.standalone.js'
            ? redocFile
            : modules[name]
              ? fileURLToPath(new URL('../../conversation/src/' + modules[name], import.meta.url))
              : name === 'surface.mjs'
                ? surfaceFile
                : join(webRoot, name);
        const data = await readFile(path);
        res.writeHead(200, {
          'Content-Type': mime[extname(name)] ?? 'application/octet-stream',
          'Cache-Control': 'no-cache',
        });
        res.end(data);
        return;
      }
      if (url.pathname.startsWith('/api-reference/') && req.method === 'GET') {
        assert(
          /^\/api-reference\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/.test(url.pathname),
          404,
          'NOT_FOUND',
          'API reference not found',
        );
        res.removeHeader('X-Frame-Options');
        res.setHeader(
          'Content-Security-Policy',
          "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self' data:; frame-ancestors 'self'; object-src 'none'; base-uri 'none'; form-action 'none'",
        );
        const data = await readFile(join(webRoot, 'api-docs.html'));
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end(data);
        return;
      }
      if (!url.pathname.startsWith('/api/')) {
        assert(req.method === 'GET', 405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
        const data = await readFile(
          join(webRoot, url.pathname === '/lab' ? 'lab.html' : 'index.html'),
        );
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end(data);
        return;
      }
      if (MUTATING.has(req.method)) {
        const originHeader = req.headers.origin;
        // A bearer token is allowed for server/runner calls, never with a foreign Origin.
        assert(
          (!originHeader && !!req.headers.authorization) || originHeader === configured.origin,
          403,
          'ORIGIN_DENIED',
          'Request origin is not allowed',
        );
        assert(
          req.headers['sec-fetch-site'] !== 'cross-site',
          403,
          'CROSS_SITE',
          'Cross-site requests are not allowed',
        );
      }
      const ip = clientAddress(req, trustLoopbackProxy);
      const body = MUTATING.has(req.method) ? await readJson(req) : {};
      if (req.method === 'POST' && url.pathname === '/api/auth/login') {
        const result = await service.auth.login(body, ip);
        return send(
          res,
          200,
          { user: result.user, csrf: result.csrf },
          {
            'Set-Cookie': `atelier_session=${result.session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${production ? '; Secure' : ''}`,
          },
        );
      }
      if (req.method === 'POST' && url.pathname === '/api/auth/accept-invitation') {
        service.auth.rate(`invite:${ip}`, { limit: 10, windowMs: 600000 });
        return send(res, 201, await service.acceptInvite(body));
      }
      const identity = service.auth.identity({
        authorization: req.headers.authorization,
        cookie: req.headers.cookie,
      });
      if (MUTATING.has(req.method)) service.auth.csrf(identity, req.headers['x-csrf-token']);
      service.auth.rate(`api:${identity.token?.id ?? identity.userId}`, {
        limit: 600,
        windowMs: 60000,
      });
      if (url.pathname === '/api/examples/support' && req.method === 'GET') {
        assert(enableExamples, 404, 'NOT_FOUND', 'Examples are disabled');
        const { createSnapshot } = await import('../../../scripts/snapshot.mjs');
        return send(
          res,
          200,
          await createSnapshot(
            fileURLToPath(new URL('../../../fixtures/sample-app/', import.meta.url)),
          ),
        );
      }
      if (url.pathname === '/api/me' && req.method === 'GET')
        return send(res, 200, service.auth.me(identity));
      if (url.pathname === '/api/auth/logout' && req.method === 'POST') {
        service.auth.logout(identity);
        return send(
          res,
          200,
          { signedOut: true },
          {
            'Set-Cookie': `atelier_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${production ? '; Secure' : ''}`,
          },
        );
      }
      if (url.pathname === '/api/auth/password' && req.method === 'POST')
        return send(res, 200, await service.auth.changePassword(identity, body));
      if (url.pathname === '/api/auth/mfa/setup' && req.method === 'POST')
        return send(res, 200, await service.auth.setupMfa(identity, body));
      if (url.pathname === '/api/auth/mfa/confirm' && req.method === 'POST')
        return send(res, 200, service.auth.confirmMfa(identity, body));
      if (url.pathname === '/api/auth/mfa/disable' && req.method === 'POST')
        return send(res, 200, await service.auth.disableMfa(identity, body));
      if (url.pathname === '/api/tenants' && req.method === 'POST')
        return send(res, 201, service.createTenant(identity, body));
      if (url.pathname === '/api/runner/claim' && req.method === 'POST')
        return send(res, 200, service.claimInference(identity, body));
      if (url.pathname === '/api/runner/heartbeat' && req.method === 'POST')
        return send(res, 200, service.heartbeatInference(identity, body.taskId, body));
      if (url.pathname === '/api/runner/complete' && req.method === 'POST')
        return send(res, 200, service.completeInference(identity, body.taskId, body));
      const parts = url.pathname.split('/').filter(Boolean);
      assert(
        parts[0] === 'api' && parts[1] === 'tenants' && parts[2],
        404,
        'NOT_FOUND',
        'Endpoint not found',
      );
      const t = parts[2];
      if (parts.length === 4 && parts[3] === 'overview' && req.method === 'GET')
        return send(res, 200, service.overview(identity, t));
      if (parts[3] === 'projects' && parts.length === 4) {
        if (req.method === 'GET') return send(res, 200, service.projects(identity, t));
        if (req.method === 'POST') return send(res, 201, service.createProject(identity, t, body));
      }
      if (parts[3] === 'members' && parts.length === 4 && req.method === 'GET')
        return send(res, 200, service.members(identity, t));
      if (parts[3] === 'invitations' && parts.length === 4 && req.method === 'POST')
        return send(res, 201, service.invite(identity, t, body));
      if (parts[3] === 'members' && parts.length === 5 && req.method === 'PATCH')
        return send(res, 200, service.changeMember(identity, t, parts[4], body));
      if (parts[3] === 'connections') {
        if (parts.length === 4 && req.method === 'GET')
          return send(res, 200, service.connections(identity, t));
        if (parts.length === 4 && req.method === 'POST')
          return send(res, 201, service.createConnection(identity, t, body));
        if (parts.length === 5 && req.method === 'DELETE')
          return send(res, 200, service.revokeConnection(identity, t, parts[4]));
      }
      if (parts[3] === 'audit' && parts.length === 4 && req.method === 'GET')
        return send(res, 200, service.audit(identity, t));
      assert(parts[3] === 'projects' && parts[4], 404, 'NOT_FOUND', 'Endpoint not found');
      const p = parts[4],
        resource = parts[5],
        rid = parts[6],
        action = parts[7];
      if (parts.length === 5) {
        if (req.method === 'GET') return send(res, 200, service.project(identity, t, p));
        if (req.method === 'PATCH')
          return send(res, 200, service.updateProject(identity, t, p, body));
        if (req.method === 'DELETE') return send(res, 200, service.archiveProject(identity, t, p));
      }
      const extension = await experiences.handle({
        identity,
        t,
        p,
        resource,
        rid,
        action,
        method: req.method,
        body,
        headers: req.headers,
      });
      if (extension) return send(res, extension.status, extension.data);
      if (resource === 'model' && req.method === 'GET')
        return send(res, 200, service.model(identity, t, p));
      if (resource === 'openapi' && req.method === 'GET')
        return send(res, 200, service.openApi(identity, t, p));
      if (resource === 'search' && req.method === 'GET')
        return send(res, 200, service.search(identity, t, p, url.searchParams.get('q') ?? ''));
      if (resource === 'sources' && req.method === 'POST')
        return send(res, 202, service.upload(identity, t, p, body, req.headers['idempotency-key']));
      if (resource === 'capabilities' && req.method === 'PATCH')
        return send(
          res,
          200,
          service.reviewCapability(identity, t, p, decodeURIComponent(rid), body),
        );
      if (resource === 'visual-review' && req.method === 'POST')
        return send(res, 202, service.queueVisualReview(identity, t, p, body.releaseId, body));
      if (resource === 'generate' && req.method === 'POST')
        return send(
          res,
          202,
          service.generate(identity, t, p, body, req.headers['idempotency-key']),
        );
      if (resource === 'jobs') {
        if (req.method === 'GET')
          return send(
            res,
            200,
            rid
              ? safeJob(service.store.job(projectAccess(service.db, identity, t, p), rid))
              : service.jobs(identity, t, p),
          );
        if (action === 'cancel' && req.method === 'POST')
          return send(
            res,
            200,
            service.store.cancel(projectAccess(service.db, identity, t, p, 'run'), rid),
          );
      }
      if (resource === 'releases') {
        if (req.method === 'GET')
          return send(
            res,
            200,
            rid ? service.release(identity, t, p, rid) : service.releases(identity, t, p),
          );
        if (req.method === 'POST' && action === 'review')
          return send(res, 200, service.approve(identity, t, p, rid, body));
        if (req.method === 'POST' && action === 'publish')
          return send(res, 200, service.publish(identity, t, p, rid, body));
        if (req.method === 'POST' && action === 'promote')
          return send(res, 201, service.promote(identity, t, p, rid));
      }
      if (resource === 'deployments' && req.method === 'GET') {
        projectAccess(service.db, identity, t, p);
        return send(
          res,
          200,
          service.db.all('SELECT * FROM deployments WHERE tenant_id=? AND project_id=?', t, p),
        );
      }
      if (resource === 'rollback' && req.method === 'POST')
        return send(res, 200, service.rollback(identity, t, p, body));
      if (resource === 'resolve' && req.method === 'POST')
        return send(res, 200, service.resolve(identity, t, p, body));
      if (resource === 'usage' && req.method === 'GET')
        return send(res, 200, service.usage(identity, t, p));
      if (resource === 'audit' && req.method === 'GET')
        return send(res, 200, service.audit(identity, t, p));
      if (resource === 'tokens') {
        if (req.method === 'GET') return send(res, 200, service.tokens(identity, t, p));
        if (req.method === 'POST') return send(res, 201, service.createToken(identity, t, p, body));
        if (req.method === 'DELETE')
          return send(res, 200, service.revokeToken(identity, t, p, rid));
      }
      if (resource === 'runners') {
        if (req.method === 'GET') return send(res, 200, service.runners(identity, t, p));
        if (req.method === 'POST')
          return send(res, 201, service.registerRunner(identity, t, p, body));
        if (req.method === 'DELETE')
          return send(res, 200, service.revokeRunner(identity, t, p, rid));
      }
      if (resource === 'members' && req.method === 'PATCH')
        return send(res, 200, service.projectMember(identity, t, p, rid, body));
      if (resource === 'keys') {
        if (req.method === 'GET')
          return send(res, 200, service.publicKeys(projectAccess(service.db, identity, t, p)));
        if (req.method === 'POST')
          return send(
            res,
            201,
            service.rotateSigningKey(projectAccess(service.db, identity, t, p, 'manage')),
          );
        if (req.method === 'DELETE')
          return send(res, 200, service.revokeSigningKey(identity, t, p, rid));
      }
      if (resource === 'telemetry' && req.method === 'POST')
        return send(res, 202, service.telemetry(identity, t, p, body));
      if (resource === 'opportunities' && req.method === 'GET') {
        projectAccess(service.db, identity, t, p);
        const events = service.db
          .all(
            'SELECT * FROM telemetry WHERE tenant_id=? AND project_id=? ORDER BY occurred_at LIMIT 10000',
            t,
            p,
          )
          .map((e) => ({
            id: e.id,
            sessionId: e.session_id,
            type: e.type,
            route: e.route,
            at: e.occurred_at,
            ...parseJson(e.metadata_json, {}),
          }));
        // Original miner takes semantic events; empty telemetry deliberately produces no claims.
        let opportunities = [];
        if (events.length) opportunities = mineWorkflowOpportunities(events, { projectId: p });
        return send(res, 200, { events: events.length, opportunities });
      }
      if (resource === 'export' && req.method === 'GET') {
        const scope = projectAccess(service.db, identity, t, p, 'edit');
        const artifacts = service.store.listArtifacts(scope, 'experience', 100);
        return send(res, 200, {
          project: service.project(identity, t, p),
          model: service.model(identity, t, p),
          experiences: artifacts.map(
            (a) => service.store.getArtifact(scope, a.id, 'experience').content,
          ),
        });
      }
      if (resource === 'demo-data' && req.method === 'GET' && demo) {
        projectAccess(service.db, identity, t, p);
        return send(
          res,
          200,
          await demo.load(t, p, url.searchParams.get('source'), url.searchParams.get('entity')),
        );
      }
      throw new AppError(404, 'NOT_FOUND', 'Endpoint not found');
    } catch (err) {
      failures++;
      if (res.headersSent) {
        res.destroy();
        return;
      }
      if (err.code === 'ENOENT') err = new AppError(404, 'NOT_FOUND', 'Resource not found');
      const status = err.status ?? 500;
      send(
        res,
        status,
        { error: safeError(err), requestId },
        status === 429 ? { 'Retry-After': String(err.details?.retryAfter ?? 60) } : {},
      );
      if (status >= 500)
        log({ event: 'request.error', requestId, code: err.code ?? 'INTERNAL_ERROR' });
    } finally {
      log({
        event: 'request',
        requestId,
        method: req.method,
        path: (req.url ?? '').startsWith('/preview/')
          ? '/preview/[redacted]'
          : (req.url ?? '').split('?')[0],
        status: res.statusCode,
        durationMs: Date.now() - start,
      });
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  server.maxRequestsPerSocket = 1000;
  server.on('clientError', (_err, socket) =>
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'),
  );
  return {
    server,
    origin,
    metrics: () => ({ requests, failures }),
    async close() {
      shuttingDown = true;
      await worker?.stop();
      await new Promise((resolve) => server.close(resolve));
      server.closeAllConnections?.();
    },
  };
}
