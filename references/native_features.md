# Supra Native Features Guide

Supra has built-in features that most blockchains don't have natively.

---

## 1. dVRF 3.0 - On-Chain Verifiable Randomness

Supra dVRF uses a **request/callback** pattern - NOT a synchronous call.
You request randomness, and Supra calls back your contract with the result.

### What Changed in VRF 3.0

VRF 3.0 replaces the old `sender + callback_address + callback_module` approach with a **permit-based access control** model:

| | VRF 2.x | VRF 3.0 |
|---|---|---|
| Auth | `&signer` + raw addresses | `SupraVRFPermit<phantom T>` (`supra_addr::deposit`) |
| Callback routing | explicit `callback_address + callback_module` | derived from type parameter `T` |
| Whitelisting | single contract whitelist | `whitelist_client_address` + `deposit_fund_v2` |
| Gas coverage | client deposit only | client deposit **or** gas credits (gasless) |

### Move.toml Dependency

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

### Step-by-Step Whitelisting (VRF 3.0)

VRF 3.0 requires **two whitelisting steps** before your contract can request randomness.

**Step 1 - Whitelist your wallet address and set max transaction fee:**
```bash
supra move tool run \
  --function-id 'supra_addr::deposit::whitelist_client_address' \
  --args u64:<max_txn_fee> \
  --profile myAccount \
  --rpc-url https://rpc-testnet.supra.com
```

> `max_txn_fee`: set to `0` to use the default fee value, or a positive integer to cap the per-response fee.

**Step 2 - Fund your deposit account:**
```bash
supra move tool run \
  --function-id 'supra_addr::deposit::deposit_fund_v2' \
  --args address:<your_address> u64:<amount> \
  --profile myAccount \
  --rpc-url https://rpc-testnet.supra.com
```

> Minimum deposit amount: see current requirements at https://docs.supra.com/dvrf/build-supra-l1/getting-started

---

### SupraVRFPermit Pattern

VRF 3.0 uses `SupraVRFPermit<phantom T>` from `supra_addr::deposit` for access control. Each module that calls `rng_request_v2` must:

1. Define a **permit struct** - an empty marker struct local to the module
2. Acquire a `SupraVRFPermit<T>` once via `deposit::init_vrf_module<T>(sender)` (in `init_module`) and store it
3. Call `deposit::enable_module<T>(sender)` after acquiring the permit
4. Pass `&SupraVRFPermit<T>` to every `rng_request_v2` call

The type parameter `T` must be a type defined in **the same module** as your callback function. This ties the callback routing to the permit - Supra derives the callback module address from the type.

```move
// addr::module1 defines permit1 - only this module can use SupraVRFPermit<permit1>
module my_module::module1 {
    use supra_addr::deposit::{Self, SupraVRFPermit};
    struct permit1 {}
    // SupraVRFPermit<permit1> can only be used to call back into my_module::module1
}
```

Multiple modules can each have their own permit:
```move
// addr::module2 defines permit2 - separate access control from module1
module my_module::module2 {
    use supra_addr::deposit::{Self, SupraVRFPermit};
    struct permit2 {}
}
```

---

### Full dVRF 3.0 Example

```move
module my_module::lottery {
    use aptos_std::table;
    use supra_addr::supra_vrf;
    use supra_addr::deposit::{Self, SupraVRFPermit};
    use std::string::{Self, String};
    use supra_framework::event;
    use std::signer;

    // -- Permit struct --------------------------------------------------
    // Marker struct for this module's VRF permit.
    // The type parameter in SupraVRFPermit<T> is tied to this module -
    // only this module can use SupraVRFPermit<LotteryPermit>.
    struct LotteryPermit {}

    // -- State ----------------------------------------------------------
    struct State has key {
        random_numbers: table::Table<u64, vector<u256>>,
        permit_cap:     SupraVRFPermit<LotteryPermit>,
    }

    #[event]
    struct RandomnessRequested has drop, store { nonce: u64 }

    #[event]
    struct RandomnessReceived has drop, store { nonce: u64, count: u64 }

    // -- Initialization -------------------------------------------------
    // Wallet address AND module must be whitelisted before deploying.
    // deposit::init_vrf_module acquires the SupraVRFPermit; enable_module
    // activates the module for VRF callbacks.
    fun init_module(sender: &signer) {
        let cap = deposit::init_vrf_module<LotteryPermit>(sender);
        deposit::enable_module<LotteryPermit>(sender);
        move_to(sender, State {
            random_numbers: table::new(),
            permit_cap: cap,
        });
    }

    // -- Step 1: Request randomness -------------------------------------
    // VRF 3.0: no sender/callback_address/callback_module params.
    // SupraVRFPermit identifies the module; Supra derives callback routing from T.
    public entry fun rng_request(
        rng_count: u8,          // how many numbers (max 255)
        client_seed: u64,       // extra entropy, 0 is fine
        num_confirmations: u64, // blocks before callback fires
    ) acquires State {
        let state = borrow_global_mut<State>(@my_module);
        let nonce = supra_vrf::rng_request_v2<LotteryPermit>(
            &state.permit_cap,
            string::utf8(b"distribute"), // callback function name in this module
            rng_count,
            client_seed,
            num_confirmations,
        );
        table::add(&mut state.random_numbers, nonce, vector[]);
        event::emit(RandomnessRequested { nonce });
    }

    // -- Step 2: Callback -----------------------------------------------
    // Supra calls this automatically. Signature must match exactly -
    // 6 parameters in this exact order. Return type is always vector<u256>.
    //
    // -- DEFENSIVE GUARD: always verify your contract is in the expected
    // "waiting for VRF" state before processing. Without this, a replayed
    // or out-of-order callback can silently corrupt live state.
    public entry fun distribute(
        nonce: u64,
        message: vector<u8>,
        signature: vector<u8>,
        caller_address: address,
        rng_count: u8,
        client_seed: u64,
    ) acquires State {
        // Guard: nonce must be in the pending table - rejects unexpected callbacks
        let state = borrow_global_mut<State>(@my_module);
        assert!(table::contains(&state.random_numbers, nonce), E_NOT_INITIALIZED);

        // verify_callback authenticates the VRF response and returns random numbers
        // Interface source: https://github.com/Entropy-Foundation/vrf-interface
        let verified_nums: vector<u256> = supra_vrf::verify_callback(
            nonce, message, signature, caller_address, rng_count, client_seed,
        );
        let slot = table::borrow_mut(&mut state.random_numbers, nonce);
        *slot = verified_nums;
        event::emit(RandomnessReceived { nonce, count: (rng_count as u64) });
    }

    // -- View -----------------------------------------------------------
    #[view]
    public fun get_random_numbers(nonce: u64): vector<u256> acquires State {
        *table::borrow(&borrow_global<State>(@my_module).random_numbers, nonce)
    }
}
```

---

### Max Transaction Fee (VRF 3.0)

VRF 3.0 requires clients to specify the **maximum transaction fee** for receiving a VRF callback response. This prevents over-spend and controls minimum balance requirements.

| `max_txn_fee` | Behavior |
|---|---|
| `0` | VRF contract applies a default fee value |
| `> 0` | Min Balance Per Client = Max Response Txns - `max_txn_fee` |

When your balance falls below Min Balance, VRF responses stop. Fund the deposit account to resume.

> Configure `max_txn_fee` during the deposit/registration step. Verify the exact parameter name against the v3 docs: https://docs.supra.com/dvrf/build-supra-l1/getting-started

---

### Gasless VRF (VRF 3.0)

VRF 3.0 introduces a **gas credit** grant system so clients can receive VRF responses without holding SUPRA tokens upfront.

- 1 gas credit = 1 SUPRA
- Credits are admin-allocated at subscription creation (configurable later)
- Per-transaction grant amount can be set with start/end dates
- Credits are consumed **before** SUPRA token balance
- Gas credits **cannot** be withdrawn as SUPRA

Spending priority: `gas credits - SUPRA deposit`

When both are exhausted, the standard minimum-balance rules apply.

---

### CLI

```bash
# Trigger an RNG request (1 number, seed 0, 1 confirmation)
supra move tool run \
  --function-id 'my_module::lottery::rng_request' \
  --args u8:1 u64:0 u64:1 \
  --profile myAccount \
  --rpc-url https://rpc-testnet.supra.com

# Read the result back (view call - no profile needed)
supra move tool view \
  --function-id 'my_module::lottery::get_random_numbers' \
  --args u64:0 \
  --rpc-url https://rpc-testnet.supra.com
```

**Docs:** https://docs.supra.com/dvrf/build-supra-l1/getting-started

---

## 2. Native Oracles - Real-Time Price Feeds

Each price pair has a numeric **pair index** (e.g. BTC_USDT = 0, ETH_USDT = 1).
Confirm exact indices at: https://docs.supra.com/oracles/data-feeds/push-oracle

### Price-Gated Transfer Example

```move
module my_module::price_gated {
    use supra_framework::supra_coin::SupraCoin;
    use supra_framework::coin;
    use std::signer;
    use supra_framework::event;
    // Confirm exact oracle module path at oracle docs
    use supra_oracle::oracle;

    const E_PRICE_TOO_LOW: u64 = 1;

    #[event]
    struct TransferExecuted has drop, store {
        from: address, to: address, amount: u64, btc_price: u128,
    }

    // Only allow transfer if BTC/USDT price is above threshold
    public entry fun price_gated_transfer(
        sender: &signer,
        recipient: address,
        amount: u64,
        min_btc_price: u128,
    ) {
        // Fetch BTC/USDT - pair index 0 (verify at oracle docs)
        // Returns (price, decimal, timestamp)
        let (price, _decimal, _timestamp) = oracle::get_price(0);

        assert!(price >= min_btc_price, E_PRICE_TOO_LOW);

        coin::transfer<SupraCoin>(sender, recipient, amount);

        event::emit(TransferExecuted {
            from: signer::address_of(sender),
            to: recipient,
            amount,
            btc_price: price,
        });
    }

    #[view]
    public fun get_btc_price(): u128 {
        let (price, _decimal, _timestamp) = oracle::get_price(0);
        price
    }
}
```

**Docs:** https://docs.supra.com/oracles/data-feeds/push-oracle

---

## 3. Native Automation - Schedule Contract Execution

Supra Automation registers a Move entry function to run automatically each block.
**The condition lives INSIDE your function** - not in an external script.

No bots, no keepers - validators execute it directly.

### Automation-Compatible Contract

```move
module my_module::auto_tasks {
    use supra_framework::supra_coin::SupraCoin;
    use supra_framework::coin;
    use std::signer;

    // Auto top-up: refill wallet when balance drops below threshold.
    // Register this with Supra Automation via CLI.
    // Condition is checked inside the function - exits cleanly if not met.
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
        // If condition is false, exits cleanly - no abort
    }
}
```

### Register Task via CLI

Use the **dedicated `supra move automation register` subcommand** - do NOT use `supra move tool run` for automation registration.

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

Dry-run before committing:
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

### Key Parameters
| Flag | Description |
|---|---|
| `--task-max-gas-amount` | Max gas units the task may consume per execution |
| `--task-gas-price-cap` | Skip execution if network gas price exceeds this |
| `--task-automation-fee-cap` | Max automation fee per epoch |
| `--task-expiry-time-secs` | Unix timestamp when the task stops |
| `--function-id` | Full function path: `"address::module::function"` |
| `--args` | BCS-typed args: `address:0x...`, `U64:1000`, etc. |
| `--simulate` | Dry-run - validate without submitting |

**Docs:** https://docs.supra.com/automation/getting-started

---

## 4. SupraNova Bridge

Transfer assets across chains. Two technologies:
- **HyperNova** - Trustless, uses source chain consensus
- **Hyperloop** - Fast multi-sig for L2s and high-latency chains

**Docs:** https://docs.supra.com/supranova

---

## Summary

| Feature | Pattern | Requires Setup? |
|---|---|---|
| dVRF | Request - Callback (async) | - Wallet + contract whitelisting |
| Oracles | Synchronous on-chain read | - Verify pair indices in docs |
| Automation | Entry function + CLI registration | - Gas caps + expiry required |
| Bridge | SupraNova protocol | - See bridge docs |
