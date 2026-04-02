# Changelog

All notable changes to the Supra Dev Skill are documented here.

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
