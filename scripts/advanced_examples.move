/// Supra Move — Advanced Patterns
///
/// Demonstrates:
/// - NFT / Digital Asset creation
/// - Advanced struct patterns
/// - Access control with admin roles
/// - Pausable contracts
/// - Multi-resource patterns

module my_module::advanced {
    use supra_framework::event;
    use supra_framework::signer;
    use supra_framework::timestamp;
    use std::vector;
    use std::string::{Self, String};

    // ============================================================
    // Error Codes
    // ============================================================
    const E_NOT_ADMIN: u64 = 1;
    const E_PAUSED: u64 = 2;
    const E_NOT_INITIALIZED: u64 = 3;
    const E_ALREADY_EXISTS: u64 = 4;
    const E_NOT_FOUND: u64 = 5;

    // ============================================================
    // Pattern 1: Admin + Pausable Contract
    // ============================================================
    struct AdminConfig has key {
        admin: address,
        paused: bool,
        created_at: u64,
    }

    #[event]
    struct ContractPaused has drop, store { by: address }

    #[event]
    struct ContractUnpaused has drop, store { by: address }

    public entry fun initialize_admin(admin: &signer) {
        let addr = signer::address_of(admin);
        assert!(!exists<AdminConfig>(addr), E_ALREADY_EXISTS);

        move_to(admin, AdminConfig {
            admin: addr,
            paused: false,
            created_at: timestamp::now_seconds(),
        });
    }

    public entry fun pause(admin: &signer) acquires AdminConfig {
        let addr = signer::address_of(admin);
        let config = borrow_global_mut<AdminConfig>(addr);
        assert!(config.admin == addr, E_NOT_ADMIN);
        config.paused = true;
        event::emit(ContractPaused { by: addr });
    }

    public entry fun unpause(admin: &signer) acquires AdminConfig {
        let addr = signer::address_of(admin);
        let config = borrow_global_mut<AdminConfig>(addr);
        assert!(config.admin == addr, E_NOT_ADMIN);
        config.paused = false;
        event::emit(ContractUnpaused { by: addr });
    }

    fun assert_not_paused(admin_addr: address) acquires AdminConfig {
        let config = borrow_global<AdminConfig>(admin_addr);
        assert!(!config.paused, E_PAUSED);
    }

    // ============================================================
    // Pattern 2: NFT / Unique Item Collection
    // ============================================================
    struct NFTItem has store {
        id: u64,
        name: String,
        description: String,
        owner: address,
        created_at: u64,
    }

    struct NFTCollection has key {
        items: vector<NFTItem>,
        next_id: u64,
        total_minted: u64,
    }

    #[event]
    struct NFTMinted has drop, store {
        id: u64,
        name: String,
        owner: address,
    }

    #[event]
    struct NFTTransferred has drop, store {
        id: u64,
        from: address,
        to: address,
    }

    public entry fun create_collection(admin: &signer) {
        let addr = signer::address_of(admin);
        assert!(!exists<NFTCollection>(addr), E_ALREADY_EXISTS);

        move_to(admin, NFTCollection {
            items: vector::empty(),
            next_id: 1,
            total_minted: 0,
        });
    }

    public entry fun transfer_nft(
        admin: &signer,
        nft_id: u64,
        new_owner: address,
    ) acquires NFTCollection {
        let admin_addr = signer::address_of(admin);
        assert!(exists<NFTCollection>(admin_addr), E_NOT_INITIALIZED);

        let collection = borrow_global_mut<NFTCollection>(admin_addr);
        let len = vector::length(&collection.items);
        let i = 0u64;
        while (i < len) {
            let item = vector::borrow_mut(&mut collection.items, i);
            if (item.id == nft_id) {
                let old_owner = item.owner;
                item.owner = new_owner;
                event::emit(NFTTransferred { id: nft_id, from: old_owner, to: new_owner });
                return
            };
            i = i + 1;
        };
        assert!(false, E_NOT_FOUND);
    }

    public entry fun mint_nft(
        admin: &signer,
        recipient: address,
        name: vector<u8>,
        description: vector<u8>,
    ) acquires NFTCollection {
        let admin_addr = signer::address_of(admin);
        assert!(exists<NFTCollection>(admin_addr), E_NOT_INITIALIZED);

        let collection = borrow_global_mut<NFTCollection>(admin_addr);
        let id = collection.next_id;
        let name_str = string::utf8(name);

        vector::push_back(&mut collection.items, NFTItem {
            id,
            name: name_str,
            description: string::utf8(description),
            owner: recipient,
            created_at: timestamp::now_seconds(),
        });

        collection.next_id = id + 1;
        collection.total_minted = collection.total_minted + 1;

        event::emit(NFTMinted { id, name: name_str, owner: recipient });
    }

    // ============================================================
    // Pattern 3: Timelock (action only after delay)
    // ============================================================
    struct TimelockAction has key {
        unlock_time: u64,
        action_data: u64,
        executed: bool,
    }

    public entry fun create_timelock(
        admin: &signer,
        delay_seconds: u64,
        action_data: u64,
    ) {
        let unlock_time = timestamp::now_seconds() + delay_seconds;
        move_to(admin, TimelockAction {
            unlock_time,
            action_data,
            executed: false,
        });
    }

    public entry fun execute_timelock(admin: &signer) acquires TimelockAction {
        let addr = signer::address_of(admin);
        let action = borrow_global_mut<TimelockAction>(addr);

        assert!(!action.executed, E_ALREADY_EXISTS);
        assert!(timestamp::now_seconds() >= action.unlock_time, E_PAUSED);

        action.executed = true;
        // Execute action_data logic here...
    }

    // ============================================================
    // View Functions
    // ============================================================

    #[view]
    public fun get_total_minted(collection_addr: address): u64 acquires NFTCollection {
        assert!(exists<NFTCollection>(collection_addr), E_NOT_INITIALIZED);
        borrow_global<NFTCollection>(collection_addr).total_minted
    }

    #[view]
    public fun is_paused(admin_addr: address): bool acquires AdminConfig {
        assert!(exists<AdminConfig>(admin_addr), E_NOT_INITIALIZED);
        borrow_global<AdminConfig>(admin_addr).paused
    }

    #[view]
    public fun get_timelock_remaining(addr: address): u64 acquires TimelockAction {
        let action = borrow_global<TimelockAction>(addr);
        let now = timestamp::now_seconds();
        if (now >= action.unlock_time) { 0 }
        else { action.unlock_time - now }
    }
}
