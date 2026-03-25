# Supra vs Aptos — Migration Cheatsheet

If you are coming from Aptos, this is your quick reference for what changes on Supra.

---

## The #1 Rule

> Replace every `aptos_framework::` with `supra_framework::`

---

## Import Path Changes

### Aptos
```move
use aptos_framework::account::{Self, SignerCapability};
use aptos_framework::aptos_coin::AptosCoin;
use aptos_framework::coin;
use aptos_framework::event;
use aptos_framework::fungible_asset;
use aptos_framework::governance;
```

### Supra (correct)
```move
use supra_framework::account::{Self, SignerCapability};
use supra_framework::supra_coin::SupraCoin;
use supra_framework::coin;
use supra_framework::event;
use supra_framework::fungible_asset;
use supra_framework::supra_governance;
```

---

## Module Name Mapping

| Functionality | Aptos | Supra |
|---|---|---|
| Account Management | `aptos_framework::account` | `supra_framework::account` |
| Native Coin | `aptos_coin::AptosCoin` | `supra_coin::SupraCoin` |
| Coin Operations | `aptos_framework::coin` | `supra_framework::coin` |
| Event Handling | `aptos_framework::event` | `supra_framework::event` |
| Fungible Assets | `aptos_framework::fungible_asset` | `supra_framework::fungible_asset` |
| Multisig | `aptos_framework::multisig_account` | `supra_framework::multisig_account` |
| Governance | `aptos_framework::governance` | `supra_framework::supra_governance` |
| Staking/Consensus | `aptos_framework::staking_config` | `supra_framework::staking_config` |
| Randomness | External/manual | Native dVRF (built-in) |

---

## Domain Separator Change

```move
// Aptos
const DOMAIN_SEPARATOR: vector<u8> = b"aptos_framework::multisig_account";

// Supra
const DOMAIN_SEPARATOR: vector<u8> = b"supra_framework::multisig_account";
```

---

## Randomness / dVRF

Aptos relies on external or manual randomness. Supra has **native dVRF** built in.

Add this to your `Move.toml`:
```toml
[dependencies.SupraVrf]
git = "https://github.com/Entropy-Foundation/vrf-interface"
```

---

## Fungible Assets (FA) — Important Note

The Fungible Assets Module has **migration disabled on Mainnet**. Use the `coin_wrapper` for FA Standard in any Supra project:

```
https://github.com/Entropy-Foundation/aptos-core/blob/dev/aptos-move/move-examples/swap/sources/coin_wrapper.move
```

---

## Framework Repository

The full Supra framework source code:
```
https://github.com/Entropy-Foundation/aptos-core/tree/dev/aptos-move/framework/supra-framework
```

---

## Coming from Ethereum/Solidity?

See: https://docs.supra.com/network/move/ethereum-to-supra-move-cheatsheet

Key differences:
- No gas in the Solidity sense — Move uses resource-based model
- No `msg.sender` — use `signer` parameter explicitly
- No inheritance — use composition with structs
- No global mutable state — all state is per-address resources
