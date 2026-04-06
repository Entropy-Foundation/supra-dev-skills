/// Basic Supra Move Module Template
/// 
/// This is a simple counter contract demonstrating:
/// - Module structure
/// - Struct with key ability (on-chain storage)
/// - Entry functions (callable via transactions)
/// - Global storage operations
/// - Error handling
/// - Events
///
/// Deploy: supra move tool publish --package-dir /supra/move_workspace/myProject --rpc-url https://rpc-testnet.supra.com

module my_module::counter {
    use supra_framework::event;
    use std::signer;

    // ============================================================
    // Error Codes
    // ============================================================
    const E_NOT_INITIALIZED: u64 = 1;
    const E_ALREADY_INITIALIZED: u64 = 2;
    const E_NOT_ADMIN: u64 = 3;

    // ============================================================
    // On-chain Data Structures
    // All structs stored on-chain must have `key` ability
    // ============================================================
    struct Counter has key {
        value: u64,
        admin: address,
    }

    // ============================================================
    // Events
    // ============================================================
    #[event]
    struct CounterIncremented has drop, store {
        new_value: u64,
        incremented_by: address,
    }

    #[event]
    struct CounterReset has drop, store {
        reset_by: address,
    }

    // ============================================================
    // Entry Functions (callable from transactions)
    // ============================================================

    /// Initialize the counter — must be called once before using
    public entry fun initialize(admin: &signer) {
        let admin_addr = signer::address_of(admin);

        // Prevent re-initialization
        assert!(!exists<Counter>(admin_addr), E_ALREADY_INITIALIZED);

        // Store counter on-chain at admin's address
        move_to(admin, Counter {
            value: 0,
            admin: admin_addr,
        });
    }

    /// Increment the counter by 1
    public entry fun increment(caller: &signer) acquires Counter {
        let caller_addr = signer::address_of(caller);

        // Counter must exist
        assert!(exists<Counter>(caller_addr), E_NOT_INITIALIZED);

        // Borrow mutably and update
        let counter = borrow_global_mut<Counter>(caller_addr);
        counter.value = counter.value + 1;

        // Emit event
        event::emit(CounterIncremented {
            new_value: counter.value,
            incremented_by: caller_addr,
        });
    }

    /// Increment by a custom amount
    public entry fun increment_by(caller: &signer, amount: u64) acquires Counter {
        let caller_addr = signer::address_of(caller);
        assert!(exists<Counter>(caller_addr), E_NOT_INITIALIZED);

        let counter = borrow_global_mut<Counter>(caller_addr);
        counter.value = counter.value + amount;

        event::emit(CounterIncremented {
            new_value: counter.value,
            incremented_by: caller_addr,
        });
    }

    /// Reset counter to 0 — only admin can call
    public entry fun reset(admin: &signer) acquires Counter {
        let admin_addr = signer::address_of(admin);
        assert!(exists<Counter>(admin_addr), E_NOT_INITIALIZED);

        let counter = borrow_global_mut<Counter>(admin_addr);
        assert!(counter.admin == admin_addr, E_NOT_ADMIN);
        counter.value = 0;

        event::emit(CounterReset { reset_by: admin_addr });
    }

    // ============================================================
    // View Functions (read-only, no state change)
    // ============================================================

    #[view]
    public fun get_value(addr: address): u64 acquires Counter {
        assert!(exists<Counter>(addr), E_NOT_INITIALIZED);
        borrow_global<Counter>(addr).value
    }

    #[view]
    public fun is_initialized(addr: address): bool {
        exists<Counter>(addr)
    }
}
