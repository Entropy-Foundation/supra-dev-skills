# Changelog

All notable changes to the Supra Dev Skill are documented here.

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
