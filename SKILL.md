# Supra Move Development Skill

## Overview

You are an expert Supra blockchain developer. Supra is a full-stack, high-performance Layer 1 blockchain that supports both **MoveVM** (Move language) and **EVM** (Solidity). This skill focuses on the **MoveVM** path using the **Move programming language** and **Supra CLI**.

Always use `supra_framework::` — NOT `aptos_framework::` — for all imports.

---

## ⚠️ Important Notes

### This Skill Covers MoveVM Only
Supra also supports EVM (Solidity). This skill is Move-only.
For EVM/Solidity on Supra: https://docs.supra.com/network/evm/

### Move.toml rev = "dev" Warning
The SupraFramework dependency uses `rev = "dev"` which tracks the live development branch.
This means it can change at any time and may occasionally break builds.
For production, pin to a specific commit hash:
```toml
[dependencies.SupraFramework]
git = "https://github.com/Entropy-Foundation/aptos-core.git"
rev = "SPECIFIC_COMMIT_HASH_HERE"  # pin for stability
subdir = "aptos-move/framework/supra-framework"
```

---

## Skill Version
- Version: 1.0.0
- Last Reviewed: March 2026
- Tested Against: Supra CLI (May 2025 release)
- Framework: supra_framework (rev = "dev")

---

## Environment Setup

### Prerequisites
- Docker Desktop installed and running
- Supra CLI runs inside a Docker container

### Install Supra CLI via Docker
```bash
# Step 1: Pull and start the container
cd Documents
curl https://raw.githubusercontent.com/supra-labs/supra-dev-hub/refs/heads/main/Scripts/cli/compose.yaml | docker compose -f - up -d

# Step 2: Enter the container shell
docker exec -it supra_cli /bin/bash

# Step 3: Verify CLI works
supra --help
```

---

## Key CLI Commands

```bash
# Create a new Move package
supra move tool init --package-dir /supra/move_workspace/myProject --name myProject

# Compile the package
supra move tool compile --package-dir /supra/move_workspace/myProject

# Create an account/profile first
supra key generate --key-type ed25519 --profile myAccount

# Activate the profile
supra key activate-profile myAccount

# Fund the active profile from testnet faucet
supra move account fund-with-faucet --rpc-url https://rpc-testnet.supra.com

# Publish/deploy to testnet
supra move tool publish --package-dir /supra/move_workspace/myProject --rpc-url https://rpc-testnet.supra.com

# List profiles/accounts
supra profile -l

# Activate a profile
supra key activate-profile accountB

# Get help on any command
supra move tool publish --help
```

---

## Move.toml Template

```toml
[package]
name = "myProject"
version = "1.0.0"
authors = []

[addresses]
my_module = "YOUR-SUPRA-ADDRESS-HERE"

[dev-addresses]

[dependencies.SupraFramework]
git = "https://github.com/Entropy-Foundation/aptos-core.git"
rev = "dev"
subdir = "aptos-move/framework/supra-framework"

[dev-dependencies]
```

---

## Module Structure

```move
// Format: module <address>::<module_name>
module my_module::hello {
    use supra_framework::account;
    use supra_framework::event;
    use supra_framework::supra_coin::SupraCoin;

    // All blockchain-stored data must be in a struct with `key`
    struct MyData has key {
        value: u64,
    }

    // Entry functions are callable via transactions
    public entry fun initialize(account: &signer) {
        let data = MyData { value: 0 };
        move_to(account, data);
    }
}
```

---

## Supra vs Aptos — Critical Differences

| Concept | Aptos | Supra |
|---|---|---|
| Framework prefix | `aptos_framework::` | `supra_framework::` |
| Native coin | `AptosCoin` | `SupraCoin` |
| Coin module | `aptos_coin::` | `supra_coin::` |
| Governance | `aptos_framework::governance` | `supra_framework::supra_governance` |
| Randomness | External/manual | Native dVRF built-in |

---

## Move Language Fundamentals

### Abilities
```move
struct MyStruct has key, store, copy, drop { ... }
// key   = can be stored in global storage (on-chain)
// store = can be stored inside other structs
// copy  = can be duplicated
// drop  = can be discarded without explicit destruction
```

### Global Storage
```move
// Store data on-chain
move_to(account, MyData { value: 42 });

// Read data from an address
let data = borrow_global<MyData>(address);

// Modify data
let data = borrow_global_mut<MyData>(address);
data.value = 100;

// Remove data
let MyData { value: _ } = move_from<MyData>(address);
```

### Data Types
```move
// Unsigned integers
let a: u8 = 255;
let b: u64 = 1000000;
let c: u128 = 999999999999;

// Boolean
let flag: bool = true;

// Address
let addr: address = @0xcafe;

// Vector (dynamic list)
let v: vector<u64> = vector::empty();
vector::push_back(&mut v, 10);
```

### Functions
```move
// Public entry function (callable from transactions)
public entry fun my_function(account: &signer, value: u64) { ... }

// Public function (callable from other modules)
public fun helper(): u64 { 42 }

// Private function
fun internal_helper() { ... }

// Pass by value vs reference
fun by_value(x: u64): u64 { x }
fun by_ref(x: &u64): u64 { *x }
fun by_mut_ref(x: &mut u64) { *x = *x + 1; }
```

### Events
```move
use supra_framework::event;

#[event]
struct MyEvent has drop, store {
    value: u64,
    user: address,
}

// Emit an event
event::emit(MyEvent { value: 100, user: @0xcafe });
```

---

## TypeScript SDK

### Install
```bash
npm install supra-l1-sdk
```

### Basic Usage
```typescript
import { HexString, SupraAccount, SupraClient, BCS } from "supra-l1-sdk";

// Connect to testnet
const client = await SupraClient.init("https://rpc-testnet.supra.com/");

// Load account from private key
const account = new SupraAccount(
  Uint8Array.from(Buffer.from("YOUR_PRIVATE_KEY_HEX", "hex"))
);

// Fund from faucet (testnet only)
await client.fundAccountWithFaucet(account.address());

// Transfer SupraCoin
const txRes = await client.transferSupraCoin(
  account,
  new HexString("RECEIVER_ADDRESS"),
  BigInt(1000000),
  { enableTransactionWaitAndSimulationArgs: { enableWaitForTransaction: true } }
);
```

---

## Network Info

| Network | RPC URL |
|---|---|
| Testnet | https://rpc-testnet.supra.com |
| Mainnet | https://rpc-mainnet.supra.com |

- Explorer: https://suprascan.io
- Wallet: StarKey (https://starkey.app)

---

## Supra Native Features (Unique to Supra)

### 1. dVRF — On-chain Randomness
Add to Move.toml:
```toml
[dependencies.SupraVrf]
git = "https://github.com/Entropy-Foundation/vrf-interface"
```

### 2. Native Oracles — Price Feeds
Access real-time price data directly in contracts.
Docs: https://docs.supra.com/oracles/data-feeds/push-oracle

### 3. Automation
Schedule smart contract calls without external keepers.
Docs: https://docs.supra.com/automation

### 4. SupraNova Bridge
Cross-chain asset transfers.
Docs: https://docs.supra.com/supranova

---

## SupraCoin Transfer (Move)

```move
use supra_framework::supra_coin::SupraCoin;
use supra_framework::coin;

// Transfer SupraCoin between accounts
public entry fun send_supra(sender: &signer, recipient: address, amount: u64) {
    coin::transfer<SupraCoin>(sender, recipient, amount);
}

// Check balance
#[view]
public fun get_supra_balance(addr: address): u64 {
    coin::balance<SupraCoin>(addr)
}
```

---

## Common Patterns

### Initialize a module (called once)
```move
public entry fun initialize(admin: &signer) {
    assert!(!exists<Config>(@my_module), 1); // prevent re-init
    move_to(admin, Config { value: 0 });
}
```

### Error handling with assert
```move
const E_NOT_AUTHORIZED: u64 = 1;
const E_ALREADY_EXISTS: u64 = 2;

assert!(signer::address_of(caller) == @admin, E_NOT_AUTHORIZED);
assert!(!exists<MyData>(addr), E_ALREADY_EXISTS);
```

---

## Reference Links
- Supra Docs: https://docs.supra.com
- Supra Framework Source: https://github.com/Entropy-Foundation/aptos-core/tree/dev/aptos-move/framework/supra-framework
- TypeScript SDK: https://github.com/Entropy-Foundation/supra-l1-sdk
- SDK Docs: https://sdk-docs.supra.com
- Dev Hub: https://github.com/supra-labs/supra-dev-hub
- SupraScan Explorer: https://suprascan.io
