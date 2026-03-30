# Changelog

All notable changes to the Supra Dev Skill are documented here.

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
