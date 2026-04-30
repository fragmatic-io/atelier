# Vault wire protocol

> Status: v0 (Wave 7 / track V-1). Ships with `@cir/vault-server` and `@cir/vault-client`. Hand-rolled JWTs over JSON; ed25519 signatures. The shape of the bytes on the wire is the contract — both packages implement it, and the demo speaks it.

The intent vault is the user-owned store from which apps request scoped read access. CIR is uncompromising on this point: **apps do not host intent**. They request slices from the vault; the user grants; the vault mints a scoped token; the app reads through that token; revocation is immediate.

This document is the wire-level specification a third-party vault would need to implement to be CIR-compatible. The server in `packages/vault-server/` and the client in `packages/vault-client/` are reference implementations.

---

## Endpoints

The four endpoints below carry the entire grant/read/write/revoke lifecycle. JWKS is the fifth, public, key-distribution surface.

### `GET /vault/consent` — render the consent screen

The user-facing consent dance (Wave 8 / V-3). Hosts redirect the browser here to ask the user — _on the vault, not on the host_ — to approve a scoped grant. On approve the vault mints a token + redirects back; on deny it redirects back with `?error=denied`.

```
GET /vault/consent
  ?app_id=cir.demo
  &scopes=lens.today,lens.thread,vocabulary.read
  &redirect=https%3A%2F%2Fhost.example%2Fonboarding%2Fgrant-callback
  &purpose=Email%20triage%20demo
```

Query parameters:

| field      | required | semantics                                                                                                                                       |
| ---------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `app_id`   | yes      | The requesting app's id. Whitelisted to `[A-Za-z0-9._-]+` so HTML / control chars never reach the renderer.                                     |
| `scopes`   | yes      | Comma-separated scope ids. Each must match `^[a-z][a-z0-9_.-]*$`.                                                                               |
| `redirect` | yes      | Fully-qualified callback URL the vault redirects to. Must be `http(s)`. The vault appends `?token=<jwt>` on approve or `?error=denied` on deny. |
| `purpose`  | no       | Free-form string surfaced on the consent screen.                                                                                                |
| `user_id`  | no       | Override the user id. Defaults to `'demo-user'` in the reference vault.                                                                         |

Response: server-rendered HTML. The page sets a `cir_vault_consent_nonce` cookie (HttpOnly, SameSite=Lax, Path=/vault/consent) carrying a CSRF nonce; the same nonce is embedded as a hidden form field. Approve POSTs both back; the server requires they match _and_ the HMAC is valid against the vault's signing key. Without the nonce, an attacker could forge an Approve POST from a malicious page.

Approve target: `POST /vault/consent/approve` (form-urlencoded). On success: `302` to `<redirect>?token=<jwt>`.

Deny target: `POST /vault/consent/deny` (form-urlencoded). On success: `302` to `<redirect>?error=denied`.

Why server-rendered HTML: the vault is not a frontend app. Adding a CSS pipeline / bundler to the vault doubles the dep surface for a one-page form. Hand-rolled `<form>` + `<button>` works across every browser and survives JS-disabled trust modes.

### `POST /vault/grants` — mint a token (programmatic)

Programmatic grant minting, bypasses the consent screen. Production deployments wrap this with their own auth or restrict access to admin tooling. The reference vault leaves it open so the eval harness can drive grants without browser plumbing.

```
POST /vault/grants
Content-Type: application/json

{
  "app_id": "cir.demo",
  "scopes": ["lens.today", "lens.thread", "vocabulary.read"],
  "expiry_seconds": 86400,
  "purpose": "Email triage demo"
}
```

Response:

```
200 OK
Content-Type: application/json

{
  "token": "eyJhbGciOiJFZERTQSI...<sig>",
  "scopes_granted": ["lens.today", "lens.thread", "vocabulary.read"],
  "expires_at": "2026-05-01T12:00:00.000Z",
  "jti": "g_8f3a2b1c4d5e",
  "user_id": "demo-user"
}
```

Notes:

- `scopes_granted` may be a strict subset of the requested scopes when the user trims at the consent screen. Clients must not assume the grant matches the request 1:1.
- `expiry_seconds` is optional. The server applies a default (24 h in the reference implementation) and a hard ceiling (30 d).
- `purpose` is a free-form string the consent screen can show. Stored on the grant; auditable.

### `GET /vault/profile?aud=<app_id>` — read

Returns a slice of the user's intent profile filtered by the bearer token's scope. Profile shape matches `@cir/schemas` `IntentProfileSchema`.

```
GET /vault/profile?aud=cir.demo
Authorization: Bearer eyJhbGciOiJFZERTQSI...
```

Response — only the slices the token authorizes are present; everything else is filtered out (not 401'd):

```
200 OK
Content-Type: application/json

{
  "user_id": "demo-user",
  "profile_version": 3,
  "updated_at": "2026-04-29T12:00:00.000Z",
  "global_preferences": { "granted_scopes": ["lens.today", "lens.thread", "vocabulary.read"] },
  "lenses": { "today": "default", "thread": "default" },
  "rules": [],
  "vocabulary": { "me": "Vid" },
  "cross_app_workflows": []
}
```

The `aud` query parameter is the requesting app's id; the server checks it matches the token's `aud` claim. If the token was minted for a different app, the server returns 401.

### `PATCH /vault/profile` — write a slice

Apply a partial update to the profile. The server enforces that every key being written is covered by a write-capable scope on the token.

```
PATCH /vault/profile
Authorization: Bearer ...
Content-Type: application/json

{
  "lenses": { "today": "compact-cards" },
  "vocabulary": { "alias.me": "Vid" }
}
```

Response: the resulting profile slice (filtered same way as `GET`).

Write-capable scopes:

| scope               | covers                                                                              |
| ------------------- | ----------------------------------------------------------------------------------- |
| `lens.<domain>`     | `lenses[domain]`, plus rules whose `scope === domain`                               |
| `vocabulary.write`  | the `vocabulary` map (full replace of the keys named in the patch)                  |
| `rules.append`      | `rules` (append-only — patch may only add new entries; cannot remove existing ones) |
| `preferences.write` | `global_preferences` keys named in the patch                                        |

Reads use the read variants:

| scope              | covers                                               |
| ------------------ | ---------------------------------------------------- |
| `lens.<domain>`    | `lenses[domain]` plus rules whose `scope === domain` |
| `vocabulary.read`  | the `vocabulary` map                                 |
| `rules.read`       | `rules` (entire array)                               |
| `preferences.read` | `global_preferences`                                 |

Scopes **named without a `.read` / `.write` suffix grant read** — `lens.<domain>` is the canonical user-facing scope so the consent screen reads naturally. `lens.<domain>.write` is the explicit write-capable variant; the reference server treats `lens.<domain>` as both read + write today (it covers the full lens slice). Future versions may split these.

### `DELETE /vault/grants/:jti` — revoke

Revoke a specific grant by its `jti`. Cascades a `system.security_revocation` trigger to the configured trigger bus so subscribed runtimes invalidate the affected manifests.

```
DELETE /vault/grants/g_8f3a2b1c4d5e
Authorization: Bearer ...
```

The bearer token must either (a) carry the `jti` it is revoking, OR (b) have a `vault.admin` scope. The reference server only accepts (a) today.

Response:

```
204 No Content
```

### `GET /.well-known/jwks.json` — public key

Standard RFC 7517 JWKS document with the vault's ed25519 public key(s). Clients fetch once and cache (TTL 5 min in the reference client). Multiple keys may be present during rotation.

```
{
  "keys": [
    {
      "kty": "OKP",
      "crv": "Ed25519",
      "alg": "EdDSA",
      "use": "sig",
      "kid": "vault-2026-04",
      "x": "MCowBQYDK2VwAyEA..."
    }
  ]
}
```

---

## Scope syntax

Scopes are dot-delimited strings. The grammar:

```
<scope>     ::= <category> ( "." <subscope> )*
<category>  ::= "lens" | "vocabulary" | "rules" | "preferences" | "vault"
<subscope>  ::= <ident> | "read" | "write" | "append" | "admin"
<ident>     ::= [a-z][a-z0-9_-]*
```

Examples:

- `lens.github` — read + write the `github` lens slice (lenses + scoped rules)
- `lens.github.read` — read-only variant
- `vocabulary.read` — read the vocabulary map
- `rules.append` — append-only access to the rules array
- `preferences.read` — read global preferences
- `vault.admin` — administrative (revoke any grant). Reference server does not mint this.

Unknown scopes are not rejected at grant time — the server is permissive — but they grant no access (filtering is allow-listed).

---

## JWT shape

Tokens are JWTs signed with ed25519 (`EdDSA`). Hand-rolled in the reference implementation: header, payload, and signature are base64url-encoded and joined with `.`. No external JWT library.

Header:

```
{ "alg": "EdDSA", "typ": "JWT", "kid": "vault-2026-04" }
```

Payload (claims):

```
{
  "iss": "https://vault.example",   // vault id (URL or DID)
  "aud": "cir.demo",                // app id this grant is for
  "sub": "demo-user",                // user id (vault-local)
  "scope": "lens.today lens.thread vocabulary.read",  // space-separated
  "exp": 1745851200,                 // unix seconds
  "iat": 1745764800,
  "jti": "g_8f3a2b1c4d5e"
}
```

Validation order on the server (and client `verifyToken()`):

1. Parse `header.payload.signature` triplets; reject malformed.
2. Look up the public key by `header.kid` (or default to the only key).
3. Verify `signature` covers `base64url(header) + "." + base64url(payload)` under ed25519. Reject on bad sig.
4. Check `exp > now`. Reject on expired.
5. Check `aud` matches the request's `aud` query / endpoint expectation. Reject on audience mismatch.
6. Check `jti` is not in the revocation list. Reject on revoked.

Steps 1–4 are deterministic and run client-side too in `@cir/vault-client`. The client cannot know `aud` mismatch or revocation without the server, so those checks are server-only.

---

## Security posture

- **TOFU on first contact.** A vault is identified by a URL; the host pins the JWKS-fetched public key on first contact and refuses silent rotations. New keys must roll in via JWKS multi-key (old + new during overlap), then the host re-pins.
- **Key rotation.** The server emits a new `kid` and serves both keys via JWKS for the `2 × max(token_ttl)` overlap window. Old keys are evicted only after every token signed by them has expired.
- **Token never carries profile data.** Scope is the only authorization claim. The profile lives in the vault; tokens are bearer references.
- **Revocation propagation.** `DELETE /vault/grants/:jti` cascades a `system.security_revocation` trigger via the configured `TriggerBus`. Subscribed runtimes invalidate manifests compiled from the affected slice. Other tabs in the same browser receive the trigger via the runtime's existing SSE / in-process bus — no separate channel.
- **Compromised app.** When a host operator marks an `app_id` compromised, the vault revokes every active grant whose `aud` matches that app_id and emits one `system.security_revocation` per grant. The user is shown an explanation on next visit.
- **Privacy.** The vault stores raw `IntentProfile` JSON. Encryption-at-rest is the deployer's responsibility (the JSON-file storage adapter does not encrypt; SQLite + SQLCipher is a roadmap path). Tokens never leave the vault encrypted; signatures cover the JSON envelope only.
- **Replay.** The `jti` is the canonical anti-replay handle. The server checks every accepted token against the revocation list per request; it does not maintain a per-request nonce.
- **Backwards-compat fallback in dev.** The demo's intent store falls through to `localStorage` when the vault server is unreachable, with a clear console warning. Production hosts disable the fallback via `NEXT_PUBLIC_VAULT_FALLBACK=disabled`.

---

## Discovery

A future `/.well-known/cir.json` extension may advertise the user's preferred vault as `{ "vault_url": "https://vault.example" }`. Today the demo hard-codes `NEXT_PUBLIC_VAULT_URL=http://localhost:4001` and the discovery hook is roadmap.

---

## Sample interaction

```bash
# 1. Boot the vault
pnpm cir vault dev --port 4001 &

# 2. Mint a grant (skipping consent UI for clarity).
TOKEN=$(curl -s -X POST http://localhost:4001/vault/grants \
  -H 'content-type: application/json' \
  -d '{"app_id":"cir.demo","scopes":["lens.today","vocabulary.read"]}' \
  | jq -r '.token')

# 3. Read the profile slice the token authorizes.
curl -s http://localhost:4001/vault/profile?aud=cir.demo \
  -H "authorization: Bearer $TOKEN" | jq .
# {
#   "user_id": "demo-user",
#   "lenses": { "today": "default" },
#   "vocabulary": { ... },
#   ...
# }

# 4. Patch the today lens.
curl -s -X PATCH http://localhost:4001/vault/profile \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"lenses":{"today":"compact-cards"}}'

# 5. Revoke the grant.
JTI=$(echo "$TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null | jq -r '.jti')
curl -s -X DELETE http://localhost:4001/vault/grants/$JTI \
  -H "authorization: Bearer $TOKEN"

# Subsequent calls 401 with `token revoked`.
```
