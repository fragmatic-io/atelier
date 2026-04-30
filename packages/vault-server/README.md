# @cir/vault-server

The reference intent vault server. Mints ed25519-signed scoped tokens, enforces scope-based filtering on read and write, persists profiles + grants to a JSON file (or in-memory for tests), and emits `system.security_revocation` triggers when grants are revoked.

> Wave 7 / track V-1. Pairs with [`@cir/vault-client`](../vault-client/) and the [wire-format spec](../../docs/vault-protocol.md).

## Why no Hono / Express

The vault speaks five endpoints. The total handler logic is ~250 lines. A framework would more than double the dependency surface and the moving parts you have to audit. We use `node:http` directly. The `handleVaultRequest()` function is a pure `(VaultRequest) => VaultResponse` dispatcher, so tests skip socket binding entirely and the eval harness drives the same entry point in-process.

If you want to mount this on top of an existing HTTP framework, import `VaultService` + `handleVaultRequest`, build a `VaultRequest` from your request shape, and write the response yourself. The pure layer is the public seam.

## Quick start

```bash
# From the CIR repo:
pnpm cir vault dev --port 4001
```

Or programmatically:

```ts
import { MemoryVaultStorage, loadOrGenerateKeyPair, startVaultServer } from '@cir/vault-server';

const { pair, generated } = loadOrGenerateKeyPair(process.env.VAULT_SIGNING_KEY_PEM);
if (generated) {
  console.warn('VAULT_SIGNING_KEY_PEM not set — using ephemeral key');
}

const storage = new MemoryVaultStorage();
storage.putProfile({
  user_id: 'demo-user',
  profile_version: 1,
  updated_at: new Date().toISOString(),
  global_preferences: {},
  lenses: { today: 'default' },
  rules: [],
  vocabulary: {},
});

const running = await startVaultServer({
  storage,
  key: pair,
  issuer: 'https://vault.example',
  port: 4001,
});

console.log(`vault listening on :${running.port}`);
```

## Wire protocol

See [`docs/vault-protocol.md`](../../docs/vault-protocol.md) for the full spec. Summary:

| Endpoint                          | Purpose                                                 |
| --------------------------------- | ------------------------------------------------------- |
| `POST /vault/grants`              | Mint a scoped token                                     |
| `GET /vault/profile?aud=<app_id>` | Read the slice authorized by the bearer token           |
| `PATCH /vault/profile`            | Apply a scope-authorized partial update                 |
| `DELETE /vault/grants/:jti`       | Revoke a grant; cascades a `system.security_revocation` |
| `GET /.well-known/jwks.json`      | Public-key distribution (RFC 7517)                      |

## Scope grammar

```
<scope>     ::= <category> ( "." <subscope> )*
<category>  ::= "lens" | "vocabulary" | "rules" | "preferences" | "vault"
<subscope>  ::= <ident> | "read" | "write" | "append" | "admin"
```

The unsuffixed `lens.<domain>` is the canonical user-facing form (covers read + write of the lens slice). `lens.<domain>.read` and `lens.<domain>.write` are the explicit variants. See [`src/scopes.ts`](src/scopes.ts) for the full mapping.

## Storage adapters

| Adapter                | When to use                                               |
| ---------------------- | --------------------------------------------------------- |
| `MemoryVaultStorage`   | Tests, evals, ephemeral demos                             |
| `JsonFileVaultStorage` | Single-process local dev. v0 default for `cir vault dev`. |

A SQLite adapter is roadmap (gated on Node 24's stable `node:sqlite`). The `VaultStorage` interface is small enough that the swap is a one-file change.

## Key rotation

The vault signs with one ed25519 keypair at a time. To rotate:

1. Generate a fresh keypair: `node -e "const c=require('node:crypto');console.log(c.generateKeyPairSync('ed25519',{privateKeyEncoding:{type:'pkcs8',format:'pem'}}).privateKey)"`
2. Roll out the new key on a second instance with the new `VAULT_SIGNING_KEY_PEM`.
3. Serve both keys via JWKS for at least `2 × max(token_ttl)` so any token signed under the old key has expired before old key removal.
4. Re-pin the public key on every host that has TOFU'd the vault.

The reference server today serves only the active key. A multi-key JWKS adapter is roadmap — add additional `VaultKeyPair` entries to `buildJwks()` once we have the rotation harness.

## Privacy posture

- The vault stores raw `IntentProfile` JSON. Encryption-at-rest is the deployer's job (`JsonFileVaultStorage` does not encrypt).
- Tokens never carry profile data. Scope is the only authorization claim.
- Revocation is immediate: `DELETE /vault/grants/:jti` flips `revoked_at` on the record and the next request bearing that token 401s. A `system.security_revocation` trigger fires on the configured emitter so subscribed runtimes invalidate their cached manifests.
- Compromised app: a future host hook (not yet wired) will revoke all grants whose `aud` matches a flagged app_id and emit one `system.security_revocation` per grant.
