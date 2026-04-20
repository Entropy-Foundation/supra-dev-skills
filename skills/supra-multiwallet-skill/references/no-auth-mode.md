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

Also remove the auto-revalidation block inside the `starkey-wallet-updated` handler (the nested re-auth logic in the `useEffect` that listens for Starkey events).

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

## When to add auth back in later

If the project starts out read-only but later needs user-scoped data (favorites, profile settings, an API that writes to the user's behalf), you can layer auth back on by adding only the files you skipped — the hook's event structure and state already supports it.
