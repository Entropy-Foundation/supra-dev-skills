# Supra Account & Resource Model

## Overview

Unlike Sui's object model, Supra uses an **account-based resource model** (similar to Aptos). All on-chain data is stored as **resources** at specific account addresses.

---

## How Data is Stored

Every piece of on-chain data must be:
1. Declared in a `struct` with the `key` ability
2. Stored at an account address using `move_to()`

```move
// Define a resource
struct UserProfile has key {
    name: vector<u8>,
    score: u64,
}

// Store it at the signer's address
public entry fun create_profile(account: &signer, name: vector<u8>) {
    move_to(account, UserProfile { name, score: 0 });
}
```

---

## Global Storage Operations

| Operation | Function | Description |
|---|---|---|
| Store | `move_to(signer, resource)` | Write resource to signer's address |
| Read | `borrow_global<T>(addr)` | Read-only borrow |
| Modify | `borrow_global_mut<T>(addr)` | Mutable borrow |
| Check | `exists<T>(addr)` | Returns bool |
| Remove | `move_from<T>(addr)` | Removes and returns resource |

```move
// Store
move_to(account, MyData { value: 42 });

// Read (immutable)
let data = borrow_global<MyData>(@0xcafe);
let val = data.value;

// Modify
let data = borrow_global_mut<MyData>(@0xcafe);
data.value = 100;

// Check existence
if (exists<MyData>(@0xcafe)) { ... };

// Remove
let MyData { value } = move_from<MyData>(@0xcafe);
```

---

## The `acquires` Keyword

Any function that reads from global storage **must declare** which resources it accesses:

```move
// CORRECT
public fun get_value(addr: address): u64 acquires MyData {
    borrow_global<MyData>(addr).value
}

// WRONG — will not compile
public fun get_value(addr: address): u64 {
    borrow_global<MyData>(addr).value  // Error: missing acquires
}
```

---

## Named Addresses

Instead of hardcoding hex addresses, use named addresses from `Move.toml`:

```toml
# Move.toml
[addresses]
my_module = "0xcafe"
```

```move
// Use in code
module my_module::counter { ... }

// Reference in functions
assert!(signer::address_of(caller) == @my_module, E_NOT_ADMIN);
```

---

## Resource Ownership Patterns

### Pattern 1 — Stored at User's Address
Each user stores their own data:
```move
public entry fun create(user: &signer) {
    move_to(user, UserData { value: 0 });
}
```

### Pattern 2 — Stored at Module Address (Shared Config)
Single global config stored at the module's address:
```move
public entry fun initialize(admin: &signer) {
    // Only callable once by the deployer
    assert!(signer::address_of(admin) == @my_module, 1);
    move_to(admin, GlobalConfig { paused: false });
}
```

### Pattern 3 — Nested Resources
Resources can contain other structs (with `store` ability):
```move
struct Item has store {
    id: u64,
    value: u64,
}

struct Inventory has key {
    items: vector<Item>,
}
```

---

## Token Standards on Supra

### Fungible Tokens (FT)
| Standard | Module | Address |
|---|---|---|
| Fungible Asset (new) | `supra_framework::fungible_asset` | `0x1` |
| Coin (legacy) | `supra_framework::coin` | `0x1` |

⚠️ Migration from Coin to Fungible Asset is **disabled on Mainnet**. Use `coin_wrapper` for FA standard.

### Non-Fungible Tokens (NFT)
| Standard | Module | Address |
|---|---|---|
| Digital Asset (new) | Token objects | `0x4` |
| Token (legacy) | `aptos_token::token` | `0x3` |

> ⚠️ **`aptos_token` is an exception to the rename rule.** The legacy NFT module at `0x3` is `aptos_token::token` on Supra — do not rename it to `supra_token`. Use it as-is for legacy token interactions.

> ⚠️ **Digital Assets (`0x4`) on Mainnet:** The status of Digital Assets on Supra Mainnet should be verified against current docs (https://docs.supra.com). Given that Fungible Asset migration is disabled on Mainnet, confirm whether `0x4` token objects are fully supported before building production NFT contracts around this standard. Use the custom `Table`-based pattern (see `scripts/advanced_examples.move`) as a safe fallback.

---

## Interacting with Deployed Contracts

### Call an entry function (state change)
```bash
supra move tool run \
  --function-id '<ADDRESS>::<MODULE>::<FUNCTION>' \
  --args string:"Hello world!" \
  --rpc-url https://rpc-testnet.supra.com
```

### Call a view function (read-only)
```bash
supra move tool view \
  --function-id '<ADDRESS>::<MODULE>::<FUNCTION>' \
  --args address:<ADDRESS> \
  --rpc-url https://rpc-testnet.supra.com
```

### Argument Types for CLI
| Type | Format |
|---|---|
| String | `string:"hello"` |
| Address | `address:0xcafe` |
| u64 | `u64:1000` |
| bool | `bool:true` |
| vector | `vector:u64:[1,2,3]` |
