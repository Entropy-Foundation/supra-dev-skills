# `useSupraWallet` Hook API Reference

Every method and state value returned by the hook, with exact types and behavior notes.

## Options

```ts
const wallet = useSupraWallet({ onDisconnect: () => router.push('/') });
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
| `isExtensionInstalled` | `boolean` | Whether `window.starkey?.supra` is defined. Polls for as long as the component is mounted — no deadline, because a user may install the extension or unlock a locked wallet minutes after the page opened. |
| `accounts` | `string[]` | Connected addresses. In practice `accounts[0]` is the active one. Empty array when disconnected. **Compare these with `sameAddress` from `lib/address.ts`, never `===`** — padding and case differ by source. The value is read with retries, because `account()` answers empty for a moment after every page load on a wallet that is in fact connected. |
| `networkData` | `{ chainId?: string } \| undefined` | The live chain ID reported by the extension. |
| `balance` | `string` | Human-readable balance, e.g. `"12.3456789 SUPRA"`. Updated on connect and via `updateBalance()` internally. |
| `transactions` | `{ hash: string }[]` | In-memory log of tx hashes from `sendRawTransaction` calls (newest first). Resets on page reload — not persisted. |
| `selectedChainId` | `string` | Chain ID currently being targeted by the network switcher. |
| `loading` | `boolean` | `true` during `connectWallet()`. Not true for `sendRawTransaction` or `signMessage` — track those separately in consumer components. |

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

### `connectWallet() => Promise<boolean>`

Connects and authenticates. Returns `true` on success, `false` on failure.

Full sequence (successful path):
1. Read `window.starkey.supra` fresh; bail with a toast if the extension is absent
2. Call `provider.connect({ chainId })` — the approval sheet opens on the target network
3. Read the approved account back (retried) and dispatch `wallet-connected` state
4. Verify the chain by reading it back via `ensureChain`, switching if needed
5. Dispatch `presigned-state` event (UI can show "Sign to verify")
6. Fetch nonce from `/api/auth/nonce`
7. Call `signMessage(AUTH_MESSAGE, nonce, address)` — wallet shows the sign prompt
8. Dispatch `postsigned-state` event
9. POST to `/api/auth/create-jwt` with `{ address, signature, nonce }` — server verifies and returns a JWT
10. POST to `/api/auth/wallet-login` with the JWT — server sets the httpOnly cookie
11. Dispatch `wallet-connected` event with account + wallet type

If any step fails, dispatches `wallet-error` with the error detail.

### `disconnectWallet() => Promise<void>`

Calls `provider.disconnect()`, POSTs to `/api/auth/wallet-logout` to clear the cookie, clears wallet state, and invokes the `onDisconnect` option if one was passed.

### `signMessage(message: string, nonce?: string, account?: any, forceSign?: boolean) => Promise<{ signature, publicKey, verified, ... } | undefined>`

Signs an arbitrary UTF-8 message. Returns `{ signature, publicKey, verified, ... }` where `verified` is the local Ed25519 verification result (a boolean; should always be `true` if the wallet signed correctly).

Uses a `localStorage.isSigningWallet = 'true'` reentrancy guard to prevent double-prompts; `forceSign=true` bypasses this. The guard is reset on success, error, or `forceSign`.

The message is hex-encoded (`0x` + hex) before being passed to the wallet — this is what Starkey expects.

### `sendRawTransaction(moduleAddress, moduleName, functionName, params, runTimeParams, txExpiryTime?) => Promise<string | undefined>`

Submits a Move entry function call. Argument layout:
- `moduleAddress`: full hex `0x...` of the publishing account
- `moduleName`: Move module name, e.g. `"supra_account"`
- `functionName`: entry function, e.g. `"transfer_coins"`
- `params`: BCS-serialized argument bytes as `Uint8Array[]` (use `useConversionUtils` helpers like `addressToUint8Array`, `serializeUint64`)
- `runTimeParams`: type arguments as a string array, e.g. `["0x1::supra_coin::SupraCoin"]`
- `txExpiryTime`: optional Unix seconds, defaults to `now + 3000s`

Returns the tx hash (as reported by the wallet), or `undefined` if preconditions failed (no provider, no accounts, missing module info). Throws on wallet rejection.

Internally it re-reads the exposed account and refuses to sign as an address the
session did not authenticate, verifies the chain via `ensureChain`, then builds a
raw tx payload array and calls `provider.createRawTransactionData()` followed by
`provider.sendTransaction()`.

See `sending-transactions.md` for BCS serialization details.

### `authFetch(url: string, options?: RequestInit) => Promise<Response>`

A `fetch` wrapper that first calls `checkAndRevalidateToken()` to refresh the JWT if expired, then sends the request with `credentials: 'include'`. Throws `Authentication failed` if revalidation does not succeed. Use this for any authenticated API call from the client.

### `checkAndRevalidateToken() => Promise<boolean>`

Calls `/api/auth/check`. If the token is invalid and the user is still connected, fetches a new nonce, re-signs, and re-authenticates. Returns whether the user is authenticated after the call.

Called on a daily timer (`setInterval(..., 86400000)`) while an account is connected.

### `signIn() => Promise<void>`

Explicit re-sign flow — useful after a manual token invalidation (e.g. server-side session revocation) to regenerate a JWT without fully disconnecting the wallet.

### `switchToChain(chainId?: string) => Promise<void>`

Switches the extension to `chainId`, defaulting to `selectedChainId` and then to
`NEXT_PUBLIC_SUPRA_CHAIN_ID`. No-op when the provider is absent. Decides success
by reading the chain back through `ensureChain`, not by trusting what
`changeNetwork` reports — see `lib/starkey-network.ts`.

To show "Install Starkey" vs "Connect Starkey" in your own UI, read
`isExtensionInstalled`.

### `getCurrentProvider() => unknown`

Returns the raw Starkey provider object. Escape hatch for calling extension APIs not wrapped by the hook.

## Window events

The hook dispatches `CustomEvent`s on `window` for UI state. Listen to these from outside React (e.g. analytics, toast managers):

| Event | Detail | When |
|---|---|---|
| `wallet-connected` | `{ timestamp, account, wallet? }` | After successful auth (`wallet` is `'starkey'`) |
| `presigned-state` | `{ timestamp, account }` | Between wallet connect and sign prompt |
| `postsigned-state` | `{ timestamp, account }` | After signature accepted, before JWT request |
| `wallet-error` | `{ timestamp, error }` | Any failure in the connect flow |

The `WALLET_EVENTS` constant exported from the hook has these names.
