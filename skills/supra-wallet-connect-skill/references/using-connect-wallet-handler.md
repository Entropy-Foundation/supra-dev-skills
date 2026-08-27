# Using `ConnectWalletHandler`

`ConnectWalletHandler` is a render-prop wrapper that gives you a "Connect Wallet" button with a modal carrying the install / mobile-deep-link states, connection stage indicators ("Waiting for Starkey Wallet", "Sign to verify", etc.), and balance/account management — all pre-wired to `useSupraWallet`.

Use it when you want the reference project's UX as-is. Skip it and call the hook directly when you want to build your own UI.

## Basic usage

```tsx
import ConnectWalletHandler from '@/components/ConnectWalletHandler';

<ConnectWalletHandler
  onConnect={(address) => console.log('connected:', address)}
  onDisconnect={() => console.log('disconnected')}
>
  {({ isConnected, accounts, loading, balance, handleConnect, handleDisconnect }) => (
    <>
      {isConnected ? (
        <div>
          <span>{accounts[0]} · {balance} SUPRA</span>
          <button onClick={handleDisconnect} disabled={loading}>Disconnect</button>
        </div>
      ) : (
        <button onClick={handleConnect} disabled={loading}>
          {loading ? 'Connecting…' : 'Connect Wallet'}
        </button>
      )}
    </>
  )}
</ConnectWalletHandler>
```

Clicking the button opens a modal listing installed wallets. Selecting one triggers the full connect flow (wallet approval → signature → JWT), with the modal showing live stages.

## Render-prop signature

```ts
children: (props: {
  isConnected: boolean;
  accounts: string[];
  loading: boolean;
  balance: string;
  userProfile: UserProfile | null;  // optional cached profile (address, username, profileImage)
  handleConnect: () => void;         // opens the modal
  handleDisconnect: () => void;      // disconnects + resets
}) => React.ReactNode;
```

You control the trigger UI; the modal and its state machine are internal.

## Connection stages

The modal displays different content based on an internal `connectionStage` state:

- `idle` — the connect row (or the install / Open-in-Starkey fallback)
- `connecting` — "Waiting for [Wallet]" with a spinner; wallet approval pending
- `signing` — "Sign to verify"; signature prompt up
- `success` — "Connected to [Wallet]"; closes after 2.5s
- `connected-not-signed` — user connected but rejected the signature; app access allowed but limited
- `error` — generic failure

These stages are driven by the `presigned-state`, `postsigned-state`, and `wallet-error` window events that `useSupraWallet` dispatches — so if you bypass `ConnectWalletHandler` and build your own modal, you can listen for the same events to drive state.

## Required assets

`ConnectWalletHandler.tsx` references two images:

```tsx
import starkeyIcon from '@/public/walletIcons/Starkey.png';
import logo from '@/public/main/icon.png';
```

You need to either:
1. Copy these icons from the reference repo's `public/walletIcons/` and `public/main/` directories into your own `public/`
2. Replace `logo` with your own brand logo import and the wallet icon with your own hosted version
3. Replace the `<img>` tags with inline SVGs (removes the static import dependency entirely)

Also update the display strings that reference the reference project's branding:
- `'MyDApp'` appears in the modal description and success state — replace with your app name
- `'© Powered by Crystara'` footer — replace or remove

## Styling

The modal uses Tailwind classes with custom colors like `brand-dark` and `brand-light`. These need to exist in your `tailwind.config.ts`, or swap them for standard Tailwind colors like `gray-900` / `gray-100`. The reference's `tailwind.config.ts` has:

```ts
colors: {
  'brand-dark': '#0a0a0a',
  'brand-light': '#e6e6e6',
}
```

You can copy that over, or do a one-shot find/replace across `ConnectWalletHandler.tsx` to use plain Tailwind colors.

## Profile caching

The handler implements an optional `UserProfile` concept with 10-minute sessionStorage caching. This is inherited from the source project (an NFT marketplace) where every user has a username/profile image. If your app doesn't have this, the `userProfile` prop just stays `null` and you can ignore it — the cache logic runs but produces nothing.

To remove it entirely: delete the `getProfileFromCache` helper, the `userProfile` state, the `handleProfileUpdated` listener, and the `userProfile` field from the render-prop result.

## When to skip it

If any of these apply, building your own modal directly on top of `useSupraWallet` is cleaner than customizing `ConnectWalletHandler`:

- Your project doesn't use shadcn/ui, framer-motion, or sonner
- You have your own design system with established dialog patterns
- You want programmatic control (e.g. auto-connect if previously used) without modal UI
- You don't need the install / mobile-deep-link states the modal carries

In that case, read `hook-api.md` and use the `isExtensionInstalled` + `connectWallet()` + `WALLET_EVENTS` pieces directly.
