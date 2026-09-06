// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

function required(value, name) {
  if (typeof value !== 'string' || !value.trim())
    throw new Error(`MCP_CONFIG_INVALID: ${name} is required`);
  return value.trim();
}

export async function loadMcpConfig(path = process.env.ATELIER_MCP_CONFIG) {
  const configPath = resolve(required(path, 'ATELIER_MCP_CONFIG or --config'));
  const info = await stat(configPath);
  if (process.platform !== 'win32' && (info.mode & 0o077) !== 0) {
    throw new Error(
      'MCP_CONFIG_PERMISSIONS: configuration containing credentials must be mode 0600',
    );
  }
  const input = JSON.parse(await readFile(configPath, 'utf8'));
  const origin = new URL(required(input.origin, 'origin'));
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
  if (
    origin.origin !== origin.href.replace(/\/$/, '') ||
    (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && loopback))
  ) {
    throw new Error(
      'MCP_CONFIG_ORIGIN: use an exact HTTPS origin, or HTTP on loopback for local development',
    );
  }
  const token = input.tokenEnv ? process.env[required(input.tokenEnv, 'tokenEnv')] : input.token;
  if (typeof token !== 'string' || !/^atk_[A-Za-z0-9_-]{43}$/.test(token)) {
    throw new Error(
      'MCP_CONFIG_TOKEN: a valid project token is required directly or through tokenEnv',
    );
  }
  return Object.freeze({
    configPath,
    origin: origin.origin,
    tenantId: required(input.tenantId, 'tenantId'),
    projectId: required(input.projectId, 'projectId'),
    token,
  });
}
