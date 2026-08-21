# Changelog

All notable changes to the Supra Dev Skill are documented here.

---

## [3.1.0] — August 2026

Starkey runtime correctness pass on `supra-multiwallet-skill`, from defects found
while shipping a production Starkey dApp against version 3.0.0. Everything below
was reproducible in the shipped template.

### Security

- **`verifyWalletSignature` did not bind the public key to the claimed address** —
  an authentication bypass. `nacl.sign.detached.verify` only proves the caller
  holds *some* key; the shipped code left the address check as a `TODO` and
  returned `true`. An attacker could sign `AUTH_MESSAGE` with their own key, send
  any `address`, and receive a JWT for it. `lib/auth.ts` now derives the address
  the key controls — `sha3_256(pubkey || 0x00)`, Supra's Aptos-inherited
  single-Ed25519 scheme — and compares it with the claim. Adds a `js-sha3`
  dependency (pure JS, edge-safe). Documented in `references/auth-architecture.md`,
  including the rotated-key / multi-key limitation this derivation carries.
- **`sendRawTransaction` signed as `accounts[0]` without checking the wallet was
  still on that account.** After an account switch whose re-auth failed, the app
  could sign as account B while the session claimed account A. It now re-reads the
  exposed account and refuses on a mismatch.

### Critical Fixes

- **Account switches were listened for on the wrong transport.** The hook reacted
  only to the `starkey-*` `window.postMessage` events. Those are the extension's
  internal page-to-content-script bridge, not its API, and current builds do not
  deliver an account switch to the page that way — so switching account in Starkey
  did nothing until the user reloaded. The hook now subscribes to Starkey's
  documented events (`provider.on('accountChanged' | 'networkChanged' |
  'disconnect')`), once per mount, with handlers reading live state through refs
  and `off`/`removeListener` feature-tested on teardown. The window messages stay
  as a fallback and route into the same handler.
- **Token revalidation could never succeed.** `signIn()` and
  `checkAndRevalidateToken()` signed `'Sign message to revalidate login to …'` and
  `'Token Expiry: …'`, while `create-jwt` verifies exactly one string — so both
  returned 401 every time and the only recovery was a full reconnect. All call
  sites now import `AUTH_MESSAGE` from `lib/auth-constants.ts`, and pass
  `forceSign` so the `isSigningWallet` latch cannot swallow the prompt.
- **`lib/auth-constants.ts` was shipped in 3.0.0 but nothing imported it.** The
  hook still had four hardcoded copies of the message and `create-jwt` declared
  its own fifth. Now genuinely one source of truth; `SKILL.md` Step 4 no longer
  asks for a five-place find-and-replace.

### Significant Fixes

- **A single `account()` read decided a connected wallet was gone.**
  `window.starkey` is injected before the extension's background side can answer,
  so the first read after a page load routinely resolves `[]` on a connected
  wallet — which signed the user out on every refresh. Added
  `readStarkeyAccount`: 8 attempts, 250 ms apart, first non-empty wins.
- **`changeNetwork` was trusted to report what it did.** Starkey's mobile dApp
  browser rejects it with `Unrecognized chain ID.` *after* performing the switch,
  so connect failed on mobile with the wallet on the correct chain. New
  `lib/starkey-network.ts` (`ensureChain`) decides by reading the chain back, and
  quotes the wallet's rejection text — the only diagnostic available in a browser
  with no console. Also catches the opposite lie: a call that resolves and
  changes nothing.
- **`switchToChain()` was a no-op on first connect.** It guarded on
  `selectedChainId`, which callers set with `setSelectedChainId()` in the same
  tick, so React had not committed it when the guard ran. The chain id is now
  passed as an argument.
- **Addresses were compared as raw strings.** New `lib/address.ts`
  (`normalizeAddress`, `sameAddress`) — the extension, Move view responses, JWT
  claims and `localStorage` disagree about zero-padding and case for the same
  account, which produced phantom account switches and re-auth loops.
- **The account-switch handler logged the user out before the new credential
  existed.** It called `wallet-logout` first, then asked for a signature; a
  declined prompt left the session gone, wallet state populated, and
  `resetWalletData()` never called. Now: acquire, swap on success, reset
  explicitly on failure.
- **Nothing re-rendered Server Components after a wallet change.** A wallet change
  is client-side, so any Server Component reading the auth cookie kept rendering
  the previous wallet's data. New `assets/components/WalletSessionSync.tsx`
  compares the connected address with the one the page was rendered with and calls
  `router.refresh()` on divergence. Wired through a new optional
  `<WalletProvider serverAddress={…}>` prop, so it is one line in the layout
  rather than a component to remember per page.
- **The connect modal was a dead end on mobile.** `ConnectWalletHandler` only
  rendered wallets where `isInstalled` was true, so on a phone — where a browser
  extension cannot exist at all — the list was empty and the fallback read
  "Please install a wallet extension". It now shows an **Open in Starkey** row
  that hands the current URL to Starkey's in-app dApp browser. Handheld detection
  runs in an effect, not during render, to avoid a hydration mismatch.
- **Extension detection gave up after five seconds, permanently.** A user who
  installed Starkey from the app's own prompt, or unlocked a locked wallet a
  minute later, stayed on the not-installed branch until reload. Detection now
  polls for as long as the component is mounted, is idempotent so callers cannot
  stack intervals, and clears on unmount.
- **Two fast clicks opened two approval popups.** `connectWallet` guarded nothing
  synchronously — `setLoading(true)` is only visible after React commits. Added an
  `inFlight` ref covering connect and transaction sends.
- **An account switch could raise one signature prompt per listener.** Several
  instances of the hook are alive at once in this template (`WalletProvider` calls
  it, so does the connect modal) and each subscribes to `accountChanged`; the
  window-message fallback can report the same switch again. Per-instance state
  updates are wanted, but the re-auth is a one-time side effect, so it is now
  claimed through a module-scoped guard keyed on the normalized address.
- **The account-switch re-auth posted the wrong payload.** It destructured
  `const { signature } = signResult` and sent only that, while `create-jwt`
  requires both `signature` and `publicKey` — so every switch answered 400
  `Invalid signature format`. It now sends the whole `signMessage` result, as the
  connect path already did.

### Minor Fixes

- `provider.connect()` is now called as `provider.connect({ chainId })`, so the
  approval sheet opens on the target network. Extensions that ignore the argument
  drop it; `ensureChain` still runs after either way.
- The `PRESIGNED_STATE` / `POSTSIGNED_STATE` events carried `accounts[0]` — state
  that had not committed inside that closure — so consumers received the
  *previously* connected account, or `undefined` on a first connect. They now
  carry the account just read.
- `disconnectWallet` no longer calls `router.push('/')` from inside the hook.
  Routing is the caller's decision via a new `useSupraMultiWallet({ onDisconnect })`
  option; the old behaviour yanked users out of modals and nested layouts.
- `updateBalance` accepts the address to read, so the balance is no longer blank
  after a first connect (it previously guarded on a not-yet-committed `accounts`).

### Documentation

- **New `references/starkey-runtime-quirks.md`** — the document whose absence
  caused most of the above. What the extension actually does: which events report
  an account switch, why the first `account()` comes back empty, why
  `changeNetwork` lies in the mobile dApp browser, address shapes by source,
  detection with no natural end, and why a phone browser has no provider at all.
  Linked from `SKILL.md` as required reading before touching event or network code.
- **`references/troubleshooting.md`** — eight new entries keyed to the symptom a
  developer actually searches for, from "switching account does nothing until I
  reload" to "anyone can obtain a session for an address they do not control".
- **`SKILL.md`** — the "Key things to remember" entry that described the
  `starkey-*` window messages as Starkey's event surface has been replaced; it was
  teaching the defect. Adds the Server Component resync rule, the read-back rule
  for both things the wallet lies about, and three mandatory test steps (switch
  account with the page open, reload, connect from the mobile dApp browser) that a
  desktop-only happy-path test always passes by accident.
- **`references/hook-api.md`** — options table, the provider event list, and the
  one-prompt-at-a-time concurrency contract.
- **`references/no-auth-mode.md`** — now shows which half of the account-switch
  handler to strip, instead of implying the whole handler can go.

### Known limitations

- Not runtime-verified against every Starkey build. The event transport, the empty
  first read, and the `changeNetwork` behaviour are grounded in Starkey's docs and
  in a reproduction in a production dApp, not in a matrix of extension versions.
- Whether Starkey exposes `off` or `removeListener` is undocumented either way,
  which is why the subscription feature-tests both and tolerates neither existing.
- `deriveSupraAddress` covers single-Ed25519 accounts that have not rotated their
  key. Rotated-key and multi-key accounts cannot sign in without an on-chain
  authentication key lookup.

---

## [2.2.0] — April 2026

### Critical Fixes
- **Automation CLI** — Replaced `supra move tool run --function-id 'supra_automation::automation_registry::register_task'` with the correct dedicated subcommand `supra move automation register` and all correct flag names (`--task-max-gas-amount`, `--task-gas-price-cap`, `--task-expiry-time-secs`, `--task-automation-fee-cap`, `--function-id`, `--args`). Added `--simulate` dry-run example. Affects SKILL.md and `references/native_features.md`.
- **REST API endpoints** — Updated from `/rpc/v1/` to `/rpc/v3/` (current API). `/rpc/v1/` and `/rpc/v2/` are deprecated. Only two legacy v1 endpoints remain (`/rpc/v1/transactions/chain_id`, `/rpc/v1/transactions/parameters`). Full v3 endpoint table added to `references/sdk_guide.md`.
- **`setup_env.sh`** — All three command hints in "Next Steps" output now include `--profile myAccount` (`supra key generate`, `fund-with-faucet`, `publish`). Without this, subsequent `--profile` flags in deploy steps fail with "profile not found".

### Significant Fixes
- **`simulateTx` signature** — `client.simulateTx(account, rawTxn)` does not exist. Replaced with `simulateTxUsingSerializedRawTransaction(serializedRawTx, account)` in both `sdk_guide.md` and `patterns.md`. Added explicit warning that the old signature does not exist.
- **`AccountAddress.fromDerivationPath`** — Method does not exist in `supra-l1-sdk`. Removed from `resource_accounts.md` and replaced with manual `sha3_256` derivation using `js-sha3`, with the correct domain separator (`0xFF`) and byte layout documented.
- **`advanced_examples.move` transfer_nft** — Added prominent `DEMO PATTERN — NOT PRODUCTION SAFE` comment explaining the ownership limitation (only collection admin can hold transferable NFTs in this pattern).
- **README version** — Updated from 2.0.0 to 2.1.0 to match SKILL.md.

### Minor Fixes
- **README Option B** — Fixed `/read /path/...` to `@/path/...` (correct Claude Code file-reference syntax).
- **VRF minimum deposit** — Removed hardcoded "10 SUPRA on testnet" and replaced with link to live VRF docs (deposit covers callback gas costs and may change).
- **`supra_governance` naming anomaly** — Added callout in `supra_vs_aptos.md`: governance is the only module that changes its name (not just framework prefix): `aptos_framework::governance` → `supra_framework::supra_governance`.
- **SKILL.md version block** — Removed `Framework: supra_framework (rev = "dev")` which contradicted the top-of-file rev warning. Now says "pin rev for production — see warning above".

---

## [2.1.0] — April 2026

### Critical Fixes (Would Have Broken Developers)
- **Python SDK** — Complete API rewrite. Previous examples used fabricated API (`SupraAccount.from_private_key`, `bcs.encode_u64`, etc.). Real API verified against PyPI `supra-sdk==0.1.1` and official docs: async `SupraClient`, `Account.generate()`, `Account.load_key()`, `EntryFunction.natural()` + `TransactionArgument(value, Serializer.encoder)` + `TransactionPayload` pattern.
- **TypeScript SDK** — `invokeContractFunction` does not exist in the SDK. Replaced with real two-step pattern: `createSerializedRawTxObject` + `sendTxUsingSerializedRawTransaction`. View calls changed from `invokeView` to real `invokeViewMethod`.
- **TypeScript version pin** — `@2.0.0` does not exist on npm (published versions start at `3.0.0`; latest is `5.0.2`). Fixed to `@5.0.2` / `@latest`.
- **`deploy.sh`** — Added required `PROFILE` argument; both `fund-with-faucet` and `publish` now pass `--profile $PROFILE`. Script errors out with usage message if profile is omitted.
- **`core_topics.md`** — Added `aptos_std` exception section at the bottom. The previous blanket "replace all aptos_ with supra_" rule was stated without qualification — any Claude session reading only this file would produce broken SmartTable/Table imports.
- **`advanced_examples.move`** — Added `E_ALREADY_EXECUTED: u64 = 7` constant; `execute_timelock` now uses it instead of the semantically wrong `E_ALREADY_EXISTS`. Added NFT ownership check in `transfer_nft`: `assert!(item.owner == admin_addr, E_NOT_ADMIN)`.
- **`patterns.md` / `sdk_guide.md`** — Fixed simulation method: `simulateTransaction(account, "addr", ...)` does not exist. Correct pattern is `createRawTxObject(...)` → `simulateTx(account, rawTxn)`.

### Significant Fixes
- **`aptos_std` exception callout** — Added `aptos_std` exception in SKILL.md (two critical warning blocks), `supra_vs_aptos.md`, and `core_topics.md`. Added complete list: SmartTable, Table, type_info, string_utils, math64, math128, comparator, from_bcs. Added `aptos_token` exception (legacy NFT at 0x3).
- **Move.toml pin guidance** — Added link to framework commit history and `git log` tip for finding stable commit hashes.
- **`--profile` flag** — Added to all CLI commands in SKILL.md, `deploy.sh`, `native_features.md` dVRF CLI, and dVRF example in SKILL.md.
- **Account activation** — Added note: accounts don't exist on-chain until funded. `fund-with-faucet` must run before `publish`.
- **Oracle dependency** — Added Move.toml `[addresses]` note for `supra_oracle` with link to docs. Oracle is on-chain, not a git dep.
- **dVRF `deposit::` CLI** — Fixed bare `deposit::` prefix to `<DEPOSIT_CONTRACT_ADDRESS>::deposit::...` with link to docs for the real address.
- **dVRF return type** — `vector<u256>` confirmed against interface source. Added comment with source link.
- **Automation CLI** — Added `--profile` and warning to verify `register_task` argument format against live docs.
- **FA Mainnet guidance** — Recommend `coin` standard from day one if targeting mainnet.
- **`token_contract.move`** — Added `burn()` function (was promised in file header but missing). Added registration prerequisite warning to `mint()`.
- **`object_model.md`** — Added `aptos_token` exception note, Digital Assets (`0x4`) mainnet verification caveat.
- **`supra_vs_aptos.md`** — Expanded `aptos_std` exception list and added `aptos_token` second exception section.
- **`patterns.md`** — Fixed `SupraAccount` constructor to canonical form (`Uint8Array.from(Buffer.from(...))`). Added Section 5: Table/SmartTable destruction lifecycle with worked example and quick-reference table.
- **`resource_accounts.md`** — Added TypeScript SDK address derivation example with `AccountAddress.fromDerivationPath`.
- **`deploy.sh`** — Added Docker context note (script must run inside container).
- **SKILL.md** — Install URL verification note, Docker container requirement callout. `Last Reviewed` date replaced with "See CHANGELOG.md".
- **TypeScript `0x1` = supra_framework** — Added explicit note in `sdk_guide.md` that `supra_framework` lives at `0x1`.
- **README.md** — Added "How to Load This Skill into Claude Code" section (three options: CLAUDE.md import, direct read, copy).

### BCS encoding table
- Fixed `address` encoding: `TxnBuilderTypes.AccountAddress.fromHex("0x...").toUint8Array()` (not `BCS.bcsToBytes(...)`)
- Added `BCS.bcsSerializeStr` for string/vector<u8> arguments
- Added Python `Serializer` encoder reference table

---

## [2.0.0] — April 2026

### Bug Fixes
- Fixed `std::supra::address_of` typo → `std::signer::address_of` in `test_examples.move` (line 76)
- Fixed `E_PAUSED` misuse in `execute_timelock` → correct dedicated `E_TIMELOCK_NOT_READY` constant
- Wired `assert_not_paused` into `mint_nft` and `transfer_nft` (was defined but never called)
- Replaced O(n) NFT vector pattern with `Table<u64, NFTItem>` (O(1) lookup) in `advanced_examples.move`

### Added
- `references/resource_accounts.md` — SignerCapability, resource account vault pattern, DAO, init_module auto-setup
- `references/patterns.md` — SmartTable usage, upgrade/migration (3 strategies), multi-signer transactions, gas model
- BCS argument serialization examples in `references/sdk_guide.md` (address, u8, u64, u128, bool, vector<u8>)
- Python SDK contract call example with argument encoding
- SmartTable inline examples in SKILL.md (with Table vs vector comparison table)
- Gas/fee model section: Quants, gas units, simulation, common pitfalls
- Multi-signer (multi-agent) transaction pattern with TypeScript SDK example
- Upgrade/migration guidance: compatible publish, new module + migration, resource account proxy
- `init_module` auto-setup pattern documented
- Version pinning guidance for TypeScript SDK (`npm install supra-l1-sdk@x.y.z`)

### Improved
- SKILL.md fully restructured into named sections (SETUP, MOVE LANGUAGE, DATA STRUCTURES, SUPRA SPECIFICS, COMMON PATTERNS, NATIVE FEATURES, SDK, TESTING, UPGRADE, NETWORK)
- Move.toml `rev = "dev"` warning elevated to the very top of SKILL.md as a visible callout
- README.md directory listing synced with actual repo contents (was missing advanced_examples.move, test_examples.move, version_check.sh)
- `token_contract.move` and `events_example.move` now explicitly referenced in SKILL.md with descriptions
- All reference files listed in SKILL.md table with one-line descriptions

---

## [1.1.0] — March 2026

### Fixed
- **dVRF example completely rewritten** — replaced placeholder `vrf::random_u64()` with
  the real v2 request/callback pattern using `supra_vrf::rng_request()` and
  `supra_vrf::verify_callback()`. Added whitelist/deposit CLI commands.
- **Oracle example now functional** — replaced hollow placeholder with real
  `oracle::get_price(pair_index)` call pattern including a price-gated transfer demo.
- **Automation example now accurate** — replaced vague stub with real entry function
  pattern where conditions live inside the function. Added CLI registration command
  with all required parameters (max_gas_amount, gas_price_cap, automation_fee_cap).
- **NFTTransferred event now used** — added `transfer_nft()` function in
  `advanced_examples.move` that properly emits the event.
- **Faucet command now shows account creation first** — prevents confusion for
  beginners who haven't created a profile yet.
- **Python SDK section expanded** — added real code examples for init, fund, transfer,
  and contract invocation.

### Added
- `SupraCoin transfer` example added to SKILL.md (Move-level coin transfer)
- `rev = "dev" warning` added to SKILL.md explaining instability risk and how to pin
- `EVM scope disclaimer` added — this skill is MoveVM only, links to EVM docs
- `Skill version + last reviewed date` added to SKILL.md
- `CHANGELOG.md` (this file)

---

## [1.0.0] — March 2026

### Initial Release
- SKILL.md — main brain file
- README.md
- references/core_topics.md
- references/object_model.md
- references/native_features.md
- references/supra_vs_aptos.md
- references/sdk_guide.md
- scripts/setup_env.sh
- scripts/deploy.sh
- scripts/version_check.sh
- scripts/example_contract.move
- scripts/token_contract.move
- scripts/events_example.move
- scripts/advanced_examples.move
- scripts/test_examples.move
