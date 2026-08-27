# Supra Dev Skills

> A Claude Code plugin that turns Claude into an expert Supra blockchain developer — Move contracts, wallet integration, and the TypeScript SDK, all pre-loaded with verified APIs.

![Version](https://img.shields.io/badge/version-3.1.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Claude](https://img.shields.io/badge/Claude-Code%20Plugin-orange)

This repo is a [Claude Code plugin](https://docs.claude.com/en/docs/claude-code/plugins) that ships three skills as a bundle. Claude auto-activates the right one based on what you're doing:

| Skill | When it activates |
|---|---|
| **supra-move-development** | Writing / reviewing Move contracts, Supra framework, dVRF 3.0, Oracles, Automation, Digital Asset NFTs, CLI workflows |
| **supra-wallet-connect-skill** | Integrating the Starkey wallet into a Next.js / React app, connect-wallet UI, sign-in-with-wallet JWT auth |
| **supra-ts-sdk-skill** | Using `supra-ts-sdk` from a frontend / Node app — queries, balances, view functions, transaction build/simulate/submit |

**No more hallucinated APIs. No more wrong module names. No more debugging code Claude made up.**

---

## Why this exists

Claude's training data for Supra is incomplete and sometimes wrong:

- Calls deprecated SDK methods that don't exist
- Uses `/rpc/v1/` endpoints (correct is `/rpc/v3/`)
- Gets the `aptos_std::` → `supra_std::` rename wrong (it should stay as-is)
- Generates VRF 2.x code (VRF 3.0 uses a different `permit_cap` pattern)
- Uses `supra move tool run` for automation (correct: `supra move automation register`)
- Misses that Starkey injects `window.starkey` *after* page scripts run, so a single detection read finds nothing

Each skill patches a different slice of this — verified against live docs, SDK source, and on-chain behavior.

---

## Install

### Option A — From GitHub (recommended)

Inside Claude Code:

```
/plugin marketplace add https://github.com/Entropy-Foundation/supra-dev-skills.git
/plugin install supra-dev-skills@supra-dev-skills
```

That's it. All three skills are now available and Claude will auto-invoke them based on the task.

### Option B — Local development

Clone the repo and point Claude Code at the local directory:

```bash
git clone https://github.com/Entropy-Foundation/supra-dev-skills.git
claude --plugin-dir ./supra-dev-skills
```

### Option C — Reference a single skill without installing

If you only want one skill and don't want the plugin machinery, reference its `SKILL.md` directly from your project's `.claude/CLAUDE.md`:

```markdown
@/path/to/supra-dev-skills/skills/supra-move-development/SKILL.md
```

---

## Repo layout

```
supra-dev-skills/
├── .claude-plugin/
│   └── plugin.json                       # Plugin manifest
├── skills/
│   ├── supra-move-development/
│   │   ├── SKILL.md
│   │   ├── references/                   # Move deep-dives, SDK guide, patterns
│   │   └── scripts/                      # Docker setup, deploy, example contracts
│   ├── supra-wallet-connect-skill/
│   │   ├── SKILL.md
│   │   ├── assets/                       # Working hook, components, API routes
│   │   └── references/                   # Auth, hook API, troubleshooting
│   └── supra-ts-sdk-skill/
│       └── SKILL.md
├── CHANGELOG.md
├── LICENSE
└── README.md
```

Each skill is self-contained — you can open any `skills/*/SKILL.md` to see exactly what Claude will read.

---

## What each skill covers

### supra-move-development

| Area | Details |
|---|---|
| **Move Language** | Types (u8–u256), abilities, entry/public/view functions, global storage, generics |
| **Supra Framework** | `supra_framework::` rename rules, `aptos_std::` exception, SupraCoin |
| **CLI** | Init, compile, test, publish, profiles, `--upgrade-policy` |
| **Digital Assets** | `aptos_token_objects` collection + token creation, MutatorRef, BurnRef, object transfer |
| **dVRF 3.0** | `permit_cap<T>` pattern, two-level whitelisting, request/callback, gasless VRF |
| **Oracles** | Push oracle price feeds, pair indices, price-gated contracts |
| **Automation** | `supra move automation register` with correct flags + `--simulate` dry-run |
| **Python SDK** | `supra-sdk`, `EntryFunction.natural()`, `TransactionPayload`, async client |
| **REST API** | `/rpc/v3/` endpoints (v1/v2 deprecated), full endpoint table |
| **Patterns** | SmartTable lifecycle, resource accounts, upgrade/migration, timelock, pausable |
| **Gas** | Fee model, simulation with `simulateTxUsingSerializedRawTransaction` |

### supra-wallet-connect-skill

- Production-tested `useSupraWallet` hook for the Starkey extension
- `connectWallet()`, `disconnectWallet()`, `signMessage()`, `sendRawTransaction()`
- Optional sign-in-with-wallet → JWT → httpOnly cookie flow (nonce / signature verification, edge-runtime API routes)
- Drop-in `ConnectWalletHandler` + modal (Tailwind / shadcn / framer-motion / sonner)
- SupraNS reverse resolution — render `alice.supra` instead of `0x944f...`

### supra-ts-sdk-skill

- `SupraClient` setup for Next.js / React
- Account queries, balances, resources, events
- Transaction lifecycle: build, simulate, submit, wait
- View functions, ABI proxies, Move type mapping
- BCS encoding with `supra-l1-sdk-core`

---

## Key gotchas these skills prevent

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
- [TypeScript SDK](https://github.com/Entropy-Foundation/supra-ts-sdk)
- [Supra Framework Source](https://github.com/Entropy-Foundation/aptos-core/tree/dev/aptos-move/framework/supra-framework)
- [VRF Interface](https://github.com/Entropy-Foundation/vrf-interface)

---

## Contributing

PRs welcome — especially for:
- New SDK method verifications
- Updated VRF / Automation / Oracle docs
- Additional Move patterns
- Wallet edge cases
- Bug reports when Claude still gets something wrong

Please document the source (official docs, SDK source, or on-chain verification) for any factual changes.

---

## License

MIT — see [LICENSE](./LICENSE)
