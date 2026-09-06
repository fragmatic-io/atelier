// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { readFile, writeFile, mkdir, chmod } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { resolve, join } from 'node:path';
import { assert } from './util.mjs';
import { Database } from './db.mjs';
import { SecretBox } from './crypto.mjs';
import { AuthService } from './auth.mjs';
import { ControlService } from './services.mjs';
import { DEFAULT_HOSTS } from '../../providers/src/api.mjs';
export async function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production',
    dataDir = resolve(env.ATELIER_DATA_DIR ?? '.atelier-data');
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  let keys,
    activeKeyId = env.ATELIER_ACTIVE_KEY_ID ?? 'primary';
  if (env.ATELIER_MASTER_KEYS) {
    try {
      keys = JSON.parse(env.ATELIER_MASTER_KEYS);
    } catch {
      throw new Error(
        'ATELIER_MASTER_KEYS must be a JSON object mapping key IDs to base64 32-byte keys',
      );
    }
  } else if (env.ATELIER_MASTER_KEYS_FILE) {
    keys = JSON.parse(await readFile(env.ATELIER_MASTER_KEYS_FILE, 'utf8'));
  } else {
    assert(
      !production,
      500,
      'MASTER_KEY_REQUIRED',
      'Production requires ATELIER_MASTER_KEYS_FILE or ATELIER_MASTER_KEYS. Keep keys outside database backups.',
    );
    const path = join(dataDir, 'development-keys.json');
    try {
      keys = JSON.parse(await readFile(path, 'utf8'));
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      keys = { [activeKeyId]: randomBytes(32).toString('base64') };
      await writeFile(path, JSON.stringify(keys), { mode: 0o600, flag: 'wx' });
    }
    await chmod(path, 0o600);
  }
  const port = Number(env.PORT ?? 4310);
  assert(
    Number.isInteger(port) && port > 0 && port < 65536,
    500,
    'INVALID_PORT',
    'PORT must be a valid TCP port',
  );
  const origin = env.ATELIER_PUBLIC_ORIGIN ?? `http://127.0.0.1:${port}`;
  const bind = env.ATELIER_BIND ?? '127.0.0.1';
  const allowedProviderHosts = [
    ...new Set([
      ...DEFAULT_HOSTS,
      ...String(env.ATELIER_PROVIDER_HOSTS ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ]),
  ];
  return {
    production,
    trustLoopbackProxy: env.ATELIER_TRUST_LOOPBACK_PROXY === 'true',
    dataDir,
    keys,
    activeKeyId,
    port,
    origin,
    bind,
    allowedProviderHosts,
    databasePath: resolve(env.ATELIER_DB_PATH ?? join(dataDir, 'atelier.sqlite')),
    allowTenantCreation: env.ATELIER_ALLOW_TENANT_CREATION !== 'false',
    enableExamples: env.ATELIER_ENABLE_EXAMPLES === 'true',
    workerEnabled: env.ATELIER_WORKER !== 'false',
  };
}
export function openServices(config) {
  const db = new Database(config.databasePath);
  const box = new SecretBox(config);
  const auth = new AuthService(db, box);
  const service = new ControlService(db, box, auth, {
    allowedProviderHosts: config.allowedProviderHosts,
    allowTenantCreation: config.allowTenantCreation,
  });
  return { db, box, auth, service };
}
