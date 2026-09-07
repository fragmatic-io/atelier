// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { quote } from './template-shared.mjs';

export function expressAuthority() {
  return `// Fail closed until these adapters use the host application's real session and data layer.
export const authorityConfigured = false;
export async function getAtelierSubject(_request) {
  throw new Error('ATELIER_AUTH_REQUIRED: map the current request session to {id, role, permissions}');
}
export async function authorizeAtelier() { return false; }
export const atelierLoaders = {};
export const atelierExecutors = {};
`;
}

export function expressBridge(install) {
  return `import { Buffer } from 'node:buffer';
import express from 'express';
import { HostBridge, SqliteActionLedger } from '@atelier/platform/host';
import { authorityConfigured, authorizeAtelier, atelierExecutors, atelierLoaders, getAtelierSubject } from './atelier-authority.mjs';

const required = ['ATELIER_CONTROL_ORIGIN','ATELIER_TENANT_ID','ATELIER_PROJECT_ID','ATELIER_HOST_TOKEN','ATELIER_CONFIRMATION_KEY','ATELIER_ACTION_LEDGER'];
const environmentConfigured = () => required.every((name) => Boolean(process.env[name]));
function unsafeKey(value) {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(unsafeKey);
  return Object.entries(value).some(([key, child]) => ['__proto__', 'prototype', 'constructor'].includes(key) || unsafeKey(child));
}
let bridge;
function getBridge() {
  if (!environmentConfigured()) throw new Error('ATELIER_CONFIG_REQUIRED: configure every server-only Atelier variable');
  bridge ??= new HostBridge({
    tenantId: process.env.ATELIER_TENANT_ID,
    projectId: process.env.ATELIER_PROJECT_ID,
    environment: ${quote(install.environment)},
    origin: process.env.ATELIER_CONTROL_ORIGIN,
    token: process.env.ATELIER_HOST_TOKEN,
    confirmationKey: Buffer.from(process.env.ATELIER_CONFIRMATION_KEY, 'base64'),
    ledger: new SqliteActionLedger(process.env.ATELIER_ACTION_LEDGER),
    authorize: authorizeAtelier,
    loaders: atelierLoaders,
    executors: atelierExecutors,
  });
  return bridge;
}

export const atelierRouter = express.Router();
atelierRouter.get('/install-health', (_request, response) => response.json({ environmentConfigured: environmentConfigured(), authorityConfigured }));
atelierRouter.post('/:operation', async (request, response) => {
  try {
    const subject = await getAtelierSubject(request);
    const body = request.body ?? {};
    if (!body || typeof body !== 'object' || Array.isArray(body) || unsafeKey(body)) {
      return response.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request must be a safe JSON object' } });
    }
    const control = getBridge();
    const result = request.params.operation === 'resolve' ? await control.resolve(subject, body.slotId, body.context)
      : request.params.operation === 'load' ? await control.load({ ...body, subject })
      : request.params.operation === 'confirm' ? await control.confirm({ ...body, subject })
      : request.params.operation === 'dispatch' ? await control.dispatch({ ...body, subject })
      : null;
    if (result === null) return response.status(404).json({ error: { code: 'NOT_FOUND' } });
    response.json(result);
  } catch (error) {
    response.status(error.status ?? 500).json({ error: { code: error.code ?? 'ATELIER_BRIDGE_ERROR', message: error.message ?? 'Bridge failed' } });
  }
});
`;
}
