# Resource Accounts & SignerCapability

Resource accounts are special accounts whose `signer` authority is controlled by a contract, not a human keypair. This enables autonomous contract behavior - vaults, DAOs, liquidity pools, escrow - where the contract must sign transactions without a human present.

---

## Core Concept

```
Normal account:   keypair - signer - signs transactions
Resource account: contract holds SignerCapability - generates signer on-demand
```

The `SignerCapability` is a capability object you store inside your module. Calling `account::create_signer_with_capability(&cap)` produces a signer at any time.

---

## Pattern: Module-Owned Vault

```move
module my_module::vault {
    use supra_framework::account::{Self, SignerCapability};
    use supra_framework::supra_coin::SupraCoin;
    use supra_framework::coin;
    use std::signer;
    use supra_framework::event;

    const E_NOT_ADMIN: u64 = 1;
    const E_NOT_INITIALIZED: u64 = 2;

    // Holds the resource account's signer capability.
    // Stored at the ADMIN's address (not the resource account's address).
    struct VaultConfig has key {
        admin: address,
        resource_cap: SignerCapability,
        resource_addr: address,
    }

    #[event]
    struct Deposited has drop, store { amount: u64, from: address }

    #[event]
    struct Withdrawn has drop, store { amount: u64, to: address }

    // Call once during deployment to set up the resource account.
    // `seed` is any unique byte string - used to derive the resource account address.
    public entry fun initialize(admin: &signer, seed: vector<u8>) {
        let admin_addr = signer::address_of(admin);
        assert!(!exists<VaultConfig>(admin_addr), 3); // E_ALREADY_INITIALIZED

        // Create the resource account - it gets its own address derived from admin + seed
        let (resource_signer, resource_cap) = account::create_resource_account(admin, seed);
        let resource_addr = signer::address_of(&resource_signer);

        // Register the resource account to hold SupraCoin
        coin::register<SupraCoin>(&resource_signer);

        // Store the capability at the admin's address
        move_to(admin, VaultConfig {
            admin: admin_addr,
            resource_cap,
            resource_addr,
        });
    }

    // Deposit SupraCoin into the vault
    public entry fun deposit(sender: &signer, amount: u64) acquires VaultConfig {
        let config = borrow_global<VaultConfig>(@my_module);
        coin::transfer<SupraCoin>(sender, config.resource_addr, amount);
        event::emit(Deposited { amount, from: signer::address_of(sender) });
    }

    // Admin withdraws from the vault - contract signs on behalf of the resource account
    public entry fun withdraw(admin: &signer, recipient: address, amount: u64) acquires VaultConfig {
        let admin_addr = signer::address_of(admin);
        let config = borrow_global<VaultConfig>(admin_addr);
        assert!(config.admin == admin_addr, E_NOT_ADMIN);

        // Produce a signer for the resource account - no human key required
        let resource_signer = account::create_signer_with_capability(&config.resource_cap);
        coin::transfer<SupraCoin>(&resource_signer, recipient, amount);

        event::emit(Withdrawn { amount, to: recipient });
    }

    #[view]
    public fun vault_balance(admin_addr: address): u64 acquires VaultConfig {
        assert!(exists<VaultConfig>(admin_addr), E_NOT_INITIALIZED);
        let config = borrow_global<VaultConfig>(admin_addr);
        coin::balance<SupraCoin>(config.resource_addr)
    }

    #[view]
    public fun vault_address(admin_addr: address): address acquires VaultConfig {
        assert!(exists<VaultConfig>(admin_addr), E_NOT_INITIALIZED);
        borrow_global<VaultConfig>(admin_addr).resource_addr
    }
}
```

---

## How `create_resource_account` Works

```move
let (resource_signer, resource_cap) = account::create_resource_account(admin, seed);
```

- **`admin`** - the signer that "owns" the resource account creation
- **`seed`** - arbitrary bytes; the resource account address is deterministically derived from `sha3(admin_addr || seed || 0xFF)`
- **`resource_signer`** - a one-time signer for the new account (use it for setup: registering coins, storing initial resources)
- **`resource_cap`** - the `SignerCapability` you store permanently; call `create_signer_with_capability` later to produce signers

### Derive the address before deployment

The resource account address is derived as `sha3_256(admin_address_bytes || seed_bytes || 0xFF)` where `admin_address` is the 32-byte canonical form (zero-padded).

> -- `TxnBuilderTypes.AccountAddress.fromDerivationPath` does **not** exist in `supra-l1-sdk`. The `AccountAddress` class only exposes `fromHex`, `isValid`, `standardizeAddress`, and `deserialize`.

To pre-compute the resource account address in TypeScript, implement the derivation manually using the Web Crypto API or a SHA-3 library (e.g. `js-sha3`):

```typescript
import { sha3_256 } from "js-sha3";
import { TxnBuilderTypes, HexString } from "supra-l1-sdk";

function deriveResourceAccountAddress(adminHex: string, seed: Uint8Array): string {
  // Canonical 32-byte admin address
  const adminAddr = TxnBuilderTypes.AccountAddress.fromHex(adminHex).toUint8Array();
  // seed_length prefix (1 byte) + seed bytes
  const seedLen   = new Uint8Array([seed.length]);
  // Domain separator: 0xFF
  const separator = new Uint8Array([0xff]);
  const combined  = new Uint8Array([...adminAddr, ...seedLen, ...seed, ...separator]);
  return sha3_256(combined);
}

const resourceAddress = deriveResourceAccountAddress(
  "ADMIN_ADDRESS",
  new TextEncoder().encode("protocol_v1")  // must match seed in Move
);
console.log("Resource account address:", resourceAddress);
```

> The Move runtime uses `0xFF` as the domain separator byte, distinct from the `0xFE` separator used for regular account address derivation. Verify against the framework source before using in production: https://github.com/Entropy-Foundation/aptos-core

---

## Pattern: `init_module` Auto-Setup

For contracts that should create their resource account automatically on first publish:

```move
module my_module::protocol {
    use supra_framework::account::{Self, SignerCapability};
    use std::signer;

    struct ProtocolState has key {
        resource_cap: SignerCapability,
    }

    // Called automatically when the module is first published
    fun init_module(deployer: &signer) {
        let (_, resource_cap) = account::create_resource_account(deployer, b"protocol_v1");
        move_to(deployer, ProtocolState { resource_cap });
    }
}
```

---

## When to Use Resource Accounts

| Use Case | Why |
|---|---|
| Token vault / treasury | Contract must hold and transfer funds autonomously |
| DAO / multisig execution | Actions execute without a single human signer |
| Liquidity pools | Pool address signs LP token operations |
| NFT minting contract | Contract mints on behalf of the collection |
| Escrow | Funds locked until conditions are met |
| Upgradeable proxy | Resource account holds upgrade capability |

---

## Key Rules

1. **Store `SignerCapability` at your module's address** (or the admin address), not the resource account's address.
2. **The resource signer from `create_resource_account` is temporary** - use it for setup only. Do not try to store or re-use it directly.
3. **Each `(admin, seed)` pair produces one unique address** - use different seeds for different resource accounts from the same admin.
4. **Resource accounts cannot be deleted** - they exist permanently on-chain once created.
