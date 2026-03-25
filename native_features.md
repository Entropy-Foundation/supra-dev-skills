# Supra Native Features Guide

Supra has built-in features that most blockchains don't have natively. These are directly integrated into the chain.

---

## 1. dVRF — On-Chain Verifiable Randomness

Supra provides **native randomness** — no external services needed.

### Add to Move.toml
```toml
[dependencies.SupraVrf]
git = "https://github.com/Entropy-Foundation/vrf-interface"
```

### Use in Move Contract
```move
module my_module::lottery {
    use supra_framework::event;
    use supra_vrf::vrf;

    struct LotteryResult has key {
        winner: address,
        random_number: u64,
    }

    #[event]
    struct WinnerPicked has drop, store {
        winner: address,
        number: u64,
    }

    public entry fun pick_winner(
        admin: &signer,
        participants: vector<address>
    ) {
        // Get verifiable random number
        let random = vrf::random_u64();
        let len = vector::length(&participants);
        let winner_index = random % len;
        let winner = *vector::borrow(&participants, winner_index);

        move_to(admin, LotteryResult {
            winner,
            random_number: random,
        });

        event::emit(WinnerPicked { winner, number: random });
    }
}
```

### Docs
- Full guide: https://docs.supra.com/oracles/dvrf/v2-guide

---

## 2. Native Oracles — Real-Time Price Feeds

Access real-time, multi-source price data directly in your contracts. No external calls needed.

### Use in Move Contract
```move
module my_module::price_checker {
    use supra_framework::event;
    // Oracle access via supra push oracle
    
    #[event]
    struct PriceFetched has drop, store {
        pair: vector<u8>,
        price: u128,
    }

    public entry fun check_price(caller: &signer) {
        // Price feeds available for BTC/USDT, ETH/USDT, SUPRA/USDT, etc.
        // See docs for full list of available pairs
        event::emit(PriceFetched {
            pair: b"BTC_USDT",
            price: 0, // fetched from oracle
        });
    }
}
```

### Available Price Pairs
Common pairs available: BTC/USDT, ETH/USDT, SUPRA/USDT, and many more.

### Docs
- Data Feeds: https://docs.supra.com/oracles/data-feeds/push-oracle

---

## 3. Native Automation — Schedule Contract Execution

Supra lets you **schedule smart contract calls** without external keepers or bots. Built directly into the execution layer.

### Use Cases
- Automated liquidations in DeFi
- Recurring payments
- Portfolio rebalancing
- Yield harvesting
- Time-locked releases

### How it Works
```move
module my_module::auto_task {
    use supra_framework::automation;

    /// Register an automation task
    public entry fun register_task(
        admin: &signer,
        interval_seconds: u64,
    ) {
        // Schedule a function to run every `interval_seconds`
        // No external keepers needed
        automation::register(
            admin,
            interval_seconds,
            // function to call
        );
    }
}
```

### Docs
- Automation guide: https://docs.supra.com/automation

---

## 4. SupraNova Bridge — Cross-Chain Transfers

Transfer assets and messages between Supra and other blockchains.

### Two Bridge Technologies

**HyperNova** — Trustless bridge
- Uses source chain's consensus for verification
- Best for: chains where trustless bridging is feasible

**Hyperloop** — Fast multi-sig bridge
- Game-theoretically secure
- Best for: L2 chains or chains where HyperNova has high latency

### Docs
- Bridge guide: https://docs.supra.com/supranova

---

## Summary Table

| Feature | What it does | Replaces |
|---|---|---|
| dVRF | On-chain randomness | Chainlink VRF, external RNG |
| Oracles | Real-time price feeds | Chainlink Data Feeds |
| Automation | Scheduled execution | Gelato, Chainlink Automation, bots |
| SupraNova Bridge | Cross-chain transfers | External bridges like Wormhole |

All of these are **native** to Supra — no external dependencies required! ✅
