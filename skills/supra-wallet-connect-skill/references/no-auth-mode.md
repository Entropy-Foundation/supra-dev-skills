# No-Auth Mode (Wallet Connection Only)

If the project only needs to connect the wallet, read balances, and send transactions — with no "sign in with wallet" step, no JWT, no protected routes — you can strip out the auth layer and have a much simpler integration.

## What to skip copying

Do **not** copy these files:
- `assets/lib/auth.ts`
- `assets/api/*` (all five API routes)

You don't need to install `jose` either (it's only used by the auth library).

## What to change in the hook

The `useSupraWallet.ts` hook makes several `fetch('/api/auth/...')` calls inside `connectWallet`. Remove them.

### In the connect path

Remove the block from the nonce fetch through the wallet-login POST. Keep only the wallet-connect, account-read, and network-check parts. The simplified `connectWallet` body should look like:

```ts
const approved: string[] | undefined = await provider.connect({
  chainId: TARGET_CHAIN_ID,
});
const walletAccount =
  approved?.[0] ?? (await readStarkeyAccount(provider, 4));
if (!walletAccount) throw new Error('No account found');

const responseAcc = [walletAccount];
localStorage.setItem('isSigningWallet', 'false');
localStorage.setItem('starkey.accounts.0', responseAcc[0]);

setAccounts(responseAcc);

window.dispatchEvent(new CustomEvent(WALLET_EVENTS.PRESIGNED_STATE, {
  detail: { timestamp: Date.now(), account: responseAcc[0] },
}));

// Network check (keep this). ensureChain confirms by reading the chain back
// rather than trusting what changeNetwork reports.
const landedOn = await ensureChain(provider, TARGET_CHAIN_ID);
setSelectedChainId(landedOn);
setNetworkData({ chainId: landedOn });

window.dispatchEvent(new CustomEvent(WALLET_EVENTS.CONNECTED, {
  detail: { timestamp: Date.now(), account: responseAcc[0], wallet: 'starkey' },
}));
```

### Remove revalidation and auth helpers

Delete these methods from the hook (nothing will call them):
- `signIn`
- `checkAndRevalidateToken`
- The revalidation `useEffect` (the `setInterval` on a daily timer)
- `authFetch` — it revalidates unconditionally, so it *must* be replaced, not just left alone. Swap in a plain `(url, opts) => fetch(url, { ...opts, credentials: 'include' })` passthrough, or delete it and call `fetch` directly.

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

In `disconnectWallet`, remove the `fetch('/api/auth/wallet-logout', ...)` call. Keep everything else.

## What still works

After stripping:
- `connectWallet()` — works
- `disconnectWallet()` — works  
- `signMessage(msg, nonce?, account?)` — still works; you can use this for arbitrary message signing (e.g. proof of ownership inside the app without involving the server)
- `sendRawTransaction(...)` — works
- `isExtensionInstalled` — works, so "Install Starkey" vs "Connect Starkey" UI still works
- `accounts`, `balance`, `loading` — all work
- Wallet events on `window` — all still fire
- `provider.on('accountChanged' | 'networkChanged' | 'disconnect')` — still
  subscribed, so account switches and network changes still reach the UI

Two files stay required even with auth stripped: `lib/address.ts` (every address
comparison) and `lib/starkey-network.ts` (network switching that works in the
mobile dApp browser). Neither touches auth.

## When to add auth back in later

If the project starts out read-only but later needs user-scoped data (favorites, profile settings, an API that writes to the user's behalf), you can layer auth back on by adding only the files you skipped — the hook's event structure and state already supports it.
