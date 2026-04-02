# Supra Move Development Skill

A comprehensive Claude Code skill for Supra blockchain Move smart contract development. Gives Claude accurate, Supra-specific guidance at every stage of your development journey.

## What is this?

This skill is loaded into Claude Code so it can give correct, idiomatic Supra/Move code without guessing. It covers environment setup, Move language, Supra-specific APIs, CLI usage, SDK integration, and deployment.

## Features

- **Environment Setup** — Docker-based Supra CLI installation
- **Move Language Fundamentals** — Types, abilities, functions, global storage
- **Data Structures** — vector, Table, SmartTable (with correct usage guidance)
- **Supra-Specific Patterns** — `supra_framework::` usage, SupraCoin, governance
- **CLI Commands** — Init, compile, test, publish, profile management
- **Deployment Automation** — Build and publish scripts
- **Native Supra Features** — dVRF, Oracles, Automation (with working code examples)
- **TypeScript & Python SDKs** — Contract calls with BCS argument serialization
- **Advanced Patterns** — Resource accounts, SignerCapability, multi-signer, upgrade/migration
- **Gas Guidance** — Gas units, fee model, simulation

## Directory Structure

```
supra-dev-skills/
├── SKILL.md                          # Main skill definition (Claude reads this)
├── README.md                         # This file
├── CHANGELOG.md                      # Version history
├── references/
│   ├── core_topics.md                # Core Move & Supra concepts deep-dive
│   ├── supra_vs_aptos.md             # Migration cheatsheet from Aptos
│   ├── native_features.md            # dVRF, Oracles, Automation — full code
│   ├── sdk_guide.md                  # TypeScript & Python SDK with BCS encoding
│   ├── resource_accounts.md          # SignerCapability, vault, DAO patterns
│   ├── patterns.md                   # SmartTable, upgrade, multi-signer, gas
│   └── object_model.md               # Supra object model
└── scripts/
    ├── setup_env.sh                  # Docker + CLI setup
    ├── deploy.sh                     # Compile and publish automation
    ├── version_check.sh              # CLI version check
    ├── example_contract.move         # Counter — basic module template
    ├── token_contract.move           # Custom coin (mint/burn/transfer)
    ├── events_example.move           # Events + registry pattern
    ├── advanced_examples.move        # Admin, pausable, NFT (Table), timelock
    └── test_examples.move            # Full unit test suite patterns
```

## Quick Start

### 1. Setup Environment
```bash
./scripts/setup_env.sh
```

### 2. Create a New Package
```bash
docker exec -it supra_cli /bin/bash
supra move tool init --package-dir /supra/move_workspace/myProject --name myProject
```

### 3. Build and Deploy
```bash
./scripts/deploy.sh myProject
```

## Networks

| Network | RPC URL |
|---|---|
| Testnet | https://rpc-testnet.supra.com |
| Mainnet | https://rpc-mainnet.supra.com |

## Key Links

- [Supra Documentation](https://docs.supra.com)
- [SupraScan Explorer](https://suprascan.io)
- [StarKey Wallet](https://starkey.app)
- [TypeScript SDK](https://github.com/Entropy-Foundation/supra-l1-sdk)
- [Supra Dev Hub](https://github.com/supra-labs/supra-dev-hub)
- [Supra Framework Source](https://github.com/Entropy-Foundation/aptos-core/tree/dev/aptos-move/framework/supra-framework)

## Skill Version

- Version: 2.0.0
- Compatible with: Supra latest stable release
- Language: Move (MoveVM)
