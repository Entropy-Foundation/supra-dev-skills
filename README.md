# Supra Move Development Skill

> Drop this into Claude Code and get an expert Supra Move developer in your editor — instantly.

![Version](https://img.shields.io/badge/version-2.2.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Move](https://img.shields.io/badge/language-Move-purple)
![Claude](https://img.shields.io/badge/Claude-Code%20Skill-orange)

A production-ready [Claude Code skill](https://docs.anthropic.com/en/docs/claude-code/skills) that gives Claude deep, verified knowledge of Supra blockchain development — correct SDK patterns, CLI commands, dVRF 3.0, Oracles, Automation, Digital Asset NFTs, and all the Supra-vs-Aptos gotchas pre-loaded.

**No more hallucinated APIs. No more wrong module names. No more debugging code Claude made up.**

---

## Why this exists

Claude's training data for Supra is incomplete and sometimes wrong:
- Calls deprecated API methods that don't exist in the SDK
- Uses `/rpc/v1/` endpoints (correct version is `/rpc/v3/`)
- Gets `aptos_std::` → `supra_std::` rename wrong (it should stay as-is)
- Generates VRF 2.x code (VRF 3.0 uses a completely different `permit_cap` pattern)
- Uses `supra move tool run` for automation (correct command is `supra move automation register`)

This skill patches all of that — verified against live docs, the SDK source, and the VRF interface.

---

## What's covered

| Area | Details |
|---|---|
| **Move Language** | Types (u8–u256), abilities, entry/public/view functions, global storage, generics |
| **Supra Framework** | `supra_framework::` rename rules, `aptos_std::` exception, SupraCoin |
| **CLI** | Init, compile, test, publish, profiles, `--upgrade-policy` |
| **Digital Assets** | `aptos_token_objects` collection + token creation, MutatorRef, BurnRef, object transfer |
| **dVRF 3.0** | `permit_cap<T>` pattern, two-level whitelisting, request/callback, max txn fee, gasless VRF |
| **Oracles** | Push oracle price feeds, pair indices, price-gated contracts |
| **Automation** | `supra move automation register` with all correct flags + `--simulate` dry-run |
| **TypeScript SDK** | `createSerializedRawTxObject`, `sendTxUsingSerializedRawTransaction`, `invokeViewMethod`, BCS encoding |
| **Python SDK** | `supra-sdk`, `EntryFunction.natural()`, `TransactionPayload`, async client |
| **REST API** | `/rpc/v3/` endpoints (v1/v2 deprecated), full endpoint table |
| **Patterns** | SmartTable lifecycle, resource accounts, upgrade/migration, timelock, pausable |
| **Gas** | Fee model, simulation with `simulateTxUsingSerializedRawTransaction` |

---

## Quickstart

### 1. Clone the skill

```bash
git clone https://github.com/YOUR_ORG/supra-dev-skills.git
```

### 2. Load into Claude Code

**Option A — Project-level (recommended)**

In your Supra project, create `.claude/CLAUDE.md`:
```markdown
@/path/to/supra-dev-skills/SKILL.md
```
Claude Code reads this automatically at the start of every session.

**Option B — Reference in your prompt**
```
@/path/to/supra-dev-skills/SKILL.md
```

**Option C — Copy into your CLAUDE.md**

Copy the contents of `SKILL.md` directly into your project's `.claude/CLAUDE.md` alongside any project-specific instructions.

### 3. Start building

```bash
# Set up the Supra CLI (Docker-based)
./scripts/setup_env.sh

# Enter the container — all supra CLI commands run here
docker exec -it supra_cli /bin/bash

# Create a new Move package
supra move tool init --package-dir /supra/move_workspace/myProject --name myProject

# Deploy
./scripts/deploy.sh myProject myAccount testnet
```

---

## Repo structure

```
supra-dev-skills/
├── SKILL.md                     # Main skill file — Claude reads this
├── CHANGELOG.md                 # Full version history with every fix documented
├── references/
│   ├── core_topics.md           # Move fundamentals deep-dive
│   ├── supra_vs_aptos.md        # Aptos → Supra migration cheatsheet
│   ├── native_features.md       # dVRF 3.0, Oracles, Automation — full examples
│   ├── sdk_guide.md             # TypeScript + Python SDK with BCS encoding
│   ├── resource_accounts.md     # SignerCapability, vault, DAO patterns
│   ├── patterns.md              # SmartTable lifecycle, upgrade, multi-signer, gas
│   └── object_model.md          # Supra object model + Digital Assets
└── scripts/
    ├── setup_env.sh             # Docker + Supra CLI setup
    ├── deploy.sh                # Compile and publish automation
    ├── version_check.sh         # CLI version check
    ├── example_contract.move    # Counter — basic module template
    ├── token_contract.move      # Custom coin (mint / burn / transfer)
    ├── events_example.move      # Events + registry pattern
    ├── advanced_examples.move   # Admin, pausable, DA NFT, timelock
    └── test_examples.move       # Unit test patterns
```

---

## Key gotchas this skill prevents

**1. `aptos_std::` must NOT be renamed**
```move
// WRONG — will fail to compile
use supra_std::smart_table::SmartTable;

// CORRECT — aptos_std keeps its prefix on Supra
use aptos_std::smart_table::SmartTable;
```

**2. `supra move automation register` — not `supra move tool run`**
```bash
# WRONG
supra move tool run --function-id 'supra_automation::automation_registry::register_task' ...

# CORRECT
supra move automation register --task-max-gas-amount 50000 --function-id "module::func" ...
```

**3. REST API is `/rpc/v3/` — not v1 or v2**
```
# WRONG (404)
GET /rpc/v1/accounts/{address}/resources

# CORRECT
GET /rpc/v3/accounts/{address}/resources
```

**4. dVRF 3.0 uses `permit_cap<T>` — not raw sender + addresses**
```move
// VRF 2.x — DEPRECATED
supra_vrf::rng_request(sender, @my_module, string::utf8(b"lottery"), ...)

// VRF 3.0
supra_vrf::rng_request<LotteryPermit>(&state.permit_cap, string::utf8(b"distribute"), ...)
```

---

## Networks

| Network | RPC URL |
|---|---|
| Testnet | https://rpc-testnet.supra.com |
| Mainnet | https://rpc-mainnet.supra.com |

---

## Links

- [Supra Docs](https://docs.supra.com)
- [SupraScan Explorer](https://suprascan.io)
- [StarKey Wallet](https://starkey.app)
- [TypeScript SDK](https://github.com/Entropy-Foundation/supra-l1-sdk)
- [Supra Framework Source](https://github.com/Entropy-Foundation/aptos-core/tree/dev/aptos-move/framework/supra-framework)
- [VRF Interface](https://github.com/Entropy-Foundation/vrf-interface)

---

## Contributing

PRs welcome — especially for:
- New SDK method verifications
- Updated VRF / Automation / Oracle docs
- Additional Move patterns
- Bug reports when Claude still gets something wrong

Please document the source (official docs, SDK source, or on-chain verification) for any factual changes.

---

## License

MIT — see [LICENSE](./LICENSE)
