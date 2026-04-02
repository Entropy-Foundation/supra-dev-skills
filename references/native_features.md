# Supra Native Features Guide

Supra has built-in features that most blockchains don't have natively.

---

## 1. dVRF — On-Chain Verifiable Randomness

Supra dVRF uses a **request/callback** pattern — NOT a synchronous call.
You request randomness, and Supra calls back your contract with the result.

> ⚠️ **Important:** dVRF requires whitelisting. Submit a request:
> https://forms.gle/WFvpBXg67GmDrokv5
> Minimum deposit amount: check current requirements at https://docs.supra.com/dvrf/build-supra-l1/v2-guide (the deposit covers callback gas costs and may change).

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

### Full dVRF Example

```move
module my_module::lottery {
    use aptos_std::table;
    use supra_addr::supra_vrf;
    use std::string;
    use supra_framework::event;
    use supra_framework::signer;

    struct RandomNumberList has key {
        random_numbers: table::Table<u64, vector<u256>>,
    }

    #[event]
    struct RandomnessRequested has drop, store { nonce: u64, requester: address }

    #[event]
    struct RandomnessReceived has drop, store { nonce: u64, count: u64 }

    fun init_module(sender: &signer) {
        move_to(sender, RandomNumberList { random_numbers: table::new() });
    }

    // Step 1: Request randomness — Supra will call `distribute` as callback
    public entry fun rng_request(
        sender: &signer,
        rng_count: u8,         // how many random numbers (max 255)
        client_seed: u64,      // extra entropy, 0 is fine
        num_confirmations: u64 // block confirmations before callback fires
    ) acquires RandomNumberList {
        let callback_address  = @my_module;
        let callback_module   = string::utf8(b"lottery");
        let callback_function = string::utf8(b"distribute");

        let nonce = supra_vrf::rng_request(
            sender, callback_address, callback_module,
            callback_function, rng_count, client_seed, num_confirmations,
        );

        let list = borrow_global_mut<RandomNumberList>(@my_module);
        table::add(&mut list.random_numbers, nonce, vector[]);

        event::emit(RandomnessRequested { nonce, requester: signer::address_of(sender) });
    }

    // Step 2: Callback — Supra calls this automatically with the random result
    // Must be a public entry function with exactly these 6 parameters
    public entry fun distribute(
        nonce: u64,
        message: vector<u8>,
        signature: vector<u8>,
        caller_address: address,
        rng_count: u8,
        client_seed: u64,
    ) acquires RandomNumberList {
        // Verify callback is genuine and extract verified random numbers
        let verified_nums: vector<u256> = supra_vrf::verify_callback(
            nonce, message, signature, caller_address, rng_count, client_seed,
        );

        let list = borrow_global_mut<RandomNumberList>(@my_module);
        let slot = table::borrow_mut(&mut list.random_numbers, nonce);
        *slot = verified_nums;

        event::emit(RandomnessReceived { nonce, count: (rng_count as u64) });
    }

    #[view]
    public fun get_random_numbers(nonce: u64): vector<u256> acquires RandomNumberList {
        let list = borrow_global<RandomNumberList>(@my_module);
        *table::borrow(&list.random_numbers, nonce)
    }
}
```

### CLI

```bash
# Request 1 random number
supra move tool run \
  --function-id 'my_module::lottery::rng_request' \
  --args u8:1 u64:0 u64:1 \
  --profile myAccount \
  --rpc-url https://rpc-testnet.supra.com

# View result by nonce (read-only, no --profile needed)
supra move tool view \
  --function-id 'my_module::lottery::get_random_numbers' \
  --args u64:0 \
  --rpc-url https://rpc-testnet.supra.com

# ── Whitelist & Deposit ─────────────────────────────────────────────
# ⚠️  'deposit::' is NOT a valid function-id prefix.
# A full function-id requires: <deployed_address>::<module>::<function>
# Get the deployed address of the VRF deposit contract from:
# https://docs.supra.com/dvrf/build-supra-l1/v2-guide
#
# Example (replace DEPOSIT_CONTRACT_ADDRESS with the real address):
supra move tool run \
  --function-id '<DEPOSIT_CONTRACT_ADDRESS>::deposit::add_contract_to_whitelist' \
  --args address:<YOUR_CONTRACT_ADDRESS> \
  --profile myAccount \
  --rpc-url https://rpc-testnet.supra.com

supra move tool run \
  --function-id '<DEPOSIT_CONTRACT_ADDRESS>::deposit::deposit_fund' \
  --args u64:1000000000 \
  --profile myAccount \
  --rpc-url https://rpc-testnet.supra.com
```

**Docs:** https://docs.supra.com/dvrf/build-supra-l1/v2-guide

---

## 2. Native Oracles — Real-Time Price Feeds

Each price pair has a numeric **pair index** (e.g. BTC_USDT = 0, ETH_USDT = 1).
Confirm exact indices at: https://docs.supra.com/oracles/data-feeds/push-oracle

### Price-Gated Transfer Example

```move
module my_module::price_gated {
    use supra_framework::supra_coin::SupraCoin;
    use supra_framework::coin;
    use supra_framework::signer;
    use supra_framework::event;
    // Confirm exact oracle module path at oracle docs
    use supra_oracle::oracle;

    const E_PRICE_TOO_LOW: u64 = 1;

    #[event]
    struct TransferExecuted has drop, store {
        from: address, to: address, amount: u64, btc_price: u128,
    }

    /// Only allow transfer if BTC/USDT price is above threshold
    public entry fun price_gated_transfer(
        sender: &signer,
        recipient: address,
        amount: u64,
        min_btc_price: u128,
    ) {
        // Fetch BTC/USDT — pair index 0 (verify at oracle docs)
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

## 3. Native Automation — Schedule Contract Execution

Supra Automation registers a Move entry function to run automatically each block.
**The condition lives INSIDE your function** — not in an external script.

No bots, no keepers — validators execute it directly.

### Automation-Compatible Contract

```move
module my_module::auto_tasks {
    use supra_framework::supra_coin::SupraCoin;
    use supra_framework::coin;
    use supra_framework::signer;

    /// Auto top-up: refill wallet when balance drops below threshold.
    /// Register this with Supra Automation via CLI.
    /// Condition is checked inside the function — exits cleanly if not met.
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
        // If condition is false, exits cleanly — no abort
    }
}
```

### Register Task via CLI

Use the **dedicated `supra move automation register` subcommand** — do NOT use `supra move tool run` for automation registration.

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
| `--simulate` | Dry-run — validate without submitting |

**Docs:** https://docs.supra.com/automation/getting-started

---

## 4. SupraNova Bridge

Transfer assets across chains. Two technologies:
- **HyperNova** — Trustless, uses source chain consensus
- **Hyperloop** — Fast multi-sig for L2s and high-latency chains

**Docs:** https://docs.supra.com/supranova

---

## Summary

| Feature | Pattern | Requires Setup? |
|---|---|---|
| dVRF | Request → Callback (async) | ✅ Wallet + contract whitelisting |
| Oracles | Synchronous on-chain read | ✅ Verify pair indices in docs |
| Automation | Entry function + CLI registration | ✅ Gas caps + expiry required |
| Bridge | SupraNova protocol | ✅ See bridge docs |
