# No-Auth Mode (Wallet Connection Only)

If the project only needs to connect wallets, read balances, and send transactions — with no "sign in with wallet" step, no JWT, no protected routes — you can strip out the auth layer and have a much simpler integration.

## What to skip copying

Do **not** copy these files:
- `assets/lib/auth.ts`
- `assets/api/*` (all five API routes)

You don't need to install `jose` either (it's only used by the auth library).

## What to change in the hook

The `useSupraMultiWallet.ts` hook makes several `fetch('/api/auth/...')` calls inside `connectWallet`. Remove them.

### In the Starkey connect path

Remove the block from the nonce fetch through the wallet-login POST (roughly lines 495–529 in the reference file). Keep only the wallet-connect, account-fetch, and network-check parts. The simplified Starkey case should look like:

```ts
case 'starkey': {
  await provider.connect();
  await updateAccounts();
  const responseAcc = await provider.account();
  if (responseAcc.length === 0) throw new Error('No account found');

  localStorage.setItem('isSigningWallet', 'false');
  localStorage.setItem('starkey.accounts.0', responseAcc[0]);

  window.dispatchEvent(new CustomEvent(WALLET_EVENTS.PRESIGNED_STATE, {
    detail: { timestamp: Date.now(), account: responseAcc[0] },
  }));

  // Network check (keep this)
  let networkData = await getNetworkData();
  if (networkData.chainId !== process.env.NEXT_PUBLIC_SUPRA_CHAIN_ID) {
    setSelectedChainId(() => process.env.NEXT_PUBLIC_SUPRA_CHAIN_ID || '6');
    await switchToChain(process.env.NEXT_PUBLIC_SUPRA_CHAIN_ID || '6');
  }

  window.dispatchEvent(new CustomEvent(WALLET_EVENTS.CONNECTED, {
    detail: { timestamp: Date.now(), account: responseAcc[0], wallet: 'starkey' },
  }));
  break;
}
```

### In the Ribbit connect path

Same idea — keep the `connectToWallet(dappMetadata)` call and the account-fetch, drop the nonce / signMessage / create-jwt / wallet-login block:

```ts
case 'ribbit': {
  const dappMetadata: DappMetadata = {
    name: 'YourApp',
    description: 'Your app description',
    logo: window.location.origin + '/favicon.ico',
    url: window.location.origin,
  };
  const response: WalletInfo = await provider.connectToWallet(dappMetadata);
  if (response.walletAddress == null) throw new Error('No account found');

  if (response.connected) {
    await updateAccounts();
    window.dispatchEvent(new CustomEvent(WALLET_EVENTS.CONNECTED, {
      detail: { timestamp: Date.now(), account: response.walletAddress, wallet: 'ribbit' },
    }));
  } else {
    throw new Error('Connection rejected');
  }
  break;
}
```

### Remove revalidation and auth helpers

Delete these methods from the hook (nothing will call them):
- `signIn`
- `checkAndRevalidateToken`
- The revalidation `useEffect` (the `setInterval` on a daily timer)
- `authFetch` — or replace with a plain `(url, opts) => fetch(url, { ...opts, credentials: 'include' })` passthrough

### Strip the re-auth out of the account-switch handler — but keep the handler

`handleStarkeyAccountSwitch` does two separable things: it follows the account
the extension now exposes, and it mints a new session for it. Remove only the
second. What must stay:

```ts
const handleStarkeyAccountSwitch = async (nextAccounts: string[]) => {
  const next = nextAccounts?.[0] ?? null;

  if (!next) {
    resetWalletData();
    onDisconnectRef.current?.();
    setLoading(false);
    return;
  }

  if (sameAddress(next, accountsRef.current[0])) {
    await updateAccounts();
    setLoading(false);
    return;
  }

  setAccounts([next]);
  localStorage.setItem('starkey.accounts.0', next);
  await updateAccounts();
  setLoading(false);
};
```

Delete the nonce / `signMessage` / `create-jwt` / `wallet-login` block in the
middle, the `wallet-logout` calls, and the `toast('Authentication Failed', …)`
in the catch. **Do not delete the function or its callers.** It is what the
`accountChanged` provider event and the `starkey-*` window-message fallback both
route into — without it, switching account in Starkey does nothing until the
page is reloaded, which is the single most-reported bug in this integration.

Keep the `sameAddress` check too. Without it every event re-runs the whole body
for an account that has not changed.

### Remove disconnect's auth call

In `disconnectWallet`, remove the `fetch('/api/auth/wallet-logout', ...)` call from the Starkey branch. Keep everything else.

## What still works

After stripping:
- `connectWallet('starkey' | 'ribbit')` — works
- `disconnectWallet()` — works  
- `signMessage(msg, nonce?, account?)` — still works; you can use this for arbitrary message signing (e.g. proof of ownership inside the app without involving the server)
- `sendRawTransaction(...)` — works
- `getAvailableWallets()` — works
- `accounts`, `balance`, `selectedWallet`, `loading` — all work
- Wallet events on `window` — all still fire
- `provider.on('accountChanged' | 'networkChanged' | 'disconnect')` — still
  subscribed, so account switches and network changes still reach the UI

Two files stay required even with auth stripped: `lib/address.ts` (every address
comparison) and `lib/starkey-network.ts` (network switching that works in the
mobile dApp browser). Neither touches auth.

## When to add auth back in later

If the project starts out read-only but later needs user-scoped data (favorites, profile settings, an API that writes to the user's behalf), you can layer auth back on by adding only the files you skipped — the hook's event structure and state already supports it.
