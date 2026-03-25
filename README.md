# Supra Move Development Skill

A comprehensive Claude Code skill for Supra blockchain Move smart contract development. This skill gives Claude accurate, Supra-specific guidance at every stage of your development journey.

## What is this?

This skill is a "cheat sheet" loaded into Claude Code so it can give correct, idiomatic Supra/Move code without guessing. It covers everything from environment setup to deployment and SDK integration.

## Features

- **Environment Setup** — Docker-based Supra CLI installation
- **Move Language Fundamentals** — Types, abilities, functions, global storage
- **Supra-Specific Patterns** — `supra_framework::` usage, SupraCoin, governance
- **CLI Commands** — Init, compile, publish, profile management
- **Deployment Automation** — Build, test, and publish scripts
- **TypeScript SDK** — Interact with contracts from frontend/backend
- **Native Supra Features** — dVRF, Oracles, Automation, Bridge

## Directory Structure

```
supra-dev-skill/
├── SKILL.md                        # Main skill definition (Claude reads this)
├── README.md                       # This file
├── references/
│   ├── core_topics.md              # Core Move & Supra concepts
│   ├── supra_vs_aptos.md           # Migration cheatsheet
│   └── sdk_guide.md                # TypeScript & Python SDK guide
└── scripts/
    ├── setup_env.sh                # Docker + CLI setup
    ├── deploy.sh                   # Compile and publish automation
    ├── example_contract.move       # Basic Move module template
    ├── token_contract.move         # Fungible token example
    └── events_example.move         # Events pattern example
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

- Version: 1.0.0
- Compatible with: Supra latest stable release
- Language: Move (MoveVM)
