# Supra Move Development Skill

> **You are an expert Supra blockchain Move developer.**
> Supra is a high-performance Layer 1 blockchain with MoveVM + EVM. This skill covers MoveVM only.
> For EVM/Solidity on Supra: https://docs.supra.com/network/evm/

---

## ⚠️ CRITICAL: Move.toml rev = "dev" Warning

> **READ THIS FIRST.** The SupraFramework dependency uses `rev = "dev"`, which tracks the live development branch and can break builds without notice. **Always pin to a specific commit hash for any production deployment.**

```toml
# PRODUCTION — pin to a specific commit
[dependencies.SupraFramework]
git = "https://github.com/Entropy-Foundation/aptos-core.git"
rev = "SPECIFIC_COMMIT_HASH_HERE"
subdir = "aptos-move/framework/supra-framework"

# DEVELOPMENT — live branch, may break
[dependencies.SupraFramework]
git = "https://github.com/Entropy-Foundation/aptos-core.git"
rev = "dev"
subdir = "aptos-move/framework/supra-framework"
```

---

## ⚠️ CRITICAL: Always Use supra_framework

```move
// WRONG — will not compile on Supra
use aptos_framework::account;
use aptos_framework::coin;

// CORRECT — always use supra_framework
use supra_framework::account;
use supra_framework::coin;
```

---

## SKILL VERSION

- Version: 2.0.0
- Last Reviewed: April 2026
- Tested Against: Supra CLI (latest)
- Framework: supra_framework (rev = "dev")

---

## SECTION: SETUP

### Prerequisites
- Docker Desktop installed and running
- All Supra CLI commands run inside a Docker container

### Install Supra CLI
```bash
# Pull and start the container
cd Documents
curl https://raw.githubusercontent.com/supra-labs/supra-dev-hub/refs/heads/main/Scripts/cli/compose.yaml | docker compose -f - up -d

# Enter the container shell
docker exec -it supra_cli /bin/bash

# Verify
supra --help
```

---

## SECTION: MOVE.TOML TEMPLATE

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
rev = "dev"   # ⚠️ pin to a commit hash for production
subdir = "aptos-move/framework/supra-framework"

[dev-dependencies]
```

For dVRF, also add:
```toml
# Testnet
[dependencies.SupraVrf]
git = "https://github.com/Entropy-Foundation/vrf-interface"
subdir = "supra/testnet"
rev = "master"

# Mainnet
[dependencies.SupraVrf]
git = "https://github.com/Entropy-Foundation/vrf-interface"
subdir = "supra/mainnet"
rev = "master"
```

---

## SECTION: KEY CLI COMMANDS

```bash
# Create a new Move package
supra move tool init --package-dir /supra/move_workspace/myProject --name myProject

# Compile
supra move tool compile --package-dir /supra/move_workspace/myProject

# Run tests
supra move tool test --package-dir /supra/move_workspace/myProject

# Generate key / account
supra key generate --key-type ed25519 --profile myAccount

# Activate profile
supra key activate-profile myAccount

# Fund from testnet faucet
supra move account fund-with-faucet --rpc-url https://rpc-testnet.supra.com

# Publish to testnet
supra move tool publish --package-dir /supra/move_workspace/myProject --rpc-url https://rpc-testnet.supra.com

# Publish upgrade (backward-compatible changes only)
supra move tool publish --package-dir /supra/move_workspace/myProject --rpc-url https://rpc-testnet.supra.com --upgrade-policy compatible

# Call an entry function
supra move tool run \
  --function-id 'my_module::counter::increment' \
  --rpc-url https://rpc-testnet.supra.com

# Call with arguments
supra move tool run \
  --function-id 'my_module::registry::register' \
  --args address:0xcafe u64:100 "string:hello" \
  --rpc-url https://rpc-testnet.supra.com

# Read a view function
supra move tool view \
  --function-id 'my_module::counter::get_value' \
  --args address:0xcafe \
  --rpc-url https://rpc-testnet.supra.com

# List profiles
supra profile -l
```

---

## SECTION: MOVE LANGUAGE FUNDAMENTALS

### Module Structure

```move
// Format: module <address>::<module_name>
module my_module::hello {
    use supra_framework::account;
    use supra_framework::event;
    use supra_framework::supra_coin::SupraCoin;

    // All on-chain data must be in a struct with `key`
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

### Struct Abilities

```move
struct MyStruct has key, store, copy, drop { ... }
// key   = stored in global storage (on-chain)
// store = can be nested inside other structs
// copy  = can be duplicated
// drop  = can be discarded without explicit destruction
```

### Global Storage

```move
// Write to blockchain (at signer's address)
move_to(account, MyData { value: 42 });

// Read (immutable)
let data = borrow_global<MyData>(address);

// Read (mutable)
let data = borrow_global_mut<MyData>(address);
data.value = 100;

// Check existence
if (exists<MyData>(some_address)) { ... }

// Remove
let MyData { value: _ } = move_from<MyData>(address);
```

### Function Types

```move
// Entry — callable from transactions
public entry fun my_function(account: &signer, value: u64) { ... }

// Public — callable from other modules
public fun helper(): u64 { 42 }

// Private — internal only
fun internal() { ... }

// View — read-only, queryable off-chain without a transaction
#[view]
public fun get_value(addr: address): u64 acquires MyData {
    borrow_global<MyData>(addr).value
}
```

Note: Any function reading global storage must declare `acquires ResourceName`.

### Data Types

```move
let a: u8 = 255;
let b: u64 = 1000000;
let c: u128 = 999999999999;
let flag: bool = true;
let addr: address = @0xcafe;
let v: vector<u64> = vector::empty();
```

### Events

```move
use supra_framework::event;

#[event]
struct MyEvent has drop, store {
    value: u64,
    user: address,
}

event::emit(MyEvent { value: 100, user: @0xcafe });
```

---

## SECTION: DATA STRUCTURES

### vector — Use for Small Ordered Lists Only

```move
use std::vector;

let v: vector<u64> = vector::empty();
vector::push_back(&mut v, 10);
vector::push_back(&mut v, 20);
let len = vector::length(&v);           // 2
let first = *vector::borrow(&v, 0);    // 10
let has_ten = vector::contains(&v, &10u64);
vector::pop_back(&mut v);              // removes last
```

**Warning:** vector lookup is O(n). For collections > ~100 entries, use SmartTable.

### SmartTable — Scalable Key-Value Storage (Recommended)

```move
use aptos_std::smart_table::{Self, SmartTable};

struct Store has key {
    data: SmartTable<address, u64>,  // O(1) access, gas stays flat
}

// Initialize
smart_table::new<address, u64>()

// Insert
smart_table::add(&mut store.data, key, value);

// Read
let val = smart_table::borrow(&store.data, key);

// Update
let val_mut = smart_table::borrow_mut(&mut store.data, key);
*val_mut = 999;

// Check existence
smart_table::contains(&store.data, key)

// Remove
smart_table::remove(&mut store.data, key);

// Destroy (required before dropping the struct)
smart_table::drop(store.data);
```

### Table — Simple Key-Value (use when you need Table-specific semantics)

```move
use aptos_std::table::{Self, Table};

let t: Table<u64, address> = table::new();
table::add(&mut t, 1u64, @0xcafe);
let val = table::borrow(&t, 1u64);
assert!(table::contains(&t, 1u64), 1);
table::remove(&mut t, 1u64);
```

---

## SECTION: SUPRA SPECIFICS

### Framework Mapping

| Concept | Aptos | Supra |
|---|---|---|
| Framework prefix | `aptos_framework::` | `supra_framework::` |
| Native coin | `AptosCoin` | `SupraCoin` |
| Coin module | `aptos_coin::` | `supra_coin::` |
| Governance | `aptos_framework::governance` | `supra_framework::supra_governance` |
| Randomness | External/manual | Native dVRF built-in |

### SupraCoin Operations

```move
use supra_framework::supra_coin::SupraCoin;
use supra_framework::coin;

// Transfer
public entry fun send_supra(sender: &signer, recipient: address, amount: u64) {
    coin::transfer<SupraCoin>(sender, recipient, amount);
}

// Balance
#[view]
public fun get_balance(addr: address): u64 {
    coin::balance<SupraCoin>(addr)
}
```

SupraCoin units: 1 SUPRA = 100,000,000 Quants (8 decimals).

### Fungible Assets (FA) — Mainnet Note

The FA migration is **disabled on Mainnet**. For custom fungible tokens on Mainnet, use the `coin_wrapper`:
```
https://github.com/Entropy-Foundation/aptos-core/blob/dev/aptos-move/move-examples/swap/sources/coin_wrapper.move
```

The FA standard (`supra_framework::fungible_asset`) works normally on Testnet.

---

## SECTION: COMMON PATTERNS

### Initialize Once (admin pattern)

```move
const E_ALREADY_INITIALIZED: u64 = 1;
const E_NOT_ADMIN: u64 = 2;

public entry fun initialize(admin: &signer) {
    assert!(!exists<Config>(@my_module), E_ALREADY_INITIALIZED);
    move_to(admin, Config { admin: signer::address_of(admin), value: 0 });
}
```

### Access Control

```move
use supra_framework::signer;

public entry fun admin_action(caller: &signer) acquires Config {
    let config = borrow_global<Config>(@my_module);
    assert!(signer::address_of(caller) == config.admin, E_NOT_ADMIN);
    // proceed...
}
```

### Error Handling

```move
// Named constants — never use raw integers in assert!
const E_NOT_ADMIN: u64 = 1;
const E_ALREADY_EXISTS: u64 = 2;
const E_NOT_FOUND: u64 = 3;
const E_NOT_INITIALIZED: u64 = 4;
const E_INSUFFICIENT_BALANCE: u64 = 5;

assert!(condition, E_NOT_ADMIN);
```

### auto init_module (runs on first publish)

```move
/// Called automatically when the module is published — no transaction needed.
fun init_module(deployer: &signer) {
    move_to(deployer, Config {
        admin: signer::address_of(deployer),
        value: 0,
    });
}
```

### Resource Accounts (SignerCapability)

Resource accounts let contracts sign transactions autonomously — essential for vaults, pools, DAOs.

```move
use supra_framework::account::{Self, SignerCapability};

struct VaultConfig has key {
    admin: address,
    resource_cap: SignerCapability,
    resource_addr: address,
}

public entry fun initialize(admin: &signer, seed: vector<u8>) {
    // Create resource account — address is derived from admin + seed
    let (resource_signer, resource_cap) = account::create_resource_account(admin, seed);
    let resource_addr = signer::address_of(&resource_signer);

    // Set up resource account (e.g. register coins)
    coin::register<SupraCoin>(&resource_signer);

    // Store capability — never expose it publicly
    move_to(admin, VaultConfig {
        admin: signer::address_of(admin),
        resource_cap,
        resource_addr,
    });
}

public entry fun vault_withdraw(admin: &signer, to: address, amount: u64) acquires VaultConfig {
    let config = borrow_global<VaultConfig>(signer::address_of(admin));
    assert!(config.admin == signer::address_of(admin), E_NOT_ADMIN);

    // Produce vault signer on-demand — no human key needed
    let vault_signer = account::create_signer_with_capability(&config.resource_cap);
    coin::transfer<SupraCoin>(&vault_signer, to, amount);
}
```

See `references/resource_accounts.md` for full patterns: DAO treasury, escrow, NFT minting contracts.

### Custom Token (Coin standard)

```move
use supra_framework::coin::{Self, BurnCapability, FreezeCapability, MintCapability};

struct MyToken {}

struct TokenCapabilities has key {
    burn_cap: BurnCapability<MyToken>,
    freeze_cap: FreezeCapability<MyToken>,
    mint_cap: MintCapability<MyToken>,
}

public entry fun initialize(admin: &signer) {
    let (burn_cap, freeze_cap, mint_cap) = coin::initialize<MyToken>(
        admin,
        string::utf8(b"My Token"),
        string::utf8(b"MTK"),
        8,    // decimals
        true, // monitor supply
    );
    move_to(admin, TokenCapabilities { burn_cap, freeze_cap, mint_cap });
}

public entry fun mint(admin: &signer, recipient: address, amount: u64) acquires TokenCapabilities {
    let caps = borrow_global<TokenCapabilities>(signer::address_of(admin));
    let coins = coin::mint<MyToken>(amount, &caps.mint_cap);
    coin::deposit<MyToken>(recipient, coins);
}
```

See `scripts/token_contract.move` for the full example.

---

## SECTION: NATIVE FEATURES

### dVRF — On-Chain Verifiable Randomness

dVRF uses a **request → callback** pattern. You call `rng_request`, Supra calls your `distribute` function back with the verified random numbers.

**Requires whitelisting:** https://forms.gle/WFvpBXg67GmDrokv5

```move
module my_module::lottery {
    use aptos_std::table;
    use supra_addr::supra_vrf;
    use std::string;

    struct RandomNumberList has key {
        random_numbers: table::Table<u64, vector<u256>>,
    }

    fun init_module(sender: &signer) {
        move_to(sender, RandomNumberList { random_numbers: table::new() });
    }

    // Step 1: Request randomness
    public entry fun rng_request(
        sender: &signer,
        rng_count: u8,         // how many random numbers (max 255)
        client_seed: u64,      // extra entropy, 0 is fine
        num_confirmations: u64,
    ) acquires RandomNumberList {
        let nonce = supra_vrf::rng_request(
            sender,
            @my_module,
            string::utf8(b"lottery"),
            string::utf8(b"distribute"),
            rng_count, client_seed, num_confirmations,
        );
        let list = borrow_global_mut<RandomNumberList>(@my_module);
        table::add(&mut list.random_numbers, nonce, vector[]);
    }

    // Step 2: Supra calls this automatically with verified random numbers
    // Signature must match exactly — 6 parameters in this order
    public entry fun distribute(
        nonce: u64,
        message: vector<u8>,
        signature: vector<u8>,
        caller_address: address,
        rng_count: u8,
        client_seed: u64,
    ) acquires RandomNumberList {
        let verified_nums: vector<u256> = supra_vrf::verify_callback(
            nonce, message, signature, caller_address, rng_count, client_seed,
        );
        let list = borrow_global_mut<RandomNumberList>(@my_module);
        let slot = table::borrow_mut(&mut list.random_numbers, nonce);
        *slot = verified_nums;
    }
}
```

CLI:
```bash
supra move tool run \
  --function-id 'my_module::lottery::rng_request' \
  --args u8:1 u64:0 u64:1 \
  --rpc-url https://rpc-testnet.supra.com
```

Docs: https://docs.supra.com/dvrf/build-supra-l1/v2-guide

### Oracles — Real-Time Price Feeds

```move
module my_module::price_reader {
    use supra_oracle::oracle;

    // Returns (price: u128, decimal: u8, timestamp: u64)
    // Pair index 0 = BTC/USDT — verify indices at oracle docs
    #[view]
    public fun get_btc_price(): u128 {
        let (price, _decimal, _timestamp) = oracle::get_price(0);
        price
    }

    public entry fun price_gated_action(
        sender: &signer,
        min_price: u128,
    ) {
        let (price, _, _) = oracle::get_price(0); // BTC/USDT
        assert!(price >= min_price, 1);
        // proceed only if BTC is above threshold
    }
}
```

Pair indices: https://docs.supra.com/oracles/data-feeds/push-oracle

### Automation — Schedule Contract Calls

Write a condition-aware entry function, then register it with Supra Automation. Validators execute it automatically — no bots or keepers needed.

```move
module my_module::auto_tasks {
    use supra_framework::supra_coin::SupraCoin;
    use supra_framework::coin;
    use supra_framework::signer;

    /// Auto top-up: refill wallet when balance drops below threshold.
    /// Condition check is INSIDE the function — exits cleanly if not triggered.
    public entry fun auto_top_up(
        source: &signer,
        user: address,
        min_balance: u64,
        top_up_amount: u64,
    ) {
        let current = coin::balance<SupraCoin>(user);
        if (current < min_balance) {
            coin::transfer<SupraCoin>(source, user, top_up_amount);
        }
        // No abort if condition is false — exits cleanly
    }
}
```

Register via CLI:
```bash
supra move tool run \
  --function-id 'supra_automation::automation_registry::register_task' \
  --args \
    string:'my_module::auto_tasks::auto_top_up' \
    address:<USER_ADDRESS> \
    u64:<MIN_BALANCE> \
    u64:<TOP_UP_AMOUNT> \
    u64:<MAX_GAS_AMOUNT> \
    u64:<GAS_PRICE_CAP> \
    u64:<AUTOMATION_FEE_CAP> \
    u64:<EXPIRY_TIME_UNIX> \
  --rpc-url https://rpc-testnet.supra.com
```

Docs: https://docs.supra.com/automation/smart-contract-integration

---

## SECTION: SDK

See `references/sdk_guide.md` for complete SDK reference.

### TypeScript — Quick Contract Call

```typescript
import { HexString, SupraAccount, SupraClient, BCS, TxnBuilderTypes } from "supra-l1-sdk";

const client = await SupraClient.init("https://rpc-testnet.supra.com/");
const account = new SupraAccount(Uint8Array.from(Buffer.from("PRIVATE_KEY_HEX", "hex")));

// Call: public entry fun register(admin: &signer, member: address, score: u64)
await client.invokeContractFunction(
  account,
  "0xYOUR_CONTRACT_ADDRESS",
  "registry",
  "register",
  [],   // type args
  [
    BCS.bcsToBytes(TxnBuilderTypes.AccountAddress.fromHex("0xbeef")), // address
    BCS.bcsSerializeUint64(BigInt(100)),                               // u64
  ],
  { enableTransactionWaitAndSimulationArgs: { enableWaitForTransaction: true } }
);
```

**BCS encoding reference:**

| Move type | TypeScript |
|---|---|
| `address` | `BCS.bcsToBytes(TxnBuilderTypes.AccountAddress.fromHex("0x..."))` |
| `u8` | `BCS.bcsSerializeU8(42)` |
| `u64` | `BCS.bcsSerializeUint64(BigInt(1000))` |
| `u128` | `BCS.bcsSerializeU128(BigInt("999"))` |
| `bool` | `BCS.bcsSerializeBool(true)` |
| `vector<u8>` / string | `BCS.bcsSerializeBytes(Buffer.from("text"))` |

---

## SECTION: TESTING

```bash
# Run all tests
supra move tool test --package-dir /supra/move_workspace/myProject

# Run specific test
supra move tool test --package-dir /supra/move_workspace/myProject --filter test_initialize
```

```move
#[test_only]
module my_module::counter_tests {
    use my_module::counter;
    use supra_framework::account;

    #[test(admin = @0xCAFE)]
    public fun test_initialize(admin: signer) {
        account::create_account_for_test(std::signer::address_of(&admin));
        counter::initialize(&admin);
        assert!(counter::get_value(std::signer::address_of(&admin)) == 0, 0);
    }

    #[test(admin = @0xCAFE)]
    #[expected_failure(abort_code = 2)]
    public fun test_double_init_fails(admin: signer) {
        account::create_account_for_test(std::signer::address_of(&admin));
        counter::initialize(&admin);
        counter::initialize(&admin); // should abort with code 2
    }

    #[test(user1 = @0xCAFE, user2 = @0xBEEF)]
    public fun test_two_users(user1: signer, user2: signer) {
        account::create_account_for_test(std::signer::address_of(&user1));
        account::create_account_for_test(std::signer::address_of(&user2));
        counter::initialize(&user1);
        counter::initialize(&user2);
        counter::increment_by(&user1, 5);
        counter::increment_by(&user2, 10);
        assert!(counter::get_value(std::signer::address_of(&user1)) == 5, 0);
        assert!(counter::get_value(std::signer::address_of(&user2)) == 10, 1);
    }
}
```

See `scripts/test_examples.move` for the full test suite.

---

## SECTION: UPGRADE / MIGRATION

Move contracts are **immutable once published**. Three upgrade strategies:

**1. Compatible upgrade** (add functions/structs, no removals):
```bash
supra move tool publish --upgrade-policy compatible --rpc-url https://rpc-testnet.supra.com
```

**2. New module address + state migration** (for breaking changes):
Deploy a new module at a new address. Write a one-time `migrate` entry function that reads old state and writes to new resource types.

**3. Resource account proxy** (future-proof from day one):
Store state in a resource account. Logic module can be swapped by updating the proxy's `logic_module` address field.

See `references/patterns.md` for full upgrade code examples.

---

## SECTION: NETWORK & REFERENCES

| Network | RPC URL |
|---|---|
| Testnet | https://rpc-testnet.supra.com |
| Mainnet | https://rpc-mainnet.supra.com |

- Explorer: https://suprascan.io
- Wallet: StarKey — https://starkey.app
- Supra Docs: https://docs.supra.com
- Framework Source: https://github.com/Entropy-Foundation/aptos-core/tree/dev/aptos-move/framework/supra-framework
- TypeScript SDK: https://github.com/Entropy-Foundation/supra-l1-sdk
- SDK Docs: https://sdk-docs.supra.com
- Dev Hub: https://github.com/supra-labs/supra-dev-hub

## Reference Files in This Skill

| File | Contents |
|---|---|
| `references/core_topics.md` | Move fundamentals deep-dive |
| `references/supra_vs_aptos.md` | Migration cheatsheet from Aptos |
| `references/native_features.md` | dVRF, Oracles, Automation — full code |
| `references/sdk_guide.md` | TypeScript + Python SDK with BCS encoding |
| `references/resource_accounts.md` | SignerCapability, vault, DAO patterns |
| `references/patterns.md` | SmartTable, upgrade, multi-signer, gas |
| `references/object_model.md` | Supra object model |
| `scripts/example_contract.move` | Counter — basic module template |
| `scripts/token_contract.move` | Custom coin (mint/burn/transfer) |
| `scripts/events_example.move` | Events + vector registry pattern |
| `scripts/advanced_examples.move` | Admin, pausable, NFT (Table), timelock |
| `scripts/test_examples.move` | Full unit test suite patterns |
| `scripts/deploy.sh` | Compile + publish automation |
| `scripts/version_check.sh` | CLI version check |
