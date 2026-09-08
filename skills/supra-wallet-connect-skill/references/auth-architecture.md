# Auth Architecture

The sign-in-with-wallet flow in this skill is a challenge/response pattern. Nothing here is Supra-specific — it's the same shape used by OpenSea, Uniswap, and most wallet-gated dApps. The only Supra-specific piece is that signatures are verified with Ed25519 (via `tweetnacl`) instead of ECDSA.

## The flow, end to end

```
Client                                   Server (edge runtime)
------                                   ----------------------
connect wallet (Starkey)
       |
       |--- GET /api/auth/nonce ------->  createNonce() returns:
       |                                   timestamp|random|HMAC
       |<-- "1713356400000|abc...|eyJ..."
       |
  wallet signs authMessageFor(nonce)
  = AUTH_MESSAGE + "\n\nNonce: <nonce>"
  (user approves in wallet)
       |
       |--- POST /api/auth/create-jwt -->  validateNonce(nonce):
       |    { address,                       - parse 3 parts
       |      signature: { signature,        - verify HMAC matches
       |                   publicKey },      - check timestamp age < 5min
       |      nonce }                       
       |                                   verifyWalletSignature(
       |                                     authMessageFor(nonce), signature, address):
       |                                     - nacl.sign.detached.verify(...)
       |                                     - deriveSupraAddress(publicKey) == address
       |                                   if all pass:
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

Defeats replay attacks. Without a nonce, an attacker who captured a signed message once could replay it forever. With the nonce **inside the signed text**, each signature is bound to one nonce and therefore to its 5-minute window.

**The nonce has to be in the signed bytes, not just in the request body.** StarKey's `signMessage({ message })` signs exactly the message it is given; it does not mix in a nonce or a prefix. An earlier version of this template signed the constant `AUTH_MESSAGE` and sent the nonce alongside it. The server validated the nonce, but nothing tied it to the signature, so one captured `{ signature, publicKey }` pair was a permanent login for that address: fetch a fresh nonce, resend the old signature, receive a JWT. `authMessageFor(nonce)` in `lib/auth-constants.ts` is the fix, and both the hook and `create-jwt` use it.

This implementation is **stateless** — there's no database or KV store tracking which nonces have been issued. Instead, the nonce embeds its own expiry timestamp and is HMAC-signed by the server so it can't be forged. The format is `{timestamp}|{random}|{jwt_signature}`:

- The `timestamp` gives an expiration window
- The `random` (16 bytes) ensures uniqueness within the window
- The `jwt_signature` is a HS256 JWT over `{timestamp}|{random}` proving the nonce came from *this* server

This is a practical tradeoff: a signed message can technically be replayed within its own 5-minute window until the first `create-jwt` call finishes. For most dApps this is fine; if you need zero replay window, wire up a KV store (Vercel KV, Upstash, Cloudflare KV) and mark each nonce as consumed after `validateNonce` succeeds.

### The signature verification (`verifyWalletSignature`)

Proves the user actually controls the private key of the claimed address. Uses `nacl.sign.detached.verify` with the Ed25519 public key returned by the wallet alongside the signature.

It then derives the address the public key controls and compares it with the claimed one - see "Binding the signature to the address" below. Earlier copies of this template skipped that second step and were an authentication bypass; if you are porting an older `lib/auth.ts`, check it has `deriveSupraAddress`.

### The JWT (`createToken` / `verifyToken`)

Gives the client a bearer token that the server can validate without a session store. Signed with `HS256` using `JWT_SECRET`, expires in 24h. The only payload field is `address`.

### The httpOnly cookie (`wallet-login` route)

Puts the JWT in a cookie with `httpOnly: true`, `secure: production`, `sameSite: 'lax'`, `maxAge: 24h`. httpOnly means JavaScript (including any injected XSS) can't read the token — only the server sees it on each request. `sameSite: 'lax'` mitigates CSRF for state-changing requests.

The reason we use a separate `wallet-login` route (instead of just setting the cookie inside `create-jwt`) is purely an architectural nicety — it keeps the signature-verification logic separate from the cookie-setting logic and allows the token to be validated once more on the way in.

## Customizing

### Change the auth message

**This step is required, not optional** — the default is branded to `MyApp` /
`myapp.com/tos` and must be replaced with the target project's name and TOS URL
before ship.

Edit two values in `lib/auth-constants.ts`:

```ts
const APP_NAME = "MyApp";
const TOS_URL = "https://myapp.com/tos";
```

That file exports `AUTH_MESSAGE` and `authMessageFor(nonce)`, and it is the only
definition of the text. Every client call site — `connectWallet`, `signIn()`,
`checkAndRevalidateToken()`, the account-switch handler — signs
`authMessageFor(nonce)`, and the `create-jwt` route verifies the same call. There
is nothing to keep in sync by hand, and no place where the bare `AUTH_MESSAGE`
should ever be signed.

**The string is verified byte-for-byte.** A trailing space, an inserted word, or
a `Token Expiry:` prefix makes `nacl.sign.detached.verify` return `false` and
`/api/auth/create-jwt` answer 401, with no signal the user can act on. This is
why the message is not parameterized per flow: the server verifies exactly one
string, so a "revalidate" variant can never verify. Earlier versions of this
template signed three different strings and token revalidation returned 401 every
time — the only way out was a full reconnect.

After editing, grep the project for `multiwallet.trade` and for any literal
`'Sign message to login`. Both should return nothing. A second copy of the string
anywhere is a silent 401 waiting for someone to edit one and not the other.

### Binding the signature to the address

A verified signature proves the caller holds *some* key. It does not prove they
hold the key for the address they are claiming. `verifyWalletSignature` therefore
does two things:

1. `nacl.sign.detached.verify(message, signature, publicKey)`
2. `deriveSupraAddress(publicKey) === normalizeAddress(address)`

Step 2 derives the account address the key controls — `sha3_256(pubkey || 0x00)`,
the Aptos-inherited single-Ed25519 scheme that Supra uses — and compares it with
the claim. **Without it the route is an authentication bypass:** an attacker
signs `AUTH_MESSAGE` with their own key, sends any `address` they like, and the
server mints a JWT for it.

The limitation this carries: an account that has rotated its key, or a multi-key
account, does not derive back to its address and cannot sign in this way. To
support those, read the on-chain authentication key for `address` and compare
against that instead of the derived value.

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
