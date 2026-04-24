---
name: supra-multiwallet-skill
description: Integrate Starkey and Ribbit wallet connect authentication for the Supra blockchain into a Next.js app. Use this skill whenever the user wants to add Supra wallet support, connect Starkey or Ribbit wallets, build a "connect wallet" button/modal for Supra, sign messages or send transactions via a Supra wallet, implement wallet-based JWT auth for a Supra dApp, or add multiwallet support to an existing Supra project — even if they don't explicitly say "multiwallet" and only mention one wallet (Starkey or Ribbit). Also use this when migrating a single-wallet Supra integration to support both wallets, or when setting up protected routes gated by Supra wallet sign-in.
---

# Supra Multiwallet Integration

This skill integrates **Starkey** and **Ribbit** wallet support for the **Supra blockchain** into a Next.js application, with optional JWT-based authentication (sign-in-with-wallet, protected routes).

The canonical implementation lives in `assets/` as working, production-tested code copied from [Crystara-Markets/supra-multiwallet](https://github.com/Crystara-Markets/supra-multiwallet). The strategy is to **copy these files into the target project and adapt them**, rather than regenerate them from scratch — the hook alone is ~1,200 lines of carefully worked-out wallet edge cases and they are easy to break.

## What this skill produces

After running, the target project will have:

- A `useSupraMultiWallet` hook exposing `connectWallet(type)`, `disconnectWallet()`, `signMessage()`, `sendRawTransaction()`, and wallet state (`accounts`, `balance`, `selectedWallet`, etc.)
- Both **Starkey** (browser extension, injected into `window.starkey.supra`) and **Ribbit** (via `ribbit-wallet-connect` SDK) supported through a single unified API
- Optionally: a full **sign-in-with-wallet → JWT → httpOnly cookie** auth flow with nonce/signature verification and edge-runtime API routes
- Optionally: a drop-in `ConnectWalletHandler` + modal for the connect UI

## Step 1: Understand the target project

Before touching files, figure out:

1. **Is this a Next.js App Router project?** The skill targets Next.js 14+ with the App Router. If the user is on Pages Router, Vite+React, or another framework, the hook and UI components still port cleanly (they are client components), but the `app/api/auth/*` edge routes need to be rewritten for their framework. Flag this to the user.
2. **Do they want auth (JWT sign-in), or just wallet connection?** Many dApps only need read-side wallet connection + transactions and don't need the sign-in-with-wallet flow. Ask if it's unclear. If no auth: skip everything under `assets/api/` and `assets/lib/auth.ts`, and strip the auth-related calls from the hook (see `references/no-auth-mode.md`).
3. **Do they already have a wallet integration?** If they have Starkey-only code, this is a migration — preserve their existing wallet state consumers and layer Ribbit support on top. Read `references/migrating-from-single-wallet.md`.
4. **What's their styling stack?** `ConnectWalletHandler.tsx` uses Tailwind + shadcn/ui + framer-motion + sonner + lucide-react. If the project uses a different stack, you'll need to either install those deps or rewrite the modal using their existing components. The hook itself has no UI dependencies beyond `sonner` for toasts (easily swappable).

## Step 2: Install dependencies

The runtime dependencies are:

```bash
npm install ribbit-wallet-connect tweetnacl jose ethers supra-l1-sdk-core sonner
```

If using the provided `ConnectWalletHandler.tsx` modal, also add:

```bash
npm install framer-motion lucide-react @radix-ui/react-dialog @radix-ui/react-visually-hidden @radix-ui/react-slot class-variance-authority clsx tailwind-merge tailwindcss-animate
```

shadcn/ui `Dialog`, `Button`, and `Sonner` components are expected at `@/components/ui/*`. If not present, run `npx shadcn@latest add dialog button sonner`. If the project doesn't use shadcn, either install it or rewrite the modal against their component library.

## Step 3: Copy the core files

All files referenced below live in this skill's `assets/` directory. Read them with the `view` tool and write them into the target project with `create_file`. Do not try to reconstruct them from memory — they contain carefully-handled edge cases (wallet event listeners, localStorage fallbacks, Ribbit SDK initialization timing) that are easy to break.

**Always copy (regardless of whether auth is used):**

| From (this skill) | To (target project) |
|---|---|
| `assets/hooks/useSupraMultiWallet.ts` | `hooks/useSupraMultiWallet.ts` |
| `assets/components/WalletProvider.tsx` | `components/WalletProvider.tsx` |

**Copy if using the provided modal UI:**

| From | To |
|---|---|
| `assets/components/ConnectWalletHandler.tsx` | `components/ConnectWalletHandler.tsx` |

**Copy if using JWT auth (most users will):**

| From | To |
|---|---|
| `assets/lib/auth.ts` | `lib/auth.ts` |
| `assets/api/nonce/route.ts` | `app/api/auth/nonce/route.ts` |
| `assets/api/create-jwt/route.ts` | `app/api/auth/create-jwt/route.ts` |
| `assets/api/check/route.ts` | `app/api/auth/check/route.ts` |
| `assets/api/wallet-login/route.ts` | `app/api/auth/wallet-login/route.ts` |
| `assets/api/wallet-logout/route.ts` | `app/api/auth/wallet-logout/route.ts` |

## Step 4: Customize per-project

Several values in the copied files are hardcoded to the reference project and **must be replaced** before the integration works correctly. These are easy to miss — do a single sweep with `str_replace` for each:

**In `hooks/useSupraMultiWallet.ts`:**
- **REQUIRED — update the sign-in auth message.** The template string `'Sign message to login to multiwallet. By signing this message, you agree to the Terms of Service and Privacy Policy of multiwallet at https://multiwallet.trade/tos'` appears **five times** in `hooks/useSupraMultiWallet.ts` (Starkey connect ~line 498, Ribbit connect ~line 578, `signIn()` revalidation ~line 922, `checkAndRevalidateToken()` ~line 974, Starkey `starkey-wallet-updated` account-switch handler ~line 1044) **and once more** as the `AUTH_MESSAGE` constant in `app/api/auth/create-jwt/route.ts`. Replace with the target project's name and TOS URL. All six copies **must be byte-identical** — `nacl.sign.detached.verify` returns `false` on any mismatch (even a trailing space) and the server responds 401 with no clear signal to the user. Recommended: do a single project-wide `str_replace` of the entire string, then grep to confirm zero occurrences of the old brand remain.
- The Ribbit `dappMetadata` object (`name: 'multiwallet'`, `description: 'NFT Marketplace and Lootbox Platform'`) should be updated to describe the target dApp.
- `STORAGE_KEY = 'multiwallet.selectedWallet'` — optional, but namespacing it to the project (e.g. `'myapp.selectedWallet'`) avoids collisions if the user visits multiple Supra dApps.

**In `app/api/auth/create-jwt/route.ts`:**
- The `AUTH_MESSAGE` constant must **exactly match** the string passed to `signMessage()` on the client. If they differ by even one character, `nacl.sign.detached.verify` returns false and login breaks silently (the request just returns 401).

**In `components/ConnectWalletHandler.tsx` (if using it):**
- Image imports at the top reference `@/public/walletIcons/Starkey.png`, `@/public/walletIcons/Ribbit.jpg`, and `@/public/main/icon.png`. The user must either (a) download these icons from the reference repo's `public/` directory, (b) provide their own, or (c) replace the `<img>` tags with inline SVGs. Don't leave broken image references.
- Branding strings like `'MyDApp'`, `'Welcome back to MyDApp'`, `'© Powered by Crystara'` should be updated.

## Step 5: Wire up the provider

In `app/layout.tsx` (or the nearest root client boundary), wrap children with `<WalletProvider>` and add the `<Toaster />`:

```tsx
import { WalletProvider } from "@/components/WalletProvider";
import { Toaster } from "@/components/ui/sonner";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Toaster />
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
```

## Step 6: Set environment variables

Create or update `.env.local`:

```
JWT_SECRET=<64+ char hex string, generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))">
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPRA_CHAIN_ID=6
```

Chain IDs: **6 = testnet**, **8 = mainnet**. This value is read by the hook at runtime to pick the correct Ribbit `SupraChainId` and for Starkey network switching.

If auth is not being used, `JWT_SECRET` can be skipped — but `lib/auth.ts` throws on import if it's missing, so either set a placeholder or don't import the file.

## Step 7: Use the hook

In any client component:

```tsx
'use client';
import useSupraMultiWallet from '@/hooks/useSupraMultiWallet';

export function MyComponent() {
  const {
    accounts,          // string[] — connected address(es); accounts[0] is the active one
    balance,           // e.g. "12.34 SUPRA"
    selectedWallet,    // 'starkey' | 'ribbit'
    loading,
    connectWallet,     // (type?: 'starkey' | 'ribbit') => Promise<boolean>
    disconnectWallet,
    signMessage,
    sendRawTransaction,
    getAvailableWallets, // returns [{ type, name, isInstalled, capabilities }]
    authFetch,         // fetch wrapper that auto-revalidates the JWT before the call
  } = useSupraMultiWallet();

  if (accounts.length === 0) {
    return <button onClick={() => connectWallet('starkey')}>Connect Starkey</button>;
  }
  return <p>Connected: {accounts[0]} — {balance}</p>;
}
```

Or, for the full drop-in modal with a "Connect Wallet" button that shows both wallets side-by-side, use `ConnectWalletHandler` as a render-prop wrapper — see `references/using-connect-wallet-handler.md`.

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
1. Install the Starkey extension (Chrome) and/or Ribbit wallet, and fund the test account from the Supra faucet if on testnet
2. Click connect → select a wallet → approve in the wallet → sign the message
3. Check DevTools → Application → Cookies for `authToken` being set as httpOnly
4. Check the network tab: `/api/auth/nonce` → `/api/auth/create-jwt` → `/api/auth/wallet-login` should all return 200

If something breaks, see `references/troubleshooting.md`.

---

## When to read the reference files

Load these on demand (don't read them all upfront):

- **`references/hook-api.md`** — full signature and behavior of every method returned by `useSupraMultiWallet`. Read when the user asks about a specific method or wants to build custom UI around the hook.
- **`references/sending-transactions.md`** — how `sendRawTransaction` works across both wallets, BCS argument serialization, type args, chain selection. Read when implementing token transfers or Move function calls.
- **`references/auth-architecture.md`** — the nonce/JWT/signature flow in detail, why each piece exists, and how to customize expiration windows, the auth message, or the revalidation cadence. Read when modifying auth behavior.
- **`references/no-auth-mode.md`** — how to strip the JWT auth out of the hook if the project only needs wallet connection (no sign-in). Read when the user explicitly says they don't want sign-in or when integrating into a read-only dApp.
- **`references/using-connect-wallet-handler.md`** — how to use `ConnectWalletHandler` as a render-prop wrapper, customize the modal, and handle `onConnect`/`onDisconnect` callbacks.
- **`references/migrating-from-single-wallet.md`** — how to migrate an existing Starkey-only (or Ribbit-only) project to support both. Read when the project already has wallet code.
- **`references/troubleshooting.md`** — common failures (signature verification failing, Ribbit not initializing, infinite "connecting" state, CORS on edge routes) and their fixes.

---

## Key things to remember

- **Starkey and Ribbit behave differently.** Starkey is a browser extension (synchronous detection via `window.starkey?.supra`), supports account switching events, network switching, and emits `starkey-*` window messages. Ribbit is an SDK that's initialized via `initSdk()` and uses its own internal state — it does *not* support network switching (the user must switch in-app) or account-switch events. The hook abstracts this via the `WalletCapabilities` object and capability guards — respect those guards if extending the hook.
- **The sign-in message must match exactly on client and server.** This is the #1 source of "why doesn't login work" bugs. If the user is customizing the message, update it in all four places: the Starkey connect path, the Ribbit connect path, the `signIn()` revalidation path, and `AUTH_MESSAGE` in the create-jwt route.
- **Edge runtime is used for all auth routes.** `jose` and Web Crypto API both work on the edge, which is why this template can deploy to Cloudflare Workers / Vercel Edge. Don't accidentally import Node-only modules into `lib/auth.ts` or the API routes.
- **The hook is long (~1,200 lines) for good reasons.** It handles wallet-install polling, storage fallbacks (localStorage → sessionStorage → cookie), starkey-wallet-updated events that require re-authentication, and graceful degradation when a wallet lacks a capability. Resist the urge to "clean it up" without understanding what each section does.
