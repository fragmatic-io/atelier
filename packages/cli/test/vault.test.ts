// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { vaultCommand, runVaultDev } from '../src/commands/vault.js';
import { main } from '../src/index.js';

describe('runVaultDev', () => {
  let dir: string;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cir-cli-vault-'));
    // Quiet the boot banner so the test log stays focused.
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    warnSpy.mockRestore();
  });

  it('boots on port 0 and serves JWKS', async () => {
    const handle = await runVaultDev({
      port: 0,
      db: 'vault.json',
      cwd: dir,
      env: {},
    });
    try {
      expect(handle.port).toBeGreaterThan(0);
      const res = await fetch(`http://localhost:${String(handle.port)}/.well-known/jwks.json`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { keys: unknown[] };
      expect(body.keys).toHaveLength(1);
      expect(handle.jwksUrl).toContain('/.well-known/jwks.json');
    } finally {
      await handle.close();
    }
  });

  it('persists the storage file under the configured db path', async () => {
    const handle = await runVaultDev({
      port: 0,
      db: 'vault.json',
      cwd: dir,
      env: {},
    });
    try {
      // The file is created on first construction even before any request.
      const fs = await import('node:fs');
      expect(fs.existsSync(join(dir, 'vault.json'))).toBe(true);
    } finally {
      await handle.close();
    }
  });

  it('reuses the env-provided signing key', async () => {
    const seed = await runVaultDev({ port: 0, db: 'vault.json', cwd: dir, env: {} });
    const seedKid = (await (
      await fetch(`http://localhost:${String(seed.port)}/.well-known/jwks.json`)
    ).json()) as { keys: { kid: string }[] };
    await seed.close();
    // Re-import the signing module so we can export the freshly-generated PEM.
    // We round-trip through the helper used by the CLI itself.
    const { loadOrGenerateKeyPair, exportPrivatePem } = await import('@cir/vault-server');
    const { pair } = loadOrGenerateKeyPair(undefined);
    const pem = exportPrivatePem(pair);
    const second = await runVaultDev({
      port: 0,
      db: 'vault.json',
      cwd: dir,
      env: { VAULT_SIGNING_KEY_PEM: pem },
    });
    try {
      const body = (await (
        await fetch(`http://localhost:${String(second.port)}/.well-known/jwks.json`)
      ).json()) as { keys: { kid: string }[] };
      expect(body.keys[0]?.kid).toBe(pair.kid);
      // Ensure it differs from the random first run.
      expect(body.keys[0]?.kid).not.toBe(seedKid.keys[0]?.kid);
    } finally {
      await second.close();
    }
  });
});

describe('vaultCommand argv parsing', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('prints usage on --help', async () => {
    const code = await vaultCommand([], { help: 'true' });
    expect(code).toBe(0);
    const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(out).toContain('cir vault dev');
  });

  it('rejects an unknown subcommand', async () => {
    const code = await vaultCommand(['nope'], {});
    expect(code).toBe(1);
    const err = errSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(err).toContain("unknown subcommand 'nope'");
  });

  it('rejects an invalid --port', async () => {
    const code = await vaultCommand(['dev'], { port: 'not-a-number' });
    expect(code).toBe(1);
    const err = errSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(err).toContain('invalid --port');
  });

  it('routes through main()', async () => {
    const code = await main(['vault', '--help']);
    // `main()` uses parseArgs which captures `--help` as a flag; the
    // command sees `flags.help === 'true'` and returns 0.
    expect(code).toBe(0);
  });
});
