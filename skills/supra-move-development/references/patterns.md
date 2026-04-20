# Advanced Move Patterns

## 1. smart_table - Scalable Key-Value Storage

`SmartTable` is the idiomatic choice for on-chain maps in Supra/Move. It uses a bucketed hash table under the hood, giving amortized O(1) access and gas costs that don't grow with collection size.

**Rule:** Use `SmartTable` (or `Table`) for any collection that could have more than ~100 entries. Use `vector` only for small fixed-size lists or ordered iteration.

```move
module my_module::leaderboard {
    use aptos_std::smart_table::{Self, SmartTable};
    use std::signer;

    struct Scores has key {
        // Maps player address - score - O(1) reads, gas stays flat as it grows
        scores: SmartTable<address, u64>,
        player_count: u64,
    }

    public entry fun initialize(admin: &signer) {
        move_to(admin, Scores {
            scores: smart_table::new(),
            player_count: 0,
        });
    }

    public entry fun record_score(
        admin: &signer,
        player: address,
        score: u64,
    ) acquires Scores {
        let data = borrow_global_mut<Scores>(signer::address_of(admin));

        if (smart_table::contains(&data.scores, player)) {
            // Update existing entry
            let existing = smart_table::borrow_mut(&mut data.scores, player);
            if (score > *existing) { *existing = score };
        } else {
            // Insert new entry
            smart_table::add(&mut data.scores, player, score);
            data.player_count = data.player_count + 1;
        }
    }

    public entry fun remove_player(admin: &signer, player: address) acquires Scores {
        let data = borrow_global_mut<Scores>(signer::address_of(admin));
        if (smart_table::contains(&data.scores, player)) {
            smart_table::remove(&mut data.scores, player);
            data.player_count = data.player_count - 1;
        }
    }

    #[view]
    public fun get_score(admin_addr: address, player: address): u64 acquires Scores {
        let data = borrow_global<Scores>(admin_addr);
        if (smart_table::contains(&data.scores, player)) {
            *smart_table::borrow(&data.scores, player)
        } else { 0 }
    }

    #[view]
    public fun has_score(admin_addr: address, player: address): bool acquires Scores {
        smart_table::contains(&borrow_global<Scores>(admin_addr).scores, player)
    }
}
```

### Table vs SmartTable vs vector

| | `vector` | `Table` | `SmartTable` |
|---|---|---|---|
| Lookup | O(n) | O(1) | O(1) amortized |
| Gas growth | Linear | Flat | Flat |
| Ordered iteration | Yes | No | No |
| Max practical size | ~1000 | Unlimited | Unlimited |
| Destroyed on drop | Yes | Must be destroyed | Must be destroyed |

**Destroying a SmartTable** (required before dropping the struct):
```move
smart_table::destroy_empty(&mut data.scores); // only if empty
// or
smart_table::drop(data.scores);               // destroys all entries
```

---

## 2. Contract Upgrade / Migration Pattern

Move contracts are **immutable once published** - you cannot edit deployed bytecode. The standard upgrade paths are:

### Option A: Publish with `--upgrade-policy compatible`

Supra (like Aptos) supports upgrading a module if the new version is **backward-compatible** - you can add functions and structs, but cannot remove or change existing ones.

```bash
# Publish initial version
supra move tool publish \
  --package-dir /supra/move_workspace/myProject \
  --rpc-url https://rpc-testnet.supra.com

# Publish an upgrade (must be backward-compatible)
supra move tool publish \
  --package-dir /supra/move_workspace/myProject \
  --rpc-url https://rpc-testnet.supra.com \
  --upgrade-policy compatible
```

**Compatible** means:
- You MAY add new public functions and structs
- You MAY NOT remove or rename existing public functions
- You MAY NOT change existing struct layouts

### Option B: Versioned Module with Admin-Controlled Migration

For breaking changes, build migration into the contract from day one:

```move
module my_module::v2_protocol {
    use std::signer;
    use supra_framework::account::SignerCapability;

    const E_NOT_ADMIN: u64 = 1;
    const E_MIGRATION_DONE: u64 = 2;

    struct ProtocolV2 has key {
        admin: address,
        version: u64,
        // new fields for v2...
        new_field: u64,
    }

    struct MigrationCap has key {
        admin: address,
        migrated: bool,
    }

    public entry fun migrate_from_v1(admin: &signer) acquires MigrationCap {
        let addr = signer::address_of(admin);
        let cap = borrow_global_mut<MigrationCap>(addr);
        assert!(cap.admin == addr, E_NOT_ADMIN);
        assert!(!cap.migrated, E_MIGRATION_DONE);

        // Read old state, transform, write new state
        // (move_from old resource, move_to new resource)

        cap.migrated = true;
    }
}
```

### Option C: Proxy Pattern via Resource Account

Store state in a resource account whose address never changes. Upgrade the logic module and point the proxy at the new address:

```move
module my_module::proxy {
    use supra_framework::account::{Self, SignerCapability};
    use std::signer;

    struct ProxyConfig has key {
        admin: address,
        logic_module: address,   // points to current logic
        resource_cap: SignerCapability,
    }

    public entry fun upgrade_logic(admin: &signer, new_logic: address) acquires ProxyConfig {
        let addr = signer::address_of(admin);
        let config = borrow_global_mut<ProxyConfig>(addr);
        assert!(config.admin == addr, 1);
        config.logic_module = new_logic;
    }
}
```

### Upgrade Checklist

- [ ] Add `--upgrade-policy compatible` only if adding new functions/structs
- [ ] For breaking changes: deploy a new module address + migrate state
- [ ] Always emit an event on migration for auditability
- [ ] Test migration on testnet with real data volume before mainnet

---

## 3. Multi-Signer Transactions

Supra supports multi-agent transactions where multiple signers participate in a single atomic transaction. This is essential for DEX swaps, escrow settlement, and co-signed actions.

```move
module my_module::escrow {
    use supra_framework::supra_coin::SupraCoin;
    use supra_framework::coin;
    use std::signer;
    use supra_framework::event;

    const E_WRONG_BUYER: u64 = 1;
    const E_NOT_INITIALIZED: u64 = 2;

    struct EscrowOffer has key {
        seller: address,
        buyer: address,
        amount: u64,
        settled: bool,
    }

    #[event]
    struct EscrowSettled has drop, store { seller: address, buyer: address, amount: u64 }

    public entry fun create_offer(
        seller: &signer,
        buyer: address,
        amount: u64,
    ) {
        move_to(seller, EscrowOffer {
            seller: signer::address_of(seller),
            buyer,
            amount,
            settled: false,
        });
    }

    // Multi-signer entry - both seller and buyer must sign this transaction.
    // The SDK submits it as a multi-agent transaction.
    public entry fun settle(
        seller: &signer,
        buyer: &signer,    // second signer - must also sign the transaction
    ) acquires EscrowOffer {
        let seller_addr = signer::address_of(seller);
        let buyer_addr = signer::address_of(buyer);

        assert!(exists<EscrowOffer>(seller_addr), E_NOT_INITIALIZED);
        let offer = borrow_global_mut<EscrowOffer>(seller_addr);
        assert!(offer.buyer == buyer_addr, E_WRONG_BUYER);
        assert!(!offer.settled, 3);

        // Buyer pays seller
        coin::transfer<SupraCoin>(buyer, seller_addr, offer.amount);
        offer.settled = true;

        event::emit(EscrowSettled {
            seller: seller_addr,
            buyer: buyer_addr,
            amount: offer.amount,
        });
    }
}
```

### Multi-Agent Transaction via TypeScript SDK

```typescript
import { SupraClient, SupraAccount, HexString, TxnBuilderTypes } from "supra-l1-sdk";

const client = await SupraClient.init("https://rpc-testnet.supra.com/");

// Canonical constructor: Uint8Array.from(Buffer.from(..., "hex"))
const seller = new SupraAccount(Uint8Array.from(Buffer.from("SELLER_PRIVATE_KEY_HEX", "hex")));
const buyer  = new SupraAccount(Uint8Array.from(Buffer.from("BUYER_PRIVATE_KEY_HEX",  "hex")));

// Build a multi-agent (multi-signer) transaction
// seller is the primary signer, buyer is the secondary signer
const sellerInfo = await client.getAccountInfo(seller.address());
const rawTxn = await client.createRawTxObject(
  seller.address(),
  BigInt(sellerInfo.sequence_number),
  new HexString("CONTRACT_ADDRESS").hex(),
  "escrow",
  "settle",
  [],   // TypeTag[]
  []    // function args - seller and buyer signers are provided separately
);
const txRes = await client.sendMultiAgentTransaction(
  seller,     // primary signer (SupraAccount)
  [buyer],    // secondary signers (SupraAccount[])
  rawTxn
);
console.log("Escrow settled:", txRes.txHash);
console.log("Escrow settled:", txRes);
```

---

## 4. Gas & Fee Guidance

### Gas Model Basics

| Term | Meaning |
|---|---|
| `max_gas_amount` | Upper bound on gas units the transaction may consume |
| `gas_unit_price` | Price per gas unit in Quants (smallest SupraCoin unit) |
| Transaction fee | `gas_used - gas_unit_price` |
| Abort on overrun | If gas_used > max_gas_amount, transaction aborts and fee is still charged |

### SupraCoin Units

```
1 SUPRA = 100,000,000 Quants  (8 decimal places)
```

```typescript
// In TypeScript SDK - set gas parameters via OptionalTransactionPayloadArgs
const accountInfo = await client.getAccountInfo(account.address());
const seqNum = BigInt(accountInfo.sequence_number);

const rawTx = await client.createSerializedRawTxObject(
  account.address(),
  seqNum,
  "CONTRACT_ADDRESS",
  "module_name",
  "function_name",
  [],          // TypeTag[]
  [/* BCS-encoded args */],
  {
    maxGas:       BigInt(10000),  // max gas units
    gasUnitPrice: BigInt(100),    // Quants per unit
  }
);
const txRes = await client.sendTxUsingSerializedRawTransaction(rawTx, account);
console.log("TX hash:", txRes.txHash);
```

### Common Gas Pitfalls

1. **Vector iteration** - looping over large vectors is O(n) gas. Use `SmartTable` for collections > ~100 elements.
2. **Nested borrows** - deep borrow chains in tight loops cost extra gas.
3. **Events** - cheap, but emit only what subscribers need.
4. **`move_from` + `move_to`** - prefer `borrow_global_mut` when you don't need to fully extract the resource.
5. **Automation tasks** - always set `max_gas_amount` conservatively; tasks that run out of gas still deduct the fee.

### Simulate Before Submitting

```typescript
// Use simulateTxUsingSerializedRawTransaction - reuses the same serialized bytes
// as sendTxUsingSerializedRawTransaction (simulateTransaction / simulateTx(account, rawTxn)
// do NOT have those signatures in supra-l1-sdk v5)
const accountInfo = await client.getAccountInfo(account.address());
const serializedRawTx = await client.createSerializedRawTxObject(
  account.address(),
  BigInt(accountInfo.sequence_number),
  "CONTRACT_ADDRESS",
  "module_name",
  "function_name",
  [],          // TypeTag[]
  [/* BCS-encoded args */]
);
const simulation = await client.simulateTxUsingSerializedRawTransaction(
  serializedRawTx,
  account
);
console.log("Estimated gas:", simulation.gas_used);
```

---

## 5. Table / SmartTable Destruction Lifecycle

A struct containing a `Table` or `SmartTable` cannot be dropped - the compiler will reject it with "resource not droppable." You **must** explicitly destroy the collection before or during the struct removal.

This is one of the most common compile errors for new Move developers.

```move
module my_module::lifecycle {
    use aptos_std::smart_table::{Self, SmartTable};
    use aptos_std::table::{Self, Table};
    use std::signer;

    struct Registry has key {
        scores: SmartTable<address, u64>,
        metadata: Table<u64, address>,
    }

    // - CORRECT - destroy inner collections before dropping the struct
    public entry fun shutdown(admin: &signer) acquires Registry {
        let Registry { scores, metadata } = move_from<Registry>(signer::address_of(admin));

        // SmartTable: use drop() to destroy all entries at once
        smart_table::drop(scores);

        // Table: must be destroyed manually entry-by-entry if non-empty,
        // OR use destroy_empty() only if you know it's already empty
        table::destroy_empty(metadata); // aborts if metadata still has entries
    }

    // Draining a Table before destroying it - full lifecycle
    public entry fun drain_and_close(admin: &signer, keys: vector<u64>) acquires Registry {
        let addr = signer::address_of(admin);

        // Step 1: borrow mutably and drain the Table
        {
            let reg = borrow_global_mut<Registry>(addr);
            let i = 0u64;
            while (i < std::vector::length(&keys)) {
                let k = *std::vector::borrow(&keys, i);
                if (table::contains(&reg.metadata, k)) {
                    table::remove(&mut reg.metadata, k);
                };
                i = i + 1;
            };
        }; // borrow ends here

        // Step 2: move_from to take ownership of the whole struct
        let Registry { scores, metadata } = move_from<Registry>(addr);

        // Step 3: destroy inner collections explicitly
        smart_table::drop(scores);         // drops all entries at once
        table::destroy_empty(metadata);    // aborts if any keys remain - drain must be complete
    }
}
```

### Destruction Quick Reference

| Type | Destroy with |
|---|---|
| `SmartTable<K, V>` | `smart_table::drop(t)` - destroys all entries |
| `SmartTable<K, V>` (if empty) | `smart_table::destroy_empty(&mut t)` |
| `Table<K, V>` | No bulk drop - remove all entries manually, then `table::destroy_empty(t)` |
| `vector<T>` where T has `drop` | Drops automatically |
| `vector<T>` where T has no `drop` | Must pop/unpack each element manually |
