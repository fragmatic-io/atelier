// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `atelier vault dev` — boot a local intent vault server.
 *
 * Wraps `@atelier/vault-server`'s `startVaultServer` with a small UX layer:
 *   - generates an ephemeral ed25519 keypair when `VAULT_SIGNING_KEY_PEM`
 *     is unset, prints a clear warning + the generated PEM,
 *   - persists profiles + grants to a JSON file (default
 *     `./.cir-vault.json` in the current directory),
 *   - prints the JWKS URL hosts register against.
 *
 * Designed for `pnpm atelier vault dev --port 4001` from the repo root.
 */

/* eslint-disable no-console */

import {
  JsonFileVaultStorage,
  exportPrivatePem,
  loadOrGenerateKeyPair,
  startVaultServer,
} from '@atelier/vault-server';
import { resolve } from 'node:path';

import { VAULT_DEV_USAGE } from '../usage.js';

export interface VaultDevOptions {
  /** Port to bind. Default 4001. */
  port?: number;
  /** Storage file path. Default `./.cir-vault.json` (cwd-relative). */
  db?: string;
  /** Process env reader. Tests override; defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** Override the cwd used to resolve the db path. */
  cwd?: string;
  /** Issuer claim placed in minted tokens. Default the vault's bind URL. */
  issuer?: string;
  /**
   * Detached mode: start, return the running handle, and let the caller
   * decide when to close. Default false (block via the returned promise
   * until SIGINT).
   */
  detached?: boolean;
}

export interface VaultDevHandle {
  port: number;
  /** JWKS URL the host registers against. */
  jwksUrl: string;
  /** Stop the server. */
  close(): Promise<void>;
}

/**
 * Programmatic entry. The CLI's `vaultCommand` calls this; tests call this
 * with `detached: true` to drive it without blocking.
 */
export async function runVaultDev(opts: VaultDevOptions = {}): Promise<VaultDevHandle> {
  const env = opts.env ?? process.env;
  const cwd = opts.cwd ?? process.cwd();
  const port = opts.port ?? 4001;
  const dbPath = resolve(cwd, opts.db ?? '.cir-vault.json');

  const { pair, generated } = loadOrGenerateKeyPair(env['VAULT_SIGNING_KEY_PEM']);
  if (generated) {
    console.warn(
      'atelier vault dev: VAULT_SIGNING_KEY_PEM not set — generated an ephemeral ed25519 keypair.',
    );
    console.warn(
      'atelier vault dev: every restart invalidates outstanding tokens. Stash the following PEM in .env.local to persist:',
    );
    console.warn('---');
    console.warn(exportPrivatePem(pair).trim());
    console.warn('---');
  }

  const storage = new JsonFileVaultStorage(dbPath);
  const issuer = opts.issuer ?? `http://localhost:${String(port)}`;

  const running = await startVaultServer({
    storage,
    key: pair,
    issuer,
    port,
  });

  const jwksUrl = `http://localhost:${String(running.port)}/.well-known/jwks.json`;
  console.warn(`atelier vault dev: listening on http://localhost:${String(running.port)}`);
  console.warn(`atelier vault dev: JWKS at ${jwksUrl}`);
  console.warn(`atelier vault dev: storage at ${dbPath}`);
  console.warn(`atelier vault dev: kid=${pair.kid}`);

  return {
    port: running.port,
    jwksUrl,
    close: () => running.close(),
  };
}

/**
 * CLI entry point. Returns a Promise that resolves on SIGINT teardown so
 * the top-level `main()` exit code mirrors the server's clean shutdown.
 */
export async function vaultCommand(
  positionals: readonly string[],
  flags: Readonly<Record<string, string>>,
): Promise<number> {
  if (flags['help'] === 'true') {
    console.log(VAULT_DEV_USAGE);
    return 0;
  }
  const sub = positionals[0];
  if (sub !== 'dev') {
    console.error(
      `atelier vault: unknown subcommand '${sub ?? ''}'. Try 'atelier vault dev [--port 4001] [--db <path>]'.`,
    );
    return 1;
  }
  const port = flags['port'] !== undefined ? Number.parseInt(flags['port'], 10) : 4001;
  if (!Number.isFinite(port) || port < 0) {
    console.error(`atelier vault dev: invalid --port '${flags['port'] ?? ''}'`);
    return 1;
  }
  const handleOpts: VaultDevOptions = { port };
  if (flags['db'] !== undefined) handleOpts.db = flags['db'];
  if (flags['issuer'] !== undefined) handleOpts.issuer = flags['issuer'];

  let handle: VaultDevHandle;
  try {
    handle = await runVaultDev(handleOpts);
  } catch (err) {
    console.error(`atelier vault dev: failed to start — ${(err as Error).message}`);
    return 1;
  }

  return new Promise<number>((resolveOuter) => {
    const stop = (code: number): void => {
      handle.close().then(
        () => resolveOuter(code),
        () => resolveOuter(code),
      );
    };
    process.once('SIGINT', () => stop(0));
    process.once('SIGTERM', () => stop(0));
  });
}
