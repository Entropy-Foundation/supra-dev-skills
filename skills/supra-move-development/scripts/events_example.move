// Supra Move - Events & Data Storage Patterns
//
// Demonstrates:
// - Emitting events with event::emit
// - Using vectors to store collections
// - Reading resource data with borrow_global
// - Common storage patterns

module my_module::registry {
    use supra_framework::event;
    use std::signer;
    use std::vector;
    use std::string::{Self, String};

    // ============================================================
    // Error Codes
    // ============================================================
    const E_NOT_INITIALIZED: u64 = 1;
    const E_ALREADY_REGISTERED: u64 = 2;

    // ============================================================
    // On-chain Data
    // -- vector is used here to demonstrate events and basic storage patterns.
    // For registries expected to exceed ~100 members, use SmartTable instead:
    //   members: SmartTable<address, String>  - O(1) lookup, gas stays flat
    // See references/patterns.md Section 1 for the SmartTable pattern.
    // ============================================================
    struct Registry has key {
        members: vector<address>,
        names: vector<String>,
        // No count field: vector::length(&members) is the count. A stored
        // counter only adds gas and a desync bug (see SKILL.md, DATA STRUCTURES).
    }

    // ============================================================
    // Events
    // ============================================================
    #[event]
    struct MemberRegistered has drop, store {
        member: address,
        name: String,
        total_members: u64,
    }

    #[event]
    struct RegistryCreated has drop, store {
        creator: address,
    }

    // ============================================================
    // Entry Functions
    // ============================================================

    // Create the registry
    public entry fun create_registry(admin: &signer) {
        let admin_addr = signer::address_of(admin);
        assert!(!exists<Registry>(admin_addr), E_ALREADY_REGISTERED);

        move_to(admin, Registry {
            members: vector::empty(),
            names: vector::empty(),
        });

        event::emit(RegistryCreated { creator: admin_addr });
    }

    // Register a new member
    public entry fun register(
        admin: &signer,
        new_member: address,
        name: vector<u8>
    ) acquires Registry {
        let admin_addr = signer::address_of(admin);
        assert!(exists<Registry>(admin_addr), E_NOT_INITIALIZED);

        let registry = borrow_global_mut<Registry>(admin_addr);

        // Add member
        vector::push_back(&mut registry.members, new_member);
        vector::push_back(&mut registry.names, string::utf8(name));

        // Emit event
        event::emit(MemberRegistered {
            member: new_member,
            name: string::utf8(name),
            total_members: vector::length(&registry.members),
        });
    }

    // ============================================================
    // View Functions
    // ============================================================

    #[view]
    public fun get_member_count(registry_addr: address): u64 acquires Registry {
        assert!(exists<Registry>(registry_addr), E_NOT_INITIALIZED);
        vector::length(&borrow_global<Registry>(registry_addr).members)
    }

    #[view]
    public fun is_member(registry_addr: address, member: address): bool acquires Registry {
        assert!(exists<Registry>(registry_addr), E_NOT_INITIALIZED);
        let registry = borrow_global<Registry>(registry_addr);
        vector::contains(&registry.members, &member)
    }
}
