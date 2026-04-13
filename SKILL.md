---
name: Supra Move Development
description: Expert guidance for building on the Supra blockchain using Move - contracts, SDK integration, dVRF, Oracles, and Automation.
version: 2.5.0
---

# Supra Move Development Skill

> **You are an expert Supra blockchain Move developer.**
> Supra is a high-performance Layer 1 blockchain with MoveVM + EVM. This skill covers MoveVM only.
> For EVM/Solidity on Supra: https://docs.supra.com/network/evm/

---

## COMPILER RULES - APPLY TO EVERY FILE YOU WRITE

These four rules cause compile errors on every single contract. They are not edge cases. Apply them before writing any code.

---

### RULE 1 - No `///` comments in your contract code. Use `//` only.

When the Supra CLI compiles your Move source, `///` causes a compile error. Use `//` for all comments in files you write.

```move
// WRONG - compile error when compiled with Supra CLI
/// This module does X
/// param: the value

// CORRECT
// This module does X
// param: the value
```

**Note:** You may see `///` in Supra framework source files (e.g. dora-interface oracle files). Those are pre-compiled native modules — they are not passed through the CLI compiler. The ban applies only to `.move` files in your own project's `sources/` directory.

---

### RULE 2 - ASCII only. No Unicode anywhere in source files.

Move only allows ASCII characters (0x20-0x7E). Non-ASCII kills the build **even inside comments**. This includes emoji, symbols, and typographic punctuation.

```
error[E01001]: invalid character
  | // SmartTable used for O(1) lookup — gas stays flat
  |                                    ^ Invalid character '—'

error[E01001]: invalid character
  | // ✅ Caller is whitelisted
  |    ^^ Invalid character '✅'
```

Characters that will always break compilation:

| You might write | Unicode | Use this instead |
|---|---|---|
| `--` (em dash) | U+2014 | `--` |
| `-` (en dash) | U+2013 | `-` |
| `---` (box drawing) | U+2500 | `-` |
| `~=` (almost equal) | U+2248 | `~=` |
| `->` (arrow) | U+2192 | `->` |
| `'` `'` (curly quotes) | U+2018/19 | `'` |
| `"` `"` (curly double quotes) | U+201C/D | `"` |
| `✅` `❌` `⚠️` and any emoji | various | write it out in words |

**Do not use emoji or symbols in comments.** Write `// OK: caller is whitelisted` not `// ✅ caller is whitelisted`. Write `// WARNING:` not `// ⚠️`. No exceptions.

---

### RULE 3 - Type casts: ALWAYS `(expr as T)`. Parens are required.

The Move cast syntax is `(exp as type)`. The parentheses are not optional - they are part of the syntax. Writing `expr as T` without the wrapping parens is always a compile error.

```
error[E01002]: unexpected token
  | let x = (some_expr) as u64;
  |                      ^^ Unexpected 'as'
```

```move
// WRONG - every one of these is a compile error
let a = value as u64;
let b = my_struct.field as u128;
let c = (complex_expr) as u64;
let d = ((a as u128) * b) as u64;

// CORRECT - the entire cast is wrapped in parens
let a = (value as u64);
let b = (my_struct.field as u128);
let c = ((complex_expr) as u64);
let d = (((a as u128) * b) as u64);
```

**Mnemonic:** count your parens. If `as` appears, the IMMEDIATELY enclosing `(` must open right before `expr` and the matching `)` must come after `T`. There must be nothing outside `(expr as T)` except operators or `;`.

---

### RULE 4 - `acquires` list must be exact.

Every function that reads global storage must declare `acquires`. The rules:

1. **Missing = compile error** (`error[E04020]: missing acquires annotation`)
2. **Extra (unused) = compile error** (`error[E02002]: unnecessary or extraneous item`)
3. **Transitive** - if your function calls a helper that acquires `Foo`, YOUR function must also list `Foo`

```move
// Helper acquires ResourceA
fun helper() acquires ResourceA { borrow_global<ResourceA>(@addr); }

// Caller MUST list ResourceA because it calls helper()
public entry fun do_thing() acquires ResourceB, ResourceA {
    let _ = borrow_global<ResourceB>(@addr);  // direct
    helper();                                  // transitive - ResourceA required
}

// WRONG - ResourceA missing (transitive), ResourceC listed but never used
public entry fun do_thing() acquires ResourceB, ResourceC { ... }
```

---

## -- CRITICAL: Move.toml rev = "dev" Warning

> **READ THIS FIRST.** The SupraFramework dependency uses `rev = "dev"`, which tracks the live development branch and can break builds without notice. **Always pin to a specific commit hash for any production deployment.**

```toml
# PRODUCTION - pin to a specific commit
[dependencies.SupraFramework]
git = "https://github.com/Entropy-Foundation/aptos-core.git"
rev = "SPECIFIC_COMMIT_HASH_HERE"
subdir = "aptos-move/framework/supra-framework"

# DEVELOPMENT - live branch, may break
[dependencies.SupraFramework]
git = "https://github.com/Entropy-Foundation/aptos-core.git"
rev = "dev"
subdir = "aptos-move/framework/supra-framework"
```

To find a stable commit hash: browse the commit history at
https://github.com/Entropy-Foundation/aptos-core/commits/dev
or run `git log --oneline -20` inside the Supra CLI container after pulling the latest image.

---

## -- CRITICAL: Always Use supra_framework

```move
// WRONG - will not compile on Supra
use aptos_framework::account;
use aptos_framework::coin;

// CORRECT - always use supra_framework
use supra_framework::account;
use supra_framework::coin;
```

## -- CRITICAL: aptos_std Exception - Do NOT Rename

`aptos_std` types (`SmartTable`, `Table`, `type_info`, etc.) **keep their `aptos_std::` prefix on Supra**. Do not change these to `supra_std::` or `supra_framework::` - those paths do not exist and will fail to compile.

```move
// CORRECT - keep aptos_std for these
use aptos_std::smart_table::{Self, SmartTable};
use aptos_std::table::{Self, Table};
use aptos_std::type_info;

// WRONG - do not rename aptos_std
use supra_std::smart_table::SmartTable;       // compile error
use supra_framework::smart_table::SmartTable; // compile error
```

The rule "replace aptos_ with supra_" applies **only to `aptos_framework::`**. The `aptos_std::` standard library is shared and unchanged.

---

## SKILL VERSION

- Version: 2.5.0
- Last Updated: See CHANGELOG.md
- Tested Against: Supra CLI (latest)
- Framework: supra_framework (pin rev for production - see warning above)

---

## SECTION: SETUP

### Prerequisites
- Docker Desktop installed and running
- All Supra CLI commands run inside a Docker container

### Install Supra CLI
```bash
# Pull and start the container
# -- Verify this URL is the current canonical install source before running:
# https://docs.supra.com - the compose.yaml may move to Entropy-Foundation org
cd Documents
curl https://raw.githubusercontent.com/supra-labs/supra-dev-hub/refs/heads/main/Scripts/cli/compose.yaml | docker compose -f - up -d

# Enter the container shell - ALL supra CLI commands must run from here
docker exec -it supra_cli /bin/bash

# Verify
supra --help
```

> -- **Important:** All `supra` CLI commands (compile, publish, run, etc.) only work **inside the Docker container**. Scripts like `deploy.sh` must be run from within the container shell, not from your host terminal.

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
rev = "dev"   # -- pin to a commit hash for production
subdir = "aptos-move/framework/supra-framework"

# Required for Digital Asset NFTs (aptos_token_objects::collection / token)
[dependencies.AptosTokenObjects]
git = "https://github.com/Entropy-Foundation/aptos-core.git"
subdir = "aptos-move/framework/aptos-token-objects"
rev = "dev"   # -- pin to a commit hash for production

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

> **Account activation:** An account does not exist on-chain until it receives funds. Always run `fund-with-faucet` before trying to publish or call contracts - otherwise you'll get an "account not found" error. The faucet call both creates and funds the account in one step.

> **`--profile` flag:** The Supra CLI needs to know which account is signing each transaction. Pass `--profile <name>` to any `publish`, `run`, or `view` command that requires a signer. If you omit it, the CLI uses whichever profile is currently active.

```bash
# -- Setup -------------------------------------------------------

# Create a new Move package
supra move tool init --package-dir /supra/move_workspace/myProject --name myProject

# Compile
supra move tool compile --package-dir /supra/move_workspace/myProject

# Run tests
supra move tool test --package-dir /supra/move_workspace/myProject

# -- Account management -----------------------------------------

# Generate key / account (creates the profile)
supra key generate --key-type ed25519 --profile myAccount

# Fund from testnet faucet (ALSO creates the account on-chain)
supra move account fund-with-faucet --profile myAccount --rpc-url https://rpc-testnet.supra.com

# List profiles
supra profile list

# -- Deploy -----------------------------------------------------

# Publish to testnet (--profile specifies the signer)
supra move tool publish \
  --package-dir /supra/move_workspace/myProject \
  --profile myAccount \
  --rpc-url https://rpc-testnet.supra.com

# Publish upgrade (backward-compatible changes only)
supra move tool publish \
  --package-dir /supra/move_workspace/myProject \
  --profile myAccount \
  --rpc-url https://rpc-testnet.supra.com \
  --upgrade-policy compatible

# -- Interact ---------------------------------------------------

# Call an entry function
supra move tool run \
  --function-id 'my_module::counter::increment' \
  --profile myAccount \
  --rpc-url https://rpc-testnet.supra.com

# Call with arguments
supra move tool run \
  --function-id 'my_module::registry::register' \
  --args address:0xcafe u64:100 "string:hello" \
  --profile myAccount \
  --rpc-url https://rpc-testnet.supra.com

# Read a view function (no --profile needed - read-only)
supra move tool view \
  --function-id 'my_module::counter::get_value' \
  --args address:0xcafe \
  --rpc-url https://rpc-testnet.supra.com
```

---

## SECTION: MOVE LANGUAGE FUNDAMENTALS

### Common Imports

```move
use std::signer;                           // signer::address_of
use std::string::{Self, String};           // string::utf8(b"..."), String type
use std::vector;                           // vector::push_back, borrow, length
use std::option::{Self, Option};           // option::none(), option::some(v)
use supra_framework::event;               // event::emit
use supra_framework::timestamp;           // timestamp::now_seconds
use supra_framework::object::{Self, Object}; // DA NFTs
use aptos_std::table::{Self, Table};      // O(1) key-value storage
use aptos_std::smart_table::{Self, SmartTable}; // iterable key-value storage
```

> **`string::utf8` requires an import.** Always add `use std::string::{Self, String}` when using `string::utf8(b"...")`. Fully-qualified paths (`std::string::utf8(...)`) compile but are inconsistent - use the import form.

---

### Comments

> See RULE 1 at the top of this file. Use `//` only. Never `///`.

---

### ASCII-only source files

> See RULE 2 at the top of this file. No Unicode characters anywhere in .move files.

---

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
// Entry - callable from transactions
public entry fun my_function(account: &signer, value: u64) { ... }

// Public - callable from other modules
public fun helper(): u64 { 42 }

// Private - internal only
fun internal() { ... }

// View - read-only, queryable off-chain without a transaction
#[view]
public fun get_value(addr: address): u64 acquires MyData {
    borrow_global<MyData>(addr).value
}
```

> See RULE 4 at the top of this file. `acquires` must be exact and transitive.

### Data Types

```move
let a: u8   = 255;
let b: u16  = 65535;
let c: u32  = 4294967295;
let d: u64  = 1000000;
let e: u128 = 999999999999;
let f: u256 = 0xdeadbeef;    // used by dVRF callbacks
let flag: bool = true;
let addr: address = @0xcafe;
let v: vector<u64> = vector::empty();
```

> See RULE 3 at the top of this file. Every cast is `(expr as T)` — parens required, no exceptions.

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

### vector - Use for Small Ordered Lists Only

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

### SmartTable - Scalable Key-Value Storage (Recommended)

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

// Count entries - use the built-in, do NOT maintain a manual counter
smart_table::length(&store.data)

// Destroy (required before dropping the struct)
smart_table::drop(store.data);
```

**Do not store counts as separate struct fields.** `SmartTable` and `Table` expose `length()` natively. A manual `member_count: u64` field alongside a `SmartTable` is always wrong — it adds gas overhead, creates a desync bug whenever you forget to update it, and provides no benefit.

```move
// WRONG - manual counter duplicates what the table already knows
struct Whitelist has key {
    members: SmartTable<address, bool>,
    member_count: u64,   // will drift out of sync; remove this
}

// CORRECT - query the table directly
struct Whitelist has key {
    members: SmartTable<address, bool>,
}

// Get the count anywhere you need it
let count = smart_table::length(&whitelist.members);
```

Apply the same principle to any collection type: `vector::length(&v)`, `table::length(&t)`. Only store derived values in state when computing them on-demand would be prohibitively expensive (e.g., a running sum across unbounded history). A simple count is never that case.

### Table - Simple Key-Value (use when you need Table-specific semantics)

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

### Fungible Assets (FA)

The FA standard (`supra_framework::fungible_asset`) is enabled on both Testnet and Mainnet. You can use it directly for custom fungible tokens. See `scripts/token_contract.move` for the coin-standard approach if you need the legacy `supra_framework::coin` pattern.

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
use std::signer;

public entry fun admin_action(caller: &signer) acquires Config {
    let config = borrow_global<Config>(@my_module);
    assert!(signer::address_of(caller) == config.admin, E_NOT_ADMIN);
    // proceed...
}
```

### Error Handling

Every error constant must have a `//` comment explaining what it means. This is not optional - it is the primary documentation for why a transaction was aborted.

```move
// WRONG - bare constants with no explanation
const E_NOT_ADMIN: u64 = 1;
const E_ALREADY_EXISTS: u64 = 2;

// CORRECT - every constant has a comment
const E_NOT_ADMIN: u64 = 1;           // caller is not the contract admin
const E_ALREADY_EXISTS: u64 = 2;      // entry already exists; duplicates not allowed
const E_NOT_FOUND: u64 = 3;           // requested entry does not exist
const E_NOT_INITIALIZED: u64 = 4;     // module has not been initialized yet
const E_INSUFFICIENT_BALANCE: u64 = 5; // vault balance too low to fulfill withdrawal

assert!(condition, E_NOT_ADMIN);
```

Three rules for error codes:

**1. Every constant gets a comment.** The comment must say what condition triggers it - not just restate the name.

**2. Don't define constants you don't use.** Unused error codes are dead code - define them only when you have a matching `assert!`.

**3. Don't reuse codes for different meanings.** Each distinct failure condition needs its own code. A "game not yet over" state and a "wrong turn" state are different failures - never share one code for both.

### auto init_module (runs on first publish)

```move
// Called automatically when the module is published - no transaction needed.
fun init_module(deployer: &signer) {
    move_to(deployer, Config {
        admin: signer::address_of(deployer),
        value: 0,
    });
}
```

### Resource Accounts (SignerCapability)

Resource accounts let contracts sign transactions autonomously - essential for vaults, pools, DAOs.

```move
use supra_framework::account::{Self, SignerCapability};

struct VaultConfig has key {
    admin: address,
    resource_cap: SignerCapability,
    resource_addr: address,
}

public entry fun initialize(admin: &signer, seed: vector<u8>) {
    // Create resource account - address is derived from admin + seed
    let (resource_signer, resource_cap) = account::create_resource_account(admin, seed);
    let resource_addr = signer::address_of(&resource_signer);

    // Set up resource account (e.g. register coins)
    coin::register<SupraCoin>(&resource_signer);

    // Store capability - never expose it publicly
    move_to(admin, VaultConfig {
        admin: signer::address_of(admin),
        resource_cap,
        resource_addr,
    });
}

public entry fun vault_withdraw(admin: &signer, to: address, amount: u64) acquires VaultConfig {
    let config = borrow_global<VaultConfig>(signer::address_of(admin));
    assert!(config.admin == signer::address_of(admin), E_NOT_ADMIN);

    // Produce vault signer on-demand - no human key needed
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

### dVRF 3.0 - On-Chain Verifiable Randomness

dVRF uses a **request - callback** pattern. You call `rng_request_v2`, Supra calls your `distribute` function back with the verified random numbers.

**VRF 3.0 access control** uses a `SupraVRFPermit<phantom T>` from `supra_addr::deposit` - two setup steps required before your contract can request randomness:
1. Whitelist your wallet address via `deposit::whitelist_client_address` (sets max transaction fee)
2. Fund your deposit account via `deposit::deposit_fund_v2`

See `references/native_features.md` for the full whitelisting walkthrough and CLI commands.

```move
module my_module::lottery {
    use aptos_std::table;
    use supra_addr::supra_vrf;
    use supra_addr::deposit::{Self, SupraVRFPermit};
    use std::string::{Self, String};
    use supra_framework::event;
    use std::signer;

    // Each module that calls rng_request must define its own permit struct.
    // The type parameter in SupraVRFPermit<T> ties access control to this module.
    struct LotteryPermit {}

    struct State has key {
        random_numbers: table::Table<u64, vector<u256>>,
        // SupraVRFPermit is acquired once during init and stored here
        permit_cap: SupraVRFPermit<LotteryPermit>,
    }

    // Called once at deployment - wallet + module must be whitelisted first
    fun init_module(sender: &signer) {
        let cap = deposit::init_vrf_module<LotteryPermit>(sender);
        deposit::enable_module<LotteryPermit>(sender);
        move_to(sender, State { random_numbers: table::new(), permit_cap: cap });
    }

    // Step 1: Request randomness
    // VRF 3.0: no sender/callback_address/callback_module - SupraVRFPermit provides
    // module identity; Supra derives the callback module from the type parameter.
    public entry fun rng_request(
        rng_count: u8,         // how many numbers (max 255)
        client_seed: u64,      // extra entropy, 0 is fine
        num_confirmations: u64,
    ) acquires State {
        let state = borrow_global_mut<State>(@my_module);
        let nonce = supra_vrf::rng_request_v2<LotteryPermit>(
            &state.permit_cap,
            string::utf8(b"distribute"),  // callback function name in this module
            rng_count, client_seed, num_confirmations,
        );
        table::add(&mut state.random_numbers, nonce, vector[]);
    }

    // Step 2: Supra calls this automatically - signature must match exactly
    public entry fun distribute(
        nonce: u64,
        message: vector<u8>,
        signature: vector<u8>,
        caller_address: address,
        rng_count: u8,
        client_seed: u64,
    ) acquires State {
        let verified_nums: vector<u256> = supra_vrf::verify_callback(
            nonce, message, signature, caller_address, rng_count, client_seed,
        );
        let state = borrow_global_mut<State>(@my_module);
        let slot = table::borrow_mut(&mut state.random_numbers, nonce);
        *slot = verified_nums;
    }
}
```

CLI:
```bash
supra move tool run \
  --function-id 'my_module::lottery::rng_request' \
  --args u8:1 u64:0 u64:1 \
  --profile myAccount \
  --rpc-url https://rpc-testnet.supra.com
```

Docs: https://docs.supra.com/dvrf/build-supra-l1/getting-started

### Oracles - Real-Time Price Feeds

> **Move.toml:** The oracle is a git dependency — add it under `[dependencies]` with the key `core`:
> ```toml
> [dependencies.SupraFramework]
> git    = "https://github.com/Entropy-Foundation/aptos-core.git"
> rev    = "dev"
> subdir = "aptos-move/framework/supra-framework"
>
> [dependencies.core]
> git    = "https://github.com/Entropy-Foundation/dora-interface"
> subdir = "supra/testnet/core"
> rev    = "master"
> ```
> The dependency key MUST be `core` (the package name in dora-interface). Using any other key causes a package name mismatch.

The oracle module is `supra_oracle::supra_oracle_storage` (NOT `supra_oracle::oracle` — that module does not exist).

`get_price` returns **4 values**: `(u128, u16, u64, u64)` = (price, decimal, timestamp, round). Always destructure all 4.

```move
module my_module::price_reader {
    use supra_oracle::supra_oracle_storage;

    // Returns (price: u128, decimal: u16, timestamp: u64, round: u64)
    // Pair index 0 = BTC/USDT - verify indices at oracle docs
    #[view]
    public fun get_btc_price(): u128 {
        let (price, _decimal, _timestamp, _round) = supra_oracle_storage::get_price(0);
        price
    }

    public entry fun price_gated_action(
        sender: &signer,
        min_price: u128,
    ) {
        let (price, _, _, _) = supra_oracle_storage::get_price(0); // BTC/USDT
        assert!(price >= min_price, 1);
        // proceed only if BTC is above threshold
    }

    // Batch fetch - more gas-efficient than looping get_price()
    #[view]
    public fun get_multi_price(): vector<supra_oracle_storage::Price> {
        let pairs = vector[0u32, 1u32, 2u32]; // BTC, ETH, SOL
        supra_oracle_storage::get_prices(pairs)
    }
}
```

Pair indices: https://docs.supra.com/oracles/data-feeds/push-oracle

### Automation - Schedule Contract Calls

Write a condition-aware entry function, then register it with Supra Automation. Validators execute it automatically - no bots or keepers needed.

```move
module my_module::auto_tasks {
    use supra_framework::supra_coin::SupraCoin;
    use supra_framework::coin;
    use std::signer;

    // Auto top-up: refill wallet when balance drops below threshold.
    // Condition check is INSIDE the function - exits cleanly if not triggered.
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
        // No abort if condition is false - exits cleanly
    }
}
```

Register via CLI using the **dedicated automation subcommand** (not `supra move tool run`):

```bash
supra move automation register \
  --task-max-gas-amount 50000 \
  --task-gas-price-cap 200 \
  --task-expiry-time-secs <UNIX_TIMESTAMP> \
  --task-automation-fee-cap 10000 \
  --function-id "my_module::auto_tasks::auto_top_up" \
  --args address:<USER_ADDRESS> U64:<MIN_BALANCE> U64:<TOP_UP_AMOUNT> \
  --profile myAccount \
  --rpc-url https://rpc-testnet.supra.com
```

Dry-run simulation before registering:
```bash
supra move automation register --simulate \
  --task-max-gas-amount 50000 \
  --task-gas-price-cap 200 \
  --task-expiry-time-secs <UNIX_TIMESTAMP> \
  --task-automation-fee-cap 10000 \
  --function-id "my_module::auto_tasks::auto_top_up" \
  --args address:<USER_ADDRESS> U64:<MIN_BALANCE> U64:<TOP_UP_AMOUNT> \
  --profile myAccount \
  --rpc-url https://rpc-testnet.supra.com
```

Docs: https://docs.supra.com/automation/getting-started

---

## SECTION: SDK

See `references/sdk_guide.md` for complete SDK reference including multi-agent transactions, simulation, and Python async patterns.

### TypeScript - Install
```bash
npm install supra-l1-sdk           # latest (currently 5.0.2)
npm install supra-l1-sdk@5.0.2    # pin for production
```

> -- Version `@2.0.0` does not exist on npm - published versions start at `3.0.0`.

### TypeScript - State-Modifying Contract Call

> -- There is **no `invokeContractFunction`** method. The real pattern is `createSerializedRawTxObject` - `sendTxUsingSerializedRawTransaction`.

```typescript
import { HexString, SupraAccount, SupraClient, BCS, TxnBuilderTypes } from "supra-l1-sdk";

const client  = await SupraClient.init("https://rpc-testnet.supra.com/");
const account = new SupraAccount(Uint8Array.from(Buffer.from("PRIVATE_KEY_HEX", "hex")));

// Get sequence number (required for every transaction)
const accountInfo = await client.getAccountInfo(account.address());
const seqNum = BigInt(accountInfo.sequence_number);

// Call: public entry fun register(admin: &signer, member: address, name: vector<u8>, score: u64)
const rawTx = await client.createSerializedRawTxObject(
  account.address(),          // sender
  seqNum,                     // sequence number (bigint)
  "0xYOUR_CONTRACT_ADDRESS",  // module address
  "registry",                 // module name
  "register",                 // function name
  [],                         // TypeTag[] - empty if no generic params
  [
    TxnBuilderTypes.AccountAddress.fromHex("0xbeef").toUint8Array(), // address
    BCS.bcsSerializeStr("Alice"),                                     // string/vector<u8>
    BCS.bcsSerializeUint64(BigInt(100)),                              // u64
  ]
);
const response = await client.sendTxUsingSerializedRawTransaction(rawTx, account);
console.log("TX hash:", response.txHash);
```

### TypeScript - View Function Call

> Use `invokeViewMethod` (not `invokeContractFunction`) for read-only calls.

```typescript
const result = await client.invokeViewMethod(
  "0xYOUR_CONTRACT_ADDRESS", "leaderboard", "get_score",
  [],
  [
    TxnBuilderTypes.AccountAddress.fromHex("REGISTRY_ADDR").toUint8Array(),
    TxnBuilderTypes.AccountAddress.fromHex("PLAYER_ADDR").toUint8Array(),
  ]
);
```

**BCS encoding reference:**

| Move type | TypeScript |
|---|---|
| `address` | `TxnBuilderTypes.AccountAddress.fromHex("0x...").toUint8Array()` |
| `u8` | `BCS.bcsSerializeU8(42)` |
| `u64` | `BCS.bcsSerializeUint64(BigInt(1000))` |
| `u128` | `BCS.bcsSerializeU128(BigInt("999"))` |
| `bool` | `BCS.bcsSerializeBool(true)` |
| `string` | `BCS.bcsSerializeStr("text")` |
| `vector<u8>` (raw bytes) | `BCS.bcsSerializeBytes(new Uint8Array([1,2,3]))` |

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

Move contracts are **upgradeable by default**. Use `--upgrade-policy immutable` to permanently lock a module. Three upgrade strategies:

**1. Compatible upgrade** (add functions/structs, no removals):
```bash
supra move tool publish --upgrade-policy compatible --rpc-url https://rpc-testnet.supra.com
```

**2. New module address + state migration** (for breaking changes):
Deploy a new module at a new address. Write a one-time `migrate` entry function that reads old state and writes to new resource types.

**3. Resource account proxy** (future-proof from day one):
Store state in a resource account. Logic module can be swapped by updating the proxy's `logic_module` address field.

**To publish immutably** (cannot be upgraded after deploy):
```bash
supra move tool publish \
  --upgrade-policy immutable \
  --profile myAccount \
  --rpc-url https://rpc-testnet.supra.com
```
You can also set `upgrade_policy = "immutable"` in `Move.toml` under `[package]`.

See `references/patterns.md` for full upgrade code examples.

---

## SECTION: NETWORK & REFERENCES

| Network | RPC URL |
|---|---|
| Testnet | https://rpc-testnet.supra.com |
| Mainnet | https://rpc-mainnet.supra.com |

- Explorer: https://suprascan.io
- Wallet: StarKey - https://starkey.app
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
| `references/native_features.md` | dVRF, Oracles, Automation - full code |
| `references/sdk_guide.md` | TypeScript + Python SDK with BCS encoding |
| `references/resource_accounts.md` | SignerCapability, vault, DAO patterns |
| `references/patterns.md` | SmartTable, upgrade, multi-signer, gas |
| `references/object_model.md` | Supra object model |
| `scripts/example_contract.move` | Counter - basic module template |
| `scripts/token_contract.move` | Custom coin (mint/burn/transfer) |
| `scripts/events_example.move` | Events + vector registry pattern |
| `scripts/advanced_examples.move` | Admin, pausable, NFT (Table), timelock |
| `scripts/test_examples.move` | Full unit test suite patterns |
| `scripts/deploy.sh` | Compile + publish automation |
| `scripts/version_check.sh` | CLI version check |
