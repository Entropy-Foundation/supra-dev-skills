# Troubleshooting

Common failures and their root causes, in rough order of how often they come up.

The first six are Starkey runtime behaviour rather than mistakes in your code.
`references/starkey-runtime-quirks.md` explains each in full.

## Switching account in Starkey does nothing until I reload the page

The account switch is being listened for on the wrong transport. Starkey reports
it through `provider.on('accountChanged', accounts => …)`. The `starkey-*`
`window.postMessage` events are the extension's internal bridge and current
builds do not deliver an account switch to the page that way, so a handler
wired only to those never runs.

Check that the provider subscription exists and actually attached:

```ts
console.log(typeof window.starkey?.supra?.on);   // 'function' if available
```

The extension injects after page scripts run, so the first subscribe attempt
usually misses — poll until `provider.on` exists rather than subscribing once at
mount and giving up. And subscribe **once**: no removal method is documented, so
a subscription that re-registers on every state change stacks listeners that
nothing can remove. Read live state through refs inside the handlers instead.

## Refreshing the page signs the user out

`window.starkey` is injected before the extension's background side can answer,
so the first `account()` after a page load routinely resolves `[]` on a wallet
that is connected and unlocked. Code that reads once and treats `[]` as "signed
out" logs the user out on every refresh.

Retry before believing it — `readStarkeyAccount` in the hook does 8 attempts,
250 ms apart, first non-empty wins. Use a low attempt count on a signed-out page
so the connect button is not disabled through a window that can only confirm
what it already knows.

## "Unrecognized chain ID." — connect works on desktop, fails in the Starkey mobile dApp browser

Starkey's mobile dApp browser **rejects `changeNetwork` after carrying out the
switch**. Its rejection says nothing about where the wallet landed, so treating
it as failure reports a network error while the wallet is on the right chain.

Never trust that call's own answer. Read the chain back afterwards and let that
decide — `ensureChain` in `lib/starkey-network.ts`. The same read-back catches
the opposite lie: a wallet that resolves the call and stays put.

Also confirm `NEXT_PUBLIC_SUPRA_CHAIN_ID` is a **quoted string** (`"6"` /
`"8"`). The comparison is strict; an unquoted integer never matches.

## A network switch silently does nothing on first connect

`switchToChain()` used to guard on `selectedChainId`, which callers set with
`setSelectedChainId()` in the same tick — React has not committed it yet, so the
guard was false exactly when the switch was needed. If you have adapted this
function, do not gate it on state you just set; pass the chain id as an argument.

## Server-rendered data still shows the previous wallet after switching

A wallet change is a purely client-side event. Any Server Component that reads
the auth cookie keeps rendering the previous wallet's data, because the RSC
payload is not re-fetched. The hook's state is right and the screen is wrong.

Mount `<WalletSessionSync serverAddress={…} />` (in `assets/components/`) in the
layout or page that reads the session. It compares the connected address against
the one the page was rendered with and calls `router.refresh()` when they
diverge. Compare through `sameAddress` — the two sides pad and case addresses
differently, and a raw `!==` refreshes on every render.

## Comparing addresses reports a switch that did not happen

The same account arrives in different shapes depending on the source: the
extension, a Move view response, a JWT claim, `localStorage`. Zero-padding and
case are not guaranteed. Route every comparison through `sameAddress` from
`lib/address.ts`, and never compare a shortened display form.

## "Authentication failed" once the JWT expires, and reconnecting is the only fix

The revalidation paths were signing a *different* string than the one the server
verifies (`Sign message to revalidate login to …`, `Token Expiry: Sign message
to …`). `create-jwt` verifies exactly one message, so those signatures could
never verify.

Import `AUTH_MESSAGE` from `lib/auth-constants.ts` at every call site — the two
connect paths, `signIn()`, `checkAndRevalidateToken()`, the account-switch
handler, and the `create-jwt` route — and sign that one string everywhere. Grep
for any remaining literal auth message in the project; there should be none.

Also pass `forceSign: true` on revalidation. The `isSigningWallet` latch in
`localStorage` otherwise makes `signMessage` resolve `undefined` without ever
prompting, and the caller sees an unexplained failure.

## Anyone can obtain a session for an address they do not control

**Security.** `nacl.sign.detached.verify` only proves the caller holds the key
they handed you. If the route does not derive that public key back to an address
and compare it with the claimed one, an attacker signs `AUTH_MESSAGE` with their
own key, sends any `address` they like, and the server mints a JWT for it.

`verifyWalletSignature` in `lib/auth.ts` now performs both steps. If you ported
an older copy of that file, check it does the second one:

```ts
const derived = deriveSupraAddress(signature.publicKey);  // sha3_256(pubkey || 0x00)
if (!derived || derived !== normalizeAddress(address)) return false;
```

Accounts that have rotated their key, and multi-key accounts, do not derive back
to their address and cannot sign in this way — they need an on-chain
authentication key lookup instead.

## "Invalid signature. Signature verification failed." (401 from `/api/auth/create-jwt`)

**By far the most common issue.** The signed message on the client doesn't exactly match `AUTH_MESSAGE` on the server. Even a single trailing space, a `\n`, or a different TOS URL will cause `nacl.sign.detached.verify` to return `false`.

Fix: search the codebase for the auth message string and confirm **all three** places are identical:
- `connectWallet()` in the hook
- `signIn()` method in the hook
- `AUTH_MESSAGE` in `app/api/auth/create-jwt/route.ts`

Tip: extract the message to a shared constant imported by both client and server, so drift becomes impossible:

```ts
// lib/auth-constants.ts
export const AUTH_MESSAGE = 'Sign message to login to MyApp. ...';
```

## "Invalid or expired nonce" (401 from `/api/auth/create-jwt`)

Nonces expire after 5 minutes. If the user took longer than that between the connect click and approving the signature, the server rejects it.

Fixes, in order of preference:
1. User retries (quickest path)
2. Increase `NONCE_EXPIRY_MS` in `lib/auth.ts` if 5min is consistently too tight for your UX
3. Verify the client clock isn't way off from the server — if the browser's clock is >1min ahead, the server rejects as "timestamp in the future"

If the nonce parses wrong ("Invalid nonce format"), check whether something upstream (proxy, CDN, framework middleware) is modifying the response body of `/api/auth/nonce`. The route returns plain text.

## "JWT_SECRET is not defined" on module load

`lib/auth.ts` throws at import time if the env var is missing. This usually means:
- `.env.local` doesn't exist, or
- The dev server wasn't restarted after adding the var, or
- The var is named something else (e.g. `NEXT_JWT_SECRET` — it must be exactly `JWT_SECRET`)
- It's set only in production env but not dev

If you genuinely don't need auth, either don't import `lib/auth.ts`, or set any placeholder value.

## "Window Starkey not defined" / extension not detected

- Verify the Starkey extension is actually installed and enabled in the browser
- Reload the page after installing the extension — content scripts don't retroactively inject
- Check `window.starkey` in DevTools console. If it's present but `window.starkey.supra` is missing, the extension version is older than what the hook expects

## Infinite "Waiting for [Wallet]" state after closing the wallet prompt

The user closed the wallet popup without approving or rejecting, so neither the resolve nor the reject callback fires. The hook handles this by letting the user click outside the modal after 2 seconds (`canClickOutside` state in `ConnectWalletHandler`). If that's not working:

- Confirm `connectionStageStartTime` is being set when the stage transitions to `connecting`
- Check that the Radix Dialog `onOpenChange` is wired to `handleModalClose`
- As a last resort, users can refresh the page — no state is corrupted, just stuck

## Cookie not being set after login

- DevTools → Application → Cookies → check if `authToken` is present for your origin
- If running on `localhost` with `https`, the `secure: production` flag only kicks in for production — should work in dev
- If behind a reverse proxy (nginx, Cloudflare), make sure it's not stripping Set-Cookie headers for API routes
- `sameSite: 'lax'` means the cookie won't be sent on cross-origin top-level navigations with POST methods. If you're POSTing to the API from a different origin, you need `sameSite: 'none'` + `secure: true` and proper CORS

## Protected route returns "Unauthorized" right after successful login

- Verify the cookie is actually being set (see above)
- Check `verifyToken` isn't throwing silently — add a `console.log` in the catch block
- Make sure `JWT_SECRET` is **exactly the same** in the create-jwt route and the verify path. In Next.js, env vars are snapshot at build time — redeploy if you rotated the secret
- If the route has `export const runtime = 'edge'`, make sure `jose` (not a Node-only JWT library) is what's being used

## "Module not found: Can't resolve '@/components/ui/dialog'"

The `ConnectWalletHandler` imports shadcn/ui components from `@/components/ui/*`. If those don't exist:

```bash
npx shadcn@latest init
npx shadcn@latest add dialog button sonner
```

If the project doesn't use shadcn at all, the import paths need to be updated to whatever component library is in use, and the JSX adapted accordingly.

## Tailwind classes like `bg-brand-dark` don't work

These custom colors need to be defined in `tailwind.config.ts`. Either add them:

```ts
theme: {
  extend: {
    colors: {
      'brand-dark': '#0a0a0a',
      'brand-light': '#e6e6e6',
    }
  }
}
```

Or do a find/replace across `ConnectWalletHandler.tsx` to use standard Tailwind colors like `gray-900` / `gray-100`.

## Connection works but balance always shows `0.00`

- Check that `provider.balance()` returns something in DevTools
- Check `NEXT_PUBLIC_SUPRA_CHAIN_ID` matches the network the extension is actually on — if it says 6 while the wallet is on mainnet, the balance fetch returns 0
- Balance polling is on a 30-second interval in `ConnectWalletHandler`; if using the hook directly, call `updateBalance()` or rely on the effects inside the hook

## After wallet account switch in Starkey, app still shows old address

The hook listens for `starkey-wallet-updated` messages and triggers re-authentication. If this isn't working:
- Confirm the browser is actually posting the message — listen for `message` events in DevTools
- The `starkey-*` window messages are only a fallback; the primary signal is `provider.on('accountChanged')`. Confirm the provider subscription actually registered — the extension injects late, so the hook retries until it can subscribe
- If the re-auth is succeeding but the UI isn't refreshing, the `WalletProvider` context key-increment trick should force a re-mount — make sure the provider is actually wrapping the affected components

## Everything builds but auth routes return 500 on Vercel

- Check that all five API routes have `export const runtime = 'edge'`. Without this, they run on Node and may fail if Node-only modules are transitively imported
- Make sure `JWT_SECRET` is set in Vercel project env vars for all environments (dev, preview, production)
- Check Vercel's function logs — `jose` errors usually surface there with a useful message
