# Starkey runtime quirks

What the Starkey extension actually does, as opposed to what its shape suggests.
Read this before debugging a connect, switch, or network problem — most of the
bugs projects hit here are one of the six items below, and none of them are
visible from the provider's method signatures.

Sources: [StarKey — Establish a Connection](https://docs.starkey.app/getting-started/establish-a-connection),
[Supra — Create a dApp with StarKey](https://docs.supra.com/network/move/getting-started/your-first-dapp-with-starkey).

---

## 1. Account switches arrive on `provider.on`, not on window messages

The documented event surface is on the provider:

```ts
provider.on('accountChanged', (accounts: string[]) => { /* accounts[0] is the new one */ });
provider.on('networkChanged', (data) => { /* data.chainId */ });
provider.on('disconnect', () => { /* site unlinked */ });
```

The extension also passes `starkey-*` messages over `window.postMessage`
(`starkey-extension-installed`, `starkey-wallet-updated`,
`starkey-wallet-disconnected`, `starkey-window-removed`). Those are its internal
page-to-content-script bridge. **They are not the API**, and current builds do
not deliver an account switch to the page that way.

A project that listens only for the window messages never learns the account
changed. Its state stays on the previous wallet until the page is reloaded and
the mount-time read runs again — which is why the bug always gets reported as
"it only updates when I refresh".

`useSupraWallet` subscribes to the provider events and keeps the window
messages as a fallback. Both paths call the same handler, so they cannot
disagree.

**No removal method is documented.** Neither `off` nor `removeListener` appears
in the docs, and some builds ship neither. So: subscribe once per mount, read
live state through refs inside the handlers, and feature-test both spellings on
teardown. A subscription that re-registers whenever state changes stacks
duplicate listeners that nothing can take off again.

## 2. `window.starkey` exists before the extension can answer

The provider object is injected before the extension's background side is ready.
The first `account()` after a page load routinely resolves `[]` on a wallet that
is connected and unlocked.

One empty read is not evidence of a disconnect. Several spaced-out empty reads
are. Reading once and treating `[]` as "signed out" is what makes a page refresh
log the user out — the single most common Starkey integration bug.

```ts
// 8 attempts, 250ms apart, first non-empty wins.
const account = await readStarkeyAccount(provider);
```

Use a low attempt count where there is nothing to reconcile against: a signed-out
page must not sit disabled through a retry window that can only confirm what it
already knows.

## 3. `changeNetwork` does not reliably report what it did

Starkey's **mobile dApp browser rejects `changeNetwork` with
`Unrecognized chain ID.` *after* performing the switch.** Treating the rejection
as failure reports a network error while the wallet is sitting on the correct
chain. This is the usual cause of "connect works on desktop, fails on mobile".

The opposite also happens: a wallet that resolves the call and stays put.

So never trust the call's own answer. Read the chain back and let that decide —
`lib/starkey-network.ts` (`ensureChain`) does exactly this, and quotes the
wallet's rejection text in its error, because that string is the only diagnostic
a mobile dApp browser user can give you: it exposes no console.

Chain IDs are **strings**: `"6"` = testnet, `"8"` = mainnet. Comparisons against
the value the wallet reports are strict, so an unquoted integer in configuration
never matches and detection fails silently.

## 4. Addresses come back in different shapes

The same account can appear as `0x1a2b…` from the extension, zero-padded to 32
bytes from a Move view response, and in another case from a JWT claim or
`localStorage`. A raw `===` between two of them produces false mismatches —
spurious re-auth loops, phantom account switches — and can miss a real change.

Compare through `sameAddress` from `lib/address.ts`, which normalizes to
lowercase, `0x`-prefixed, padded to 64 hex characters. Never compare a shortened
display form.

## 5. Detection has no natural end

A user may install the extension after reading your install prompt, or unlock a
locked wallet a minute later. Detection that gives up after a few seconds leaves
them on the not-installed branch until they reload.

Poll for as long as the component is mounted, keep the poll in a ref so callers
cannot stack intervals, and clear it on unmount.

## 6. A phone browser has no extension at all

`window.starkey` cannot exist in mobile Safari or Chrome, so a "Connect Starkey"
button there is a dead end regardless of what it says.

Hand the current URL to Starkey's in-app dApp browser
and it reopens the page somewhere the provider exists — see
`lib/starkey-link.ts`. Note what the user loses in that hop: the page opens
fresh in a different browser, so no cookies, no `localStorage`, no session
carries over. Anything behind a login or a site gate will ask again.

---

## Signing, while you are here

Two things about the auth flow that bite in the same debugging sessions:

- **The server verifies exactly one message string.** Any "revalidate" or
  "token expiry" wording signed on the client can never verify. Import
  `AUTH_MESSAGE` from `lib/auth-constants.ts` at every call site, client and
  server, and sign that one string everywhere.
- **A valid signature does not prove the claimed address.** `nacl.sign.detached.verify`
  only proves the caller holds the key it handed you. The public key must be
  derived back to an address and compared with the one being claimed, or the
  route is an authentication bypass. `lib/auth.ts` (`deriveSupraAddress`) does
  this: `sha3_256(public_key || 0x00)`, the Aptos-inherited single-Ed25519
  scheme. Accounts that have rotated their key, and multi-key accounts, do not
  derive back to their address — they need an on-chain authentication key lookup
  instead.
