# Migrating from a Single-Wallet Integration

If the project already has a Starkey-only (or Ribbit-only) integration, the goal is usually to add the second wallet without breaking anything that depends on the existing API.

## Questions to answer before touching code

1. **What's the existing hook called, and what does it return?** Search for `window.starkey` or `starkey.supra` in the project. The existing code is probably a hook named `useStarkeyWallet` or `useSupraWallet` that returns some subset of `{ connectWallet, disconnectWallet, accounts, signMessage, ... }`.
2. **Who consumes it?** Grep for imports. If it's used in many places, preserve the exported name and public API — add Ribbit support internally without changing the return shape.
3. **Is there existing auth?** If there's a `lib/auth.ts`, `/api/auth/*`, or JWT verification already, don't blindly overwrite — read what they have first and merge.
4. **What state/context structure do they use?** If there's a React context provider, the new hook should slot into the same provider (or the provider needs to be updated to use the new hook).

## Migration strategies

### Strategy A: Drop-in replacement (fastest)

Best when the existing hook is small and not heavily customized.

1. Install the new deps: `ribbit-wallet-connect`, `tweetnacl`, (and `jose` if adding auth).
2. Copy `assets/hooks/useSupraMultiWallet.ts` into the project alongside the existing hook.
3. Rename the export so existing imports still work — e.g. if the old hook was `useSupraWallet`, either:
   - Rename `useSupraMultiWallet` to `useSupraWallet` and delete the old file, or
   - Add `export default useSupraMultiWallet as useSupraWallet` alongside
4. The new hook's return shape is a superset of the common patterns (accounts, connectWallet, disconnectWallet, signMessage, sendRawTransaction). Any field the old hook returned that the new one doesn't should be added manually.
5. Update the provider/context to use the new hook.
6. Test every place that calls `connectWallet()` — the new version optionally takes a `walletType` argument. Callers that don't pass one will default to whatever's in localStorage (falling back to `'starkey'`), which preserves old behavior.

### Strategy B: Wrap and compose (safest for large codebases)

Best when the existing hook has significant app-specific logic that you can't risk losing.

1. Keep the existing hook as-is.
2. Add `useSupraMultiWallet` alongside, but scoped to a new `WalletSelector` component that sits next to the existing connect UI.
3. When the user selects Ribbit, switch which hook drives the app state (via a top-level context).
4. Gradually migrate features from the old hook to the new one as you validate each works.

This is slower but avoids a big-bang migration. Useful when the old hook is tangled with analytics, user profile fetching, or other app-specific concerns.

### Strategy C: Incremental — add Ribbit support to the existing hook

Best when the existing hook is already structurally similar to the reference one (switch statements by wallet type, capability flags).

1. Don't copy the whole hook. Instead, add the Ribbit branches to each existing method.
2. The relevant chunks to port:
   - `WALLET_CONFIGS.ribbit` definition and `initSdk()` import
   - Ribbit case in `checkExtensionInstalled`, `updateAccounts`, `updateBalance`, `getNetworkData`
   - Ribbit case in `connectWallet` (lines 543-625 of the reference)
   - Ribbit case in `signMessage` (lines 867-903)
   - Ribbit case in `sendRawTransaction` (lines 770-811)
3. Add a `selectedWallet` state and `WALLET_CONFIGS` with capability flags so you can gate Ribbit-incompatible paths (network switching, account-switch events).
4. Ribbit uses a different message format for `signMessage` — the nonce must be an integer, not a string, and `chainId` is required. Match the exact call shape from the reference.

## API differences to watch out for

These are the places where Starkey and Ribbit have different behavior that the hook papers over — if the existing code makes Starkey-only assumptions, these are your migration risks:

| Area | Starkey | Ribbit |
|---|---|---|
| Account check | `provider.account()` returns `string[]` | `provider.getWalletInfo()` returns `{ connected, walletAddress }` |
| Balance | `provider.balance()` returns `{ formattedBalance, displayUnit }` | `provider.getWalletBalance({ chainId, resourceType, decimals })` returns `{ balance }` |
| Sign message | `provider.signMessage({ message, nonce })`, nonce as string | `provider.signMessage({ message, nonce, chainId })`, nonce as integer, chainId required |
| Raw tx | Payload array + `createRawTransactionData` + `sendTransaction` | `RawTxnRequest` object + `createRawTransactionBuffer` + `signAndSendRawTransaction` |
| Events | `window.postMessage` with `starkey-*` names | None — no events, poll state if needed |
| Network switch | `provider.changeNetwork({ chainId })` | Not supported — user does it in-app |
| Install detection | `window.starkey?.supra` is sync | `initSdk()` may need retries for a short window after page load |

## What the JWT auth layer looks like if you're adding it

If the existing project has no auth and the user wants it along with multi-wallet support:

1. Copy `assets/lib/auth.ts` and all `assets/api/*` routes
2. Set `JWT_SECRET` env var
3. The hook's connect flow already includes the nonce → sign → create-jwt → wallet-login sequence — just ensure the `AUTH_MESSAGE` is consistent
4. For any existing "who's the user" check that relied on session or custom auth, replace with `verifyToken(cookies().get('authToken')?.value)` in server components

If the project has auth already (e.g. email/password, magic link), you have options:
- **Wallet auth as an additional factor** — issue a wallet-specific JWT under a different cookie name and require both for protected routes
- **Wallet auth replacing existing auth** — migrate users by asking them to link their wallet at next login, then retire the old flow
- **Wallet as optional identity** — let users optionally connect a wallet on top of their existing account, store the wallet address on their user record

The choice is a product decision. Flag it to the user; don't pick for them.

## Smoke-test checklist after migration

- [ ] Old users who only had Starkey can still connect (localStorage still says `'starkey'` or similar — the new hook should default correctly)
- [ ] New users can pick between Starkey and Ribbit
- [ ] If only one wallet extension is installed, the modal still works (the other shows as "not installed")
- [ ] Network switching prompts still appear for Starkey users
- [ ] Disconnect clears state for both wallets cleanly
- [ ] `sendRawTransaction` calls throughout the app still work on Starkey (run at least one on Ribbit too)
- [ ] Any places that read `window.starkey?.supra` directly are either updated to use `getCurrentProvider()` or have a fallback for the Ribbit case
