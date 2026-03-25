# Supra Core Concepts

## What is Supra?

Supra is a full-stack, high-performance Layer 1 blockchain ecosystem. It supports:
- **MoveVM** — Write contracts in the Move language
- **EVM** — Write contracts in Solidity (Ethereum-compatible)
- **Native Oracles** — On-chain price feeds
- **dVRF** — Verifiable on-chain randomness
- **Automation** — Schedule contract execution
- **SupraNova Bridge** — Cross-chain interoperability

---

## Move Language on Supra

### Module Basics

Move code is organized into **modules** uploaded to the Supra blockchain. Users interact with modules by calling functions via transactions. Modules are grouped into **packages**.

Each module has a unique identifier: `<address>::<module_name>`

```move
module 0xcafe::my_module {
    // module code here
}
```

### Structs and the `key` Ability

All data written to the blockchain must be in a struct with the `key` attribute:

```move
struct Config has key {
    admin: address,
    value: u64,
}
```

Without `key`, the struct is a local variable only — not stored on-chain.

### The Four Abilities

| Ability | Meaning |
|---|---|
| `key` | Can be stored in global storage (on-chain) |
| `store` | Can be stored inside other structs |
| `copy` | Can be duplicated/copied |
| `drop` | Can be discarded without explicit destruction |

---

## Global Storage (On-chain Data)

Supra uses an account-based global storage model. Resources are stored at addresses.

```move
// Write to blockchain — stored at signer's address
move_to(account, MyData { value: 42 });

// Read data (immutable)
let data = borrow_global<MyData>(some_address);

// Read data (mutable)
let data = borrow_global_mut<MyData>(some_address);
data.value = 100;

// Check if resource exists
if (exists<MyData>(some_address)) { ... }

// Remove resource from storage
let MyData { value } = move_from<MyData>(some_address);
```

---

## Function Types

```move
// Entry function — callable directly from a transaction
public entry fun create(account: &signer, value: u64) { ... }

// Public function — callable from other Move modules
public fun get_value(addr: address): u64 acquires MyData {
    borrow_global<MyData>(addr).value
}

// Private function — internal use only
fun compute(x: u64): u64 { x * 2 }
```

Note: If a function reads from global storage, it must declare `acquires ResourceName`.

---

## Passing Data: Value vs Reference

```move
// Pass by value — consumes the value
fun use_value(x: u64): u64 { x + 1 }

// Pass by immutable reference — read only
fun read_ref(x: &u64): u64 { *x }

// Pass by mutable reference — can modify
fun mutate_ref(x: &mut u64) { *x = *x + 1; }
```

---

## Vectors

Vectors are dynamic-size lists in Move:

```move
use std::vector;

let v: vector<u64> = vector::empty();
vector::push_back(&mut v, 10);
vector::push_back(&mut v, 20);

let len = vector::length(&v);        // 2
let first = vector::borrow(&v, 0);   // &10
vector::pop_back(&mut v);            // removes last element
```

---

## Events

Events let smart contracts emit signals that external apps can listen to:

```move
use supra_framework::event;

#[event]
struct Transfer has drop, store {
    from: address,
    to: address,
    amount: u64,
}

// Emit the event
event::emit(Transfer { from: sender, to: recipient, amount: 1000 });
```

---

## Error Handling

Use `assert!` with custom error codes:

```move
// Define error codes as constants
const E_NOT_ADMIN: u64 = 1;
const E_INSUFFICIENT_BALANCE: u64 = 2;
const E_ALREADY_INITIALIZED: u64 = 3;

// Use assert! to validate conditions
public entry fun admin_action(caller: &signer) {
    assert!(signer::address_of(caller) == @my_module, E_NOT_ADMIN);
    // proceed...
}
```

---

## Supra Network Architecture

- **Consensus:** Moonshot — ultra-fast finality
- **VM:** MoveVM (Move language) + EVM (Solidity)
- **Wallet:** StarKey (https://starkey.app)
- **Explorer:** SupraScan (https://suprascan.io)
- **Testnet RPC:** https://rpc-testnet.supra.com
- **Mainnet RPC:** https://rpc-mainnet.supra.com

---

## Important: Supra vs Aptos Difference

Supra is based on the Aptos/Move codebase but uses its own framework. **Always use:**

```move
use supra_framework::account;      // NOT aptos_framework::account
use supra_framework::supra_coin::SupraCoin;  // NOT AptosCoin
```

All `aptos_framework::` imports must be replaced with `supra_framework::`.
