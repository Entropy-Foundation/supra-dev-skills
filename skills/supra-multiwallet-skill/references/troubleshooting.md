# Troubleshooting

Common failures and their root causes, in rough order of how often they come up.

## "Invalid signature. Signature verification failed." (401 from `/api/auth/create-jwt`)

**By far the most common issue.** The signed message on the client doesn't exactly match `AUTH_MESSAGE` on the server. Even a single trailing space, a `\n`, or a different TOS URL will cause `nacl.sign.detached.verify` to return `false`.

Fix: search the codebase for the auth message string and confirm **all four** places are identical:
- Starkey case in `connectWallet()` in the hook
- Ribbit case in `connectWallet()` in the hook  
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

## Ribbit wallet doesn't connect / `initSdk()` returns null

The Ribbit SDK sometimes isn't ready immediately after the page loads. The hook polls for up to 5 seconds via `setInterval`, which is usually enough. If it's still failing:

- Verify `ribbit-wallet-connect` is installed and its version is current (`^1.2.6`)
- Check the browser console for errors from the Ribbit SDK specifically
- Try calling `initSdk()` manually in the console after page load — if that works, the polling window might be too short
- Confirm the app is running on an origin Ribbit trusts (some Ribbit versions have an origin allowlist during development)

## "Window Starkey not defined" / extension not detected

- Verify the Starkey extension is actually installed and enabled in the browser
- Reload the page after installing the extension — content scripts don't retroactively inject
- Check `window.starkey` in DevTools console. If it's present but `window.starkey.supra` is missing, the extension version is older than what the hook expects

## Infinite "Waiting for [Wallet]" state after closing the wallet prompt

The user closed the wallet popup without approving or rejecting, so neither the resolve nor the reject callback fires. The hook handles this by letting the user click outside the modal after 2 seconds (`canClickOutside` state in `ConnectWalletHandler`). If that's not working:

- Confirm `connectionStageStartTime` is being set when the stage transitions to `connecting`
- Check that the Radix Dialog `onOpenChange` is wired to `handleModalClose`
- As a last resort, users can refresh the page — no state is corrupted, just stuck

## "Network switching not supported by current wallet" error

Ribbit doesn't support programmatic network switching. If your app requires users to be on a specific network and they connected Ribbit on the wrong one, you need to:

1. Check `networkData.chainId` after connect
2. If wrong, show a UI message asking the user to change the network inside the Ribbit app
3. Don't call `switchToChain()` for Ribbit — gate it with `walletCapabilities.networkSwitching`

## `sendRawTransaction` succeeds on Starkey, fails on Ribbit

Common causes:
- **Ribbit network is wrong.** Ribbit doesn't auto-switch. Check `networkData.chainId` and abort with a useful error if it doesn't match `NEXT_PUBLIC_SUPRA_CHAIN_ID`.
- **BCS serialization mismatch.** Some Move functions that work on Starkey fail on Ribbit if argument types differ. Both wallets ultimately submit the same bytes to the chain, so if it works on one and not the other, the difference is usually in how the wallet encodes the wrapper, not the BCS args themselves. Log the `RawTxnRequest` object and compare to what you'd pass Starkey.
- **Decimals mismatch.** The Ribbit balance fetch uses `decimals: 7` in the reference hook (but `decimals: 8` in `ConnectWalletHandler`). If you're integrating a non-SUPRA coin, ensure the decimals match the coin's actual precision.

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

- For Starkey, check that `provider.balance()` returns something in DevTools
- For Ribbit, check `NEXT_PUBLIC_SUPRA_CHAIN_ID` matches the network the user is on in Ribbit — if they're on mainnet but chain ID says 6, the balance fetch returns 0
- Balance polling is on a 30-second interval in `ConnectWalletHandler`; if using the hook directly, call `updateBalance()` or rely on the effects inside the hook

## After wallet account switch in Starkey, app still shows old address

The hook listens for `starkey-wallet-updated` messages and triggers re-authentication. If this isn't working:
- Confirm the browser is actually posting the message — listen for `message` events in DevTools
- Check that `walletCapabilities.eventListeners` is true for the current wallet (it should be for Starkey)
- If the re-auth is succeeding but the UI isn't refreshing, the `WalletProvider` context key-increment trick should force a re-mount — make sure the provider is actually wrapping the affected components

## Everything builds but auth routes return 500 on Vercel

- Check that all five API routes have `export const runtime = 'edge'`. Without this, they run on Node and may fail if Node-only modules are transitively imported
- Make sure `JWT_SECRET` is set in Vercel project env vars for all environments (dev, preview, production)
- Check Vercel's function logs — `jose` errors usually surface there with a useful message
