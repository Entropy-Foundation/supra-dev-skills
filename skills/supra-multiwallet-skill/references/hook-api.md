# `useSupraMultiWallet` Hook API Reference

Every method and state value returned by the hook, with exact types and behavior notes.

## Options

```ts
const wallet = useSupraMultiWallet({ onDisconnect: () => router.push('/') });
```

| Option | Type | Notes |
|---|---|---|
| `onDisconnect` | `() => void` | Called after the wallet disconnects, or reports no account at all — including a switch to an account that has not approved this site. Optional; the default is to clear wallet state and stay put. |

Routing is deliberately not the hook's decision. Earlier versions called
`router.push('/')` from inside a wallet event handler, which yanks the user out
of a modal or a nested layout in any app whose landing route is not `/`.

## State values

| Name | Type | Notes |
|---|---|---|
| `selectedWallet` | `'starkey' \| 'ribbit'` | Currently active wallet. Persisted to localStorage (with sessionStorage + cookie fallback) under the key `multiwallet.selectedWallet`. |
| `walletCapabilities` | `WalletCapabilities` | Capability flags for the active wallet — see below. Changes when `selectedWallet` changes. |
| `isExtensionInstalled` | `boolean` | Whether the active wallet's provider is detectable. For Starkey this means `window.starkey?.supra` is defined; for Ribbit it means `initSdk()` returned an SDK instance. Polls for as long as the component is mounted — no deadline, because a user may install the extension or unlock a locked wallet minutes after the page opened. |
| `accounts` | `string[]` | Connected addresses. In practice `accounts[0]` is the active one. Empty array when disconnected. Ribbit currently only returns a single Supra address. **Compare these with `sameAddress` from `lib/address.ts`, never `===`** — padding and case differ by source. For Starkey the value is read with retries, because `account()` answers empty for a moment after every page load on a wallet that is in fact connected. |
| `networkData` | `{ chainId?: string } \| undefined` | Network info. For Starkey this is the live chain ID; for Ribbit it's mocked from `NEXT_PUBLIC_SUPRA_CHAIN_ID` since Ribbit doesn't expose network switching. |
| `balance` | `string` | Human-readable balance, e.g. `"12.3456789 SUPRA"`. Updated on connect and via `updateBalance()` internally. |
| `transactions` | `{ hash: string }[]` | In-memory log of tx hashes from `sendRawTransaction` calls (newest first). Resets on page reload — not persisted. |
| `selectedChainId` | `string` | Chain ID currently being targeted by Starkey's network switcher. |
| `loading` | `boolean` | `true` during `connectWallet()`. Not true for `sendRawTransaction` or `signMessage` — track those separately in consumer components. |

## `WalletCapabilities`

```ts
interface WalletCapabilities {
  signMessage: boolean;
  accountSwitching: boolean;   // wallet emits events when user changes account
  networkSwitching: boolean;    // wallet supports programmatic network change
  rawTransactions: boolean;
  eventListeners: boolean;      // wallet posts window messages for state changes
  tokenRevalidation: boolean;   // hook should try to auto-revalidate expiring JWTs
}
```

Current values:

| Capability | Starkey | Ribbit |
|---|---|---|
| `signMessage` | ✅ | ✅ |
| `accountSwitching` | ✅ | ❌ |
| `networkSwitching` | ✅ | ❌ (user switches in-app) |
| `rawTransactions` | ✅ | ✅ |
| `eventListeners` | ✅ (`provider.on`, plus `starkey-*` window messages as a fallback) | ❌ |
| `tokenRevalidation` | ✅ | ❌ |

Always check `walletCapabilities.<flag>` before invoking optional paths. The hook itself guards most calls, but custom code built on top of the hook should guard too.

## Starkey events the hook subscribes to

```ts
provider.on('accountChanged', (accounts: string[]) => {});  // the only account-switch signal
provider.on('networkChanged', (data) => {});                // data.chainId
provider.on('disconnect', () => {});                        // site unlinked in the extension
```

This is Starkey's documented surface. The `starkey-*` `window.postMessage` events
are its internal page-to-content-script bridge, not its API, and current builds
do not deliver an account switch that way — they stay wired as a fallback only.
Both transports route into the same handler, so they cannot disagree.

The subscription is registered once per mount and its handlers read live state
through refs: `on` is documented but no removal method is, so re-subscribing on
every state change stacks listeners that nothing can take off again. See
`references/starkey-runtime-quirks.md`.

## Concurrency

One wallet prompt at a time. `connectWallet()` returns `false` immediately and
`sendRawTransaction()` throws `Another wallet request is already open` if one is
already in flight. The guard is a ref, not the `loading` state — that only
becomes visible to the UI after React commits, which leaves a window wide enough
for a second click to open a second approval sheet.

## Methods

### `connectWallet(walletType?: WalletType) => Promise<boolean>`

Connects and authenticates. If `walletType` is passed, switches to that wallet first. Returns `true` on success, `false` on failure.

Full sequence (successful path):
1. Check that the wallet's provider is available; bail with a toast if not
2. Call the wallet's native connect API (`provider.connect()` for Starkey, `provider.connectToWallet(dappMetadata)` for Ribbit)
3. Fetch accounts and dispatch `wallet-connected` event
4. (Starkey only) Check chain ID and `changeNetwork()` to the target if needed
5. Dispatch `presigned-state` event (UI can show "Sign to verify")
6. Fetch nonce from `/api/auth/nonce`
7. Call `signMessage(AUTH_MESSAGE, nonce, address)` — wallet shows the sign prompt
8. Dispatch `postsigned-state` event
9. POST to `/api/auth/create-jwt` with `{ address, signature, nonce }` — server verifies and returns a JWT
10. POST to `/api/auth/wallet-login` with the JWT — server sets the httpOnly cookie
11. Dispatch `wallet-connected` event with account + wallet type

If any step fails, dispatches `wallet-error` with the error detail.

### `disconnectWallet() => Promise<void>`

Calls the wallet's `disconnect()`, POSTs to `/api/auth/wallet-logout` to clear the cookie, clears the stored wallet selection, and navigates to `/`.

### `signMessage(message: string, nonce?: string, account?: any, forceSign?: boolean) => Promise<{ signature, publicKey, verified, ... } | undefined>`

Signs an arbitrary UTF-8 message. Returns `{ signature, publicKey, verified, ... }` where `verified` is the local Ed25519 verification result (a boolean; should always be `true` if the wallet signed correctly).

Uses a `localStorage.isSigningWallet = 'true'` reentrancy guard to prevent double-prompts; `forceSign=true` bypasses this. The guard is reset on success, error, or `forceSign`.

The message is hex-encoded (`0x` + hex) before being passed to the wallet — this matches what both Starkey and Ribbit expect.

### `sendRawTransaction(moduleAddress, moduleName, functionName, params, runTimeParams, txExpiryTime?) => Promise<string | undefined>`

Submits a Move entry function call. Argument layout:
- `moduleAddress`: full hex `0x...` of the publishing account
- `moduleName`: Move module name, e.g. `"supra_account"`
- `functionName`: entry function, e.g. `"transfer_coins"`
- `params`: BCS-serialized argument bytes as `Uint8Array[]` (use `useConversionUtils` helpers like `addressToUint8Array`, `serializeUint64`)
- `runTimeParams`: type arguments as a string array, e.g. `["0x1::supra_coin::SupraCoin"]`
- `txExpiryTime`: optional Unix seconds, defaults to `now + 3000s`

Returns the tx hash (as reported by the wallet), or `undefined` if preconditions failed (no provider, no accounts, missing module info). Throws on wallet rejection.

Internally:
- For **Starkey**, builds a raw tx payload array and calls `provider.createRawTransactionData()` then `provider.sendTransaction()`. Starkey auto-switches the network first if it's wrong.
- For **Ribbit**, builds a `RawTxnRequest` object, calls `provider.createRawTransactionBuffer()` to get a base64 blob, then `provider.signAndSendRawTransaction()`. The tx expiry is set from the caller.

See `sending-transactions.md` for BCS serialization details.

### `authFetch(url: string, options?: RequestInit) => Promise<Response>`

A `fetch` wrapper that (for wallets with `tokenRevalidation` capability) first calls `checkAndRevalidateToken()` to refresh the JWT if expired, then sends the request with `credentials: 'include'`. Use this for any authenticated API call from the client.

For Ribbit (no `tokenRevalidation`), it just adds `credentials: 'include'` and skips revalidation.

### `checkAndRevalidateToken() => Promise<boolean>`

Calls `/api/auth/check`. If the token is invalid and the user is still connected, fetches a new nonce, re-signs, and re-authenticates. Only applies to wallets with the capability. Returns whether the user is authenticated after the call.

Called on a daily timer (`setInterval(..., 86400000)`) for eligible wallets.

### `signIn() => Promise<void>`

Explicit re-sign flow — useful after a manual token invalidation (e.g. server-side session revocation) to regenerate a JWT without fully disconnecting the wallet. No-op if the wallet lacks `signMessage` capability.

### `switchToChain(chainId?: string) => Promise<void>`

Starkey only. Throws `'Network switching not supported by current wallet'` for Ribbit. For Ribbit, the user must change the network from inside the Ribbit app.

### `getAvailableWallets() => Array<{ type, name, isInstalled, capabilities }>`

Snapshots the install status of every supported wallet. Call this from UI that needs to show "Install Starkey" vs "Connect Starkey" buttons.

### `getCurrentProvider() => unknown`

Returns the raw underlying wallet provider object (Starkey extension API or Ribbit SDK instance). Escape hatch for calling wallet-specific APIs not wrapped by the hook.

## Window events

The hook dispatches `CustomEvent`s on `window` for UI state. Listen to these from outside React (e.g. analytics, toast managers):

| Event | Detail | When |
|---|---|---|
| `wallet-connected` | `{ timestamp, account, wallet? }` | After successful auth |
| `presigned-state` | `{ timestamp, account }` | Between wallet connect and sign prompt |
| `postsigned-state` | `{ timestamp, account }` | After signature accepted, before JWT request |
| `wallet-error` | `{ timestamp, error }` | Any failure in the connect flow |

The `WALLET_EVENTS` constant exported from the hook has these names.
