---
name: supra-wallet-connect-skill
description: Integrate Starkey wallet connect authentication for the Supra blockchain into a Next.js app. Use this skill whenever the user wants to add Supra wallet support, connect the Starkey wallet, build a "connect wallet" button/modal for Supra, sign messages or send transactions via a Supra wallet, implement wallet-based JWT auth for a Supra dApp, or set up protected routes gated by Supra wallet sign-in. Use it as well for SupraNS (Supra Name Service) name display -- resolving a connected wallet address to its ".supra" name so the UI shows "alice.supra" instead of "0x944f...", reverse lookup via the SupraNS router contract, or any request to show a username/domain instead of a wallet address on Supra.
---

# Supra Wallet Integration

This skill integrates **Starkey** wallet support for the **Supra blockchain** into a Next.js application, with optional JWT-based authentication (sign-in-with-wallet, protected routes).

The canonical implementation lives in `assets/` as working, production-tested code copied from [Crystara-Markets/supra-multiwallet](https://github.com/Crystara-Markets/supra-multiwallet). The strategy is to **copy these files into the target project and adapt them**, rather than regenerate them from scratch — the hook alone is ~950 lines of carefully worked-out wallet edge cases and they are easy to break.

## What this skill produces

After running, the target project will have:

- A `useSupraWallet` hook exposing `connectWallet()`, `disconnectWallet()`, `signMessage()`, `sendRawTransaction()`, and wallet state (`accounts`, `balance`, `isExtensionInstalled`, etc.)
- **Starkey** support (browser extension, injected into `window.starkey.supra`), including its mobile dApp browser
- Optionally: a full **sign-in-with-wallet → JWT → httpOnly cookie** auth flow with nonce/signature verification and edge-runtime API routes
- Optionally: a drop-in `ConnectWalletHandler` + modal for the connect UI
- Optionally: **SupraNS** name display — the connected address renders as `alice.supra` when the account has a primary name, falling back to the shortened address otherwise (`references/suprans-resolution.md`)

## Step 1: Understand the target project

Before touching files, figure out:

1. **Is this a Next.js App Router project?** The skill targets Next.js 14+ with the App Router. If the user is on Pages Router, Vite+React, or another framework, the hook and UI components still port cleanly (they are client components), but the `app/api/auth/*` edge routes need to be rewritten for their framework. Flag this to the user.
2. **Do they want auth (JWT sign-in), or just wallet connection?** Many dApps only need read-side wallet connection + transactions and don't need the sign-in-with-wallet flow. Ask if it's unclear. If no auth: skip everything under `assets/api/` and `assets/lib/auth.ts`, and strip the auth-related calls from the hook (see `references/no-auth-mode.md`).
3. **Do they already have a wallet integration?** If they have their own Starkey code, preserve their existing wallet state consumers — swap the internals for this hook rather than rewiring every call site at once.
4. **What's their styling stack?** `ConnectWalletHandler.tsx` uses Tailwind + shadcn/ui + framer-motion + sonner + lucide-react. If the project uses a different stack, you'll need to either install those deps or rewrite the modal using their existing components. The hook itself has no UI dependencies beyond `sonner` for toasts (easily swappable).

## Step 2: Install dependencies

The runtime dependencies are:

```bash
npm install tweetnacl jose js-sha3 supra-l1-sdk-core sonner
```

`js-sha3` is used by `lib/auth.ts` to derive an address from a public key, which
is what binds a signature to the account claiming it. Web Crypto has no SHA3, and
`js-sha3` is pure JS so it runs on the edge runtime.

If using the provided `ConnectWalletHandler.tsx` modal, also add:

```bash
npm install framer-motion lucide-react @radix-ui/react-dialog @radix-ui/react-visually-hidden @radix-ui/react-slot class-variance-authority clsx tailwind-merge tailwindcss-animate
```

shadcn/ui `Dialog`, `Button`, and `Sonner` components are expected at `@/components/ui/*`. If not present, run `npx shadcn@latest add dialog button sonner`. If the project doesn't use shadcn, either install it or rewrite the modal against their component library.

## Step 3: Copy the core files

All files referenced below live in this skill's `assets/` directory. Read them with the `view` tool and write them into the target project with `create_file`. Do not try to reconstruct them from memory — they contain carefully-handled edge cases (wallet event listeners, retried account reads, late extension injection) that are easy to break.

**Always copy (regardless of whether auth is used):**

| From (this skill) | To (target project) |
|---|---|
| `assets/hooks/useSupraWallet.ts` | `hooks/useSupraWallet.ts` |
| `assets/hooks/useConversionUtils.ts` | `hooks/useConversionUtils.ts` |
| `assets/components/WalletProvider.tsx` | `components/WalletProvider.tsx` |
| `assets/lib/address.ts` | `lib/address.ts` |
| `assets/lib/starkey-network.ts` | `lib/starkey-network.ts` |

The last two are not optional. `lib/address.ts` is what every address comparison
goes through — Supra addresses arrive with different padding and case depending
on their source, so a raw `===` produces phantom account switches. `lib/starkey-network.ts`
is what makes network switching work in Starkey's mobile dApp browser, which
rejects `changeNetwork` *after* performing the switch.

**Copy if the app has Server Components that read the session (App Router):**

| From | To |
|---|---|
| `assets/components/WalletSessionSync.tsx` | `components/WalletSessionSync.tsx` |

**Copy if the app should support Starkey on mobile:**

| From | To |
|---|---|
| `assets/lib/starkey-link.ts` | `lib/starkey-link.ts` |

**Copy if the app should display SupraNS names instead of raw addresses:**

| From | To |
|---|---|
| `assets/lib/suprans.ts` | `lib/suprans.ts` |
| `assets/hooks/useSupraName.ts` | `hooks/useSupraName.ts` |

Genuinely optional — nothing else in the skill imports them. `lib/suprans.ts` depends on
`lib/address.ts`, which is already in the always-copy list. Read
`references/suprans-resolution.md` before wiring these up; the resolution path is not
the one the SupraNS docs imply, and pointing at the wrong network address fails silently
rather than erroring.

**Copy if using the provided modal UI:**

| From | To |
|---|---|
| `assets/components/ConnectWalletHandler.tsx` | `components/ConnectWalletHandler.tsx` |

**Copy if using JWT auth (most users will):**

| From | To |
|---|---|
| `assets/lib/auth-constants.ts` | `lib/auth-constants.ts` |
| `assets/lib/auth.ts` | `lib/auth.ts` |
| `assets/api/nonce/route.ts` | `app/api/auth/nonce/route.ts` |
| `assets/api/create-jwt/route.ts` | `app/api/auth/create-jwt/route.ts` |
| `assets/api/check/route.ts` | `app/api/auth/check/route.ts` |
| `assets/api/wallet-login/route.ts` | `app/api/auth/wallet-login/route.ts` |
| `assets/api/wallet-logout/route.ts` | `app/api/auth/wallet-logout/route.ts` |

## Step 4: Customize per-project

Several values in the copied files are hardcoded to the reference project and **must be replaced** before the integration works correctly. These are easy to miss — do a single sweep with `str_replace` for each:

**In `lib/auth-constants.ts`:**
- **REQUIRED — set `APP_NAME` and `TOS_URL`.** These two values are the only
  place the sign-in message is defined. Every client call site and the
  `create-jwt` route import `AUTH_MESSAGE` from this file, so there is nothing
  to keep in sync by hand. After editing, grep the project for
  `multiwallet.trade` and for any remaining literal `'Sign message to login`
  — both should return nothing. A second copy of that string anywhere is a
  silent 401 waiting for someone to edit one and not the other.
- Sign this same `AUTH_MESSAGE` on revalidation too. Earlier versions signed
  `'Sign message to revalidate login to …'` and `'Token Expiry: …'`, which the
  server never verifies, so token revalidation returned 401 every time and the
  only way out was a full reconnect.

**In `lib/suprans.ts` (if using SupraNS):**
- Nothing to replace — but `NEXT_PUBLIC_SUPRA_CHAIN_ID` now also selects the SupraNS
  router address, and it is unset-defaults-to-testnet. A mainnet app that leaves it
  unset resolves *every* account to "no name" with nothing logged, because the testnet
  router address returns `404` on mainnet RPC. Set it to `"8"` for mainnet.

**In `components/ConnectWalletHandler.tsx` (if using it):**
- Image imports at the top reference `@/public/walletIcons/Starkey.png` and `@/public/main/icon.png`. The user must either (a) download these icons from the reference repo's `public/` directory, (b) provide their own, or (c) replace the `<img>` tags with inline SVGs. Don't leave broken image references.
- Branding strings like `'MyDApp'`, `'Welcome back to MyDApp'`, `'© Powered by Crystara'` should be updated.

## Step 5: Wire up the provider

In `app/layout.tsx` (or the nearest root client boundary), wrap children with `<WalletProvider>` and add the `<Toaster />`:

```tsx
import { WalletProvider } from "@/components/WalletProvider";
import { Toaster } from "@/components/ui/sonner";
import { verifyToken } from "@/lib/auth";
import { cookies } from "next/headers";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Pass the rendered-with address if any Server Component reads the session.
  const session = await verifyToken(cookies().get("authToken")?.value);

  return (
    <html lang="en">
      <body>
        <Toaster />
        <WalletProvider serverAddress={session?.address ?? null}>
          {children}
        </WalletProvider>
      </body>
    </html>
  );
}
```

### Why `serverAddress`

A wallet change is a purely client-side event. A Server Component that reads the
auth cookie — a dashboard, a balance, a gated page — keeps rendering the
**previous** wallet's data after the user switches accounts, because the RSC
payload is not re-fetched. The hook's state is correct and the screen is wrong,
which the user reports as "it only updates when I refresh".

Passing `serverAddress` mounts `WalletSessionSync`, which compares the connected
address against the one the page was rendered with and calls `router.refresh()`
when they diverge. Omit the prop entirely for an app that renders everything
client-side.

If the layout is the wrong place to read the session — a route-group layout or a
single page owns it instead — mount the component directly there and leave the
prop off the provider. It renders nothing:

```tsx
import { WalletSessionSync } from "@/components/WalletSessionSync";

<WalletSessionSync serverAddress={session?.address ?? null} />
```

### Routing on disconnect is the caller's choice

The hook does not navigate. Pass `onDisconnect` if the app should go somewhere
when the wallet disconnects or the user switches to an account that has not
approved the site:

```tsx
const router = useRouter();
const wallet = useSupraWallet({ onDisconnect: () => router.push('/') });
```

Earlier versions called `router.push('/')` from inside a wallet event handler,
which yanks the user out of a modal or a nested layout in any app whose landing
route is not `/`.

## Step 6: Set environment variables

Create or update `.env.local`:

A ready-to-use template is in `assets/.env.local.example` — copy it to `.env.local` and fill in the values.

```
JWT_SECRET=<64+ char hex string, generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))">
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPRA_CHAIN_ID="6"
```

> ⚠️ **NEXT_PUBLIC_SUPRA_CHAIN_ID must be a quoted string** (e.g. `"6"`, not `6`). The hook does a strict string comparison against the chain ID returned by the wallet. Setting it as an unquoted integer causes silent network detection failures.

Chain IDs: **"6" = testnet**, **"8" = mainnet**. This value is read by the hook at runtime for network switching and by `lib/suprans.ts` to pick the SupraNS router address.

If auth is not being used, `JWT_SECRET` can be skipped — but `lib/auth.ts` throws on import if it's missing, so either set a placeholder or don't import the file.

## Step 7: Use the hook

In any client component:

```tsx
'use client';
import useSupraWallet from '@/hooks/useSupraWallet';

export function MyComponent() {
  const {
    accounts,          // string[] — connected address(es); accounts[0] is the active one
    balance,           // e.g. "12.34 SUPRA"
    isExtensionInstalled, // window.starkey.supra detected — polls, no deadline
    loading,
    connectWallet,     // () => Promise<boolean>
    disconnectWallet,
    signMessage,
    sendRawTransaction,
    authFetch,         // fetch wrapper that auto-revalidates the JWT before the call
  } = useSupraWallet();   // optionally: useSupraWallet({ onDisconnect })

  if (accounts.length === 0) {
    return <button onClick={() => connectWallet()}>Connect Starkey</button>;
  }
  return <p>Connected: {accounts[0]} — {balance}</p>;
}
```

Or, for the full drop-in modal with a "Connect Wallet" button, connection-stage
indicators and the install / mobile fallbacks, use `ConnectWalletHandler` as a render-prop wrapper — see `references/using-connect-wallet-handler.md`.

On a phone or tablet the modal shows an **Open in Starkey** row instead of an
"install the extension" message, which hands the current URL to Starkey's in-app
dApp browser and reopens the page where `window.starkey` exists. That row needs
`lib/starkey-link.ts` copied. Warn the user what the hop costs: the page opens
fresh in a different browser, so no cookies, no `localStorage` and no session go
with it — anything behind a login asks again on the other side.

## Step 8: (If auth is used) Protect a route

```tsx
// app/dashboard/page.tsx
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';

export const runtime = 'edge';

export default async function Dashboard() {
  const token = cookies().get('authToken')?.value;
  const verified = await verifyToken(token);
  if (!verified) return <p>Sign in required.</p>;
  return <p>Welcome {verified.address}</p>;
}
```

## Step 9: Test the flow

Tell the user to:
1. Install the Starkey extension (Chrome) and fund the test account from the Supra faucet if on testnet
2. Click connect → approve in the wallet → sign the message
3. Check DevTools → Application → Cookies for `authToken` being set as httpOnly
4. Check the network tab: `/api/auth/nonce` → `/api/auth/create-jwt` → `/api/auth/wallet-login` should all return 200
5. **Switch account inside Starkey with the page open.** The UI must follow
   without a reload — address, balance, and anything a Server Component rendered
   from the session. This is the test that catches a listener wired to the wrong
   transport, and it passes by accident if you only ever reload.
6. **Reload the page.** The user must stay signed in. A single `account()` read
   at mount resolves empty on a connected wallet and signs them out here.
7. **Open the app in Starkey's mobile dApp browser** and connect. This is where
   `changeNetwork` rejects after succeeding, so a desktop-only test tells you
   nothing about it.

If something breaks, see `references/troubleshooting.md` and
`references/starkey-runtime-quirks.md`.

---

## When to read the reference files

Load these on demand (don't read them all upfront):

- **`references/starkey-runtime-quirks.md`** — what the Starkey extension actually does: which events report an account switch, why the first `account()` read comes back empty, why `changeNetwork` lies in the mobile dApp browser, address shapes, and detection that has no natural end. Read **before** debugging any connect, switch, or network problem, and before adapting the event or network code.
- **`references/hook-api.md`** — full signature and behavior of every method returned by `useSupraWallet`. Read when the user asks about a specific method or wants to build custom UI around the hook.
- **`references/sending-transactions.md`** — how `sendRawTransaction` works, BCS argument serialization, type args, chain selection. Read when implementing token transfers or Move function calls.
- **`references/auth-architecture.md`** — the nonce/JWT/signature flow in detail, why each piece exists, and how to customize expiration windows, the auth message, or the revalidation cadence. Read when modifying auth behavior.
- **`references/no-auth-mode.md`** — how to strip the JWT auth out of the hook if the project only needs wallet connection (no sign-in). Read when the user explicitly says they don't want sign-in or when integrating into a read-only dApp.
- **`references/using-connect-wallet-handler.md`** — how to use `ConnectWalletHandler` as a render-prop wrapper, customize the modal, and handle `onConnect`/`onDisconnect` callbacks.
- **`references/suprans-resolution.md`** — resolving a wallet address to its SupraNS name (`alice.supra`) for display: the router contract addresses per network, the `get_primary_name` view and its `(subdomain, domain)` return order, Move `Option` JSON encoding, why the published SupraNS docs can't be implemented from, and why the name must never be trusted for identity. Read before copying `lib/suprans.ts` or debugging "every account shows no name".
- **`references/troubleshooting.md`** — common failures (signature verification failing, extension not detected, infinite "connecting" state, CORS on edge routes) and their fixes.

---

## Key things to remember

- **Starkey injects late.** `window.starkey?.supra` is undefined when page scripts first run, so a single detection read finds nothing on a browser that has the extension. Poll, and never give the poll a deadline — a user can install the extension or unlock a locked wallet minutes after the page opened.
- **Starkey reports an account switch through `provider.on('accountChanged')`.** That, plus `networkChanged` and `disconnect`, is the documented event surface. The `starkey-*` `window.postMessage` events are the extension's internal page-to-content-script bridge, **not its API**, and current builds do not deliver an account switch to the page that way. Never make those messages the only listener: a project that does keeps rendering the previous wallet until the page is reloaded. No removal method is documented, so subscribe once per mount, read live state through refs inside the handlers, and feature-test `off`/`removeListener` on teardown.
- **A wallet change does not re-render Server Components.** The auth cookie changed, but the RSC payload is not re-fetched. Mount `WalletSessionSync` wherever a Server Component reads the session, or the screen keeps showing the previous wallet's data with correct client state behind it.
- **The wallet lies about two things, so verify by reading back.** `account()` answers empty for a moment after every page load on a wallet that is connected — retry before believing it. `changeNetwork` rejects *after* switching in the mobile dApp browser — read the chain back and let that decide, never the call's own answer.
- **A SupraNS name is a label, not an identity.** Names are transferable NFTs, so the same `alice.supra` can belong to a different account tomorrow. Resolve it for display only, always keep the real address reachable next to it, never write it into the JWT, and never compare names to decide auth. `sameAddress` stays the only identity check.
- **Compare addresses through `sameAddress`, never `===`.** The extension, Move view responses, JWT claims and `localStorage` disagree about zero-padding and case for the same account.
- **The sign-in message lives in one file.** `lib/auth-constants.ts` exports `AUTH_MESSAGE`; every client call site and the `create-jwt` route import it. Sign that same string on revalidation too — the server verifies exactly one message, so a "revalidate" variant can never verify.
- **A valid signature is not proof of an address.** `nacl.sign.detached.verify` only proves the caller holds the key they sent you. `verifyWalletSignature` also derives that public key back to an address (`sha3_256(pubkey || 0x00)`) and compares it with the claimed one. Removing that second step turns the login route into an authentication bypass.
- **The sign-in message must match exactly on client and server.** This is the #1 source of "why doesn't login work" bugs. If the user is customizing the message, update it in all three places: the `connectWallet()` path, the `signIn()` revalidation path, and `AUTH_MESSAGE` in the create-jwt route.
- **Edge runtime is used for all auth routes.** `jose` and Web Crypto API both work on the edge, which is why this template can deploy to Cloudflare Workers / Vercel Edge. Don't accidentally import Node-only modules into `lib/auth.ts` or the API routes.
- **The hook is long (~950 lines) for good reasons.** It handles extension-install polling with no deadline, retried account reads, provider events plus a window-message fallback, and account switches that require re-authentication. Resist the urge to "clean it up" without understanding what each section does — most of what looks redundant is a wallet quirk with a comment above it explaining which one.
