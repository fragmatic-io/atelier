# @cir/vault-client

Typed wire client for [`@cir/vault-server`](../vault-server/). Mints grants, reads + writes profile slices through a scoped token, verifies signatures locally via the JWKS, and surfaces typed errors so callers can branch cleanly between "re-grant", "fall back", and "fail loud".

> Wave 7 / track V-1. See the [wire-format spec](../../docs/vault-protocol.md) for the contract.

## Quick start

```ts
import { VaultClient } from '@cir/vault-client';

const vault = new VaultClient({
  vaultUrl: process.env.NEXT_PUBLIC_VAULT_URL ?? 'http://localhost:4001',
  appId: 'cir.demo',
});

// 1) Mint a grant. The token is persisted via the storage adapter.
await vault.requestGrant({
  scopes: ['lens.today', 'vocabulary.read'],
  purpose: 'Email triage demo',
});

// 2) Read the slice the token authorizes.
const profile = await vault.getProfile();
//   -> { user_id, lenses: { today: 'default' }, vocabulary: { ... } }

// 3) Apply a scope-authorized patch.
await vault.patchProfile({ lenses: { today: 'compact-cards' } });

// 4) Revoke. Drops the active token + cascades a system.security_revocation.
await vault.revokeGrant();
```

## Errors

```ts
import {
  VaultUnauthorizedError,
  VaultUnreachableError,
  VaultTokenExpiredError,
} from '@cir/vault-client';

try {
  await vault.getProfile();
} catch (err) {
  if (err instanceof VaultUnreachableError) {
    // Network is down. Hosts may fall back to a local cache.
  } else if (err instanceof VaultTokenExpiredError) {
    // Drop the token, route the user back to consent.
  } else if (err instanceof VaultUnauthorizedError) {
    // 401 from the server. The token has been cleared automatically.
  } else {
    throw err;
  }
}
```

## Storage adapters

| Adapter               | When to use                                                       |
| --------------------- | ----------------------------------------------------------------- |
| `BrowserTokenStorage` | Default in browsers; persists to `window.localStorage`. SSR-safe. |
| `MemoryTokenStorage`  | Default in Node and tests. Holds the token in a closure.          |

Hosts that need a more secure keystore (HttpOnly cookie, IndexedDB, OS keychain) implement the `VaultTokenStorage` interface and pass the adapter on construction. The interface is three methods: `read`, `write`, `clear`.

## JWKS verification

`verifyStoredToken()` does an offline pre-flight before any read/write call: fetches the JWKS once (cached for 5 min), verifies the ed25519 signature in `globalThis.crypto.subtle`, and checks `exp`. Misuse — corrupted token, malformed `kid`, expired window — surfaces as a `VaultUnauthorizedError` or `VaultTokenExpiredError` without a server round-trip.

```ts
const ok = await vault.verifyStoredToken();
if (!ok) {
  // No token persisted — show consent UI.
}
```

## What this package does NOT do

- No consent UI. The host owns that.
- No automatic re-grant. Callers catch `VaultUnauthorizedError` and decide.
- No automatic fall-through. The demo's `lib/intent-store.ts` builds the localStorage-fallback wrapper on top of this client; production hosts disable that fallback.
