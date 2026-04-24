# Auth Architecture

The sign-in-with-wallet flow in this skill is a challenge/response pattern. Nothing here is Supra-specific — it's the same shape used by OpenSea, Uniswap, and most wallet-gated dApps. The only Supra-specific piece is that signatures are verified with Ed25519 (via `tweetnacl`) instead of ECDSA.

## The flow, end to end

```
Client                                   Server (edge runtime)
------                                   ----------------------
connect wallet (Starkey/Ribbit)
       |
       |--- GET /api/auth/nonce ------->  createNonce() returns:
       |                                   timestamp|random|HMAC
       |<-- "1713356400000|abc...|eyJ..."
       |
  wallet signs AUTH_MESSAGE
  (user approves in wallet)
       |
       |--- POST /api/auth/create-jwt -->  validateNonce(nonce):
       |    { address,                       - parse 3 parts
       |      signature: { signature,        - verify HMAC matches
       |                   publicKey },      - check timestamp age < 5min
       |      nonce }                       
       |                                   verifyWalletSignature(
       |                                     AUTH_MESSAGE, signature, address):
       |                                     - nacl.sign.detached.verify(...)
       |                                   if both pass:
       |                                     createToken(address) -> JWT (24h)
       |<-- { token, address }
       |
       |--- POST /api/auth/wallet-login --> verifyToken(token)
       |    { token }                      set httpOnly cookie "authToken"
       |<-- { success: true } + Set-Cookie
       |
  later, server renders protected page:
       |                                   cookies().get('authToken')
       |                                   verifyToken(token) -> { address }
       |                                   render if address matches route
```

## Why each piece exists

### The nonce (`lib/auth.ts` → `createNonce` / `validateNonce`)

Defeats replay attacks. Without a nonce, an attacker who sniffed a signed message once could replay it forever. With a nonce, each signature is bound to a 5-minute window.

This implementation is **stateless** — there's no database or KV store tracking which nonces have been issued. Instead, the nonce embeds its own expiry timestamp and is HMAC-signed by the server so it can't be forged. The format is `{timestamp}|{random}|{jwt_signature}`:

- The `timestamp` gives an expiration window
- The `random` (16 bytes) ensures uniqueness within the window
- The `jwt_signature` is a HS256 JWT over `{timestamp}|{random}` proving the nonce came from *this* server

This is a practical tradeoff: a signed message can technically be replayed within its own 5-minute window until the first `create-jwt` call finishes. For most dApps this is fine; if you need zero replay window, wire up a KV store (Vercel KV, Upstash, Cloudflare KV) and mark each nonce as consumed after `validateNonce` succeeds.

### The signature verification (`verifyWalletSignature`)

Proves the user actually controls the private key of the claimed address. Uses `nacl.sign.detached.verify` with the Ed25519 public key returned by the wallet alongside the signature.

**⚠️ Important caveat from the reference repo:** The current implementation verifies `publicKey` signed the message, but doesn't verify that `publicKey` actually corresponds to the claimed `address`. A malicious client could send `{ address: victim, signature: attacker_sig, publicKey: attacker_pubkey }` and this check would pass. To close this, derive the address from the public key (using Supra's address-derivation rules) and compare. This is called out in `lib/auth.ts` with a TODO comment. Flag this to the user if they're shipping to production.

### The JWT (`createToken` / `verifyToken`)

Gives the client a bearer token that the server can validate without a session store. Signed with `HS256` using `JWT_SECRET`, expires in 24h. The only payload field is `address`.

### The httpOnly cookie (`wallet-login` route)

Puts the JWT in a cookie with `httpOnly: true`, `secure: production`, `sameSite: 'lax'`, `maxAge: 24h`. httpOnly means JavaScript (including any injected XSS) can't read the token — only the server sees it on each request. `sameSite: 'lax'` mitigates CSRF for state-changing requests.

The reason we use a separate `wallet-login` route (instead of just setting the cookie inside `create-jwt`) is purely an architectural nicety — it keeps the signature-verification logic separate from the cookie-setting logic and allows the token to be validated once more on the way in.

## Customizing

### Change the auth message

**This step is required, not optional** — the template string is branded to `multiwallet` / `multiwallet.trade/tos` and must be replaced with the target project's name and TOS URL before ship.

The sign-in message appears in **six places** and every copy must be byte-identical:

1. `hooks/useSupraMultiWallet.ts` — Starkey branch of `connectWallet()` (around line 498)
2. `hooks/useSupraMultiWallet.ts` — Ribbit branch of `connectWallet()` (around line 578)
3. `hooks/useSupraMultiWallet.ts` — `signIn()` revalidation (around line 922)
4. `hooks/useSupraMultiWallet.ts` — `checkAndRevalidateToken()` token-expiry path (around line 974)
5. `hooks/useSupraMultiWallet.ts` — `starkey-wallet-updated` event handler / account switch (around line 1044)
6. `app/api/auth/create-jwt/route.ts` — the `AUTH_MESSAGE` constant at the top

If any copy drifts (even a trailing space, a word like `this` inserted, or a `Token Expiry:` prefix), `nacl.sign.detached.verify` returns `false` and `/api/auth/create-jwt` returns 401 — the failure is silent from the user's perspective.

**Recommended workflow:** do a single project-wide find-and-replace of the whole string, then grep for the original brand to confirm nothing slipped through. For extra safety, consider extracting the message to a shared constant (e.g. `lib/authMessage.ts`) imported by both the hook and the route so there is only one source of truth.

### Change nonce expiration

`lib/auth.ts`:

```ts
const NONCE_EXPIRY_MS = 5 * 60 * 1000; // default 5 minutes
```

Shorter (2min) = better security, worse UX if the user takes a while to sign. Longer (10min) = more forgiving but wider replay window.

### Change JWT expiration

`lib/auth.ts`:

```ts
return await new jose.SignJWT({ address })
  .setProtectedHeader({ alg: 'HS256' })
  .setExpirationTime('24h') // change this
  .sign(secret);
```

Common values: `'1h'`, `'7d'`, `'30d'`. Remember the cookie's `maxAge` in `wallet-login/route.ts` must match.

### Add more fields to the JWT

Edit both `createToken` (to set them) and the type assertion in `verifyToken` (to expose them):

```ts
// createToken
return await new jose.SignJWT({ address, tier: 'pro', email })
  .setProtectedHeader({ alg: 'HS256' })
  .setExpirationTime('24h')
  .sign(secret);

// verifyToken return type
return payload as { address: string; tier: string; email?: string };
```

### Add rate limiting

Not included. For production, wrap `nonce` and `create-jwt` with a middleware that limits requests per IP (e.g. Upstash Ratelimit, Vercel's `@vercel/functions`).

### Revoke tokens

JWTs can't be revoked once issued (that's the tradeoff vs. sessions). For a revocation list, add a KV check in `verifyToken` against a "revoked" set keyed by `jti` (set a random `jti` on each token).
