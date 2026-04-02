/// Supra Move — Advanced Patterns
///
/// Demonstrates:
/// - Admin + Pausable contracts (with assert_not_paused enforced)
/// - NFT / Digital Asset collection using Table (O(1) lookup — not vector)
/// - Timelock pattern with correct error code
/// - Access control with named error constants

module my_module::advanced {
    use supra_framework::event;
    use supra_framework::signer;
    use supra_framework::timestamp;
    use aptos_std::table::{Self, Table};
    use std::string::{Self, String};

    // ============================================================
    // Error Codes
    // ============================================================
    const E_NOT_ADMIN: u64 = 1;
    const E_PAUSED: u64 = 2;
    const E_NOT_INITIALIZED: u64 = 3;
    const E_ALREADY_EXISTS: u64 = 4;
    const E_NOT_FOUND: u64 = 5;
    const E_TIMELOCK_NOT_READY: u64 = 6;
    const E_ALREADY_EXECUTED: u64 = 7;  // distinct from E_ALREADY_EXISTS

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

    /// Internal guard — call this inside any entry function that should
    /// be blocked while paused. Pass the admin's address explicitly.
    fun assert_not_paused(admin_addr: address) acquires AdminConfig {
        let config = borrow_global<AdminConfig>(admin_addr);
        assert!(!config.paused, E_PAUSED);
    }

    // ============================================================
    // Pattern 2: NFT Collection using Table (O(1) lookup)
    //
    // KEY LESSON: Use Table<u64, NFTItem> keyed by ID — NOT vector<NFTItem>.
    // A vector requires O(n) scan for transfer/lookup.
    // Table gives O(1) access and scales to millions of NFTs.
    // ============================================================
    struct NFTItem has store {
        id: u64,
        name: String,
        description: String,
        owner: address,
        created_at: u64,
    }

    struct NFTCollection has key {
        items: Table<u64, NFTItem>,  // key = NFT ID
        next_id: u64,
        total_minted: u64,
        admin: address,
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
            items: table::new(),
            next_id: 1,
            total_minted: 0,
            admin: addr,
        });
    }

    public entry fun mint_nft(
        admin: &signer,
        recipient: address,
        name: vector<u8>,
        description: vector<u8>,
    ) acquires NFTCollection, AdminConfig {
        let admin_addr = signer::address_of(admin);
        assert!(exists<NFTCollection>(admin_addr), E_NOT_INITIALIZED);

        // Block if contract is paused
        assert_not_paused(admin_addr);

        let collection = borrow_global_mut<NFTCollection>(admin_addr);
        assert!(collection.admin == admin_addr, E_NOT_ADMIN);

        let id = collection.next_id;
        let name_str = string::utf8(name);

        table::add(&mut collection.items, id, NFTItem {
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

    /// Transfer NFT — O(1) lookup via Table, no linear scan
    public entry fun transfer_nft(
        admin: &signer,
        nft_id: u64,
        new_owner: address,
    ) acquires NFTCollection, AdminConfig {
        let admin_addr = signer::address_of(admin);
        assert!(exists<NFTCollection>(admin_addr), E_NOT_INITIALIZED);

        // Block if contract is paused
        assert_not_paused(admin_addr);

        let collection = borrow_global_mut<NFTCollection>(admin_addr);
        assert!(table::contains(&collection.items, nft_id), E_NOT_FOUND);

        let item = table::borrow_mut(&mut collection.items, nft_id);
        // Only the NFT's current owner may transfer it.
        // In production: separate collection_addr from the signer so any user
        // can hold and transfer NFTs from a shared collection.
        assert!(item.owner == admin_addr, E_NOT_ADMIN);
        let old_owner = item.owner;
        item.owner = new_owner;

        event::emit(NFTTransferred { id: nft_id, from: old_owner, to: new_owner });
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

        assert!(!action.executed, E_ALREADY_EXECUTED);
        // E_TIMELOCK_NOT_READY — semantically correct; E_PAUSED would be wrong here
        assert!(timestamp::now_seconds() >= action.unlock_time, E_TIMELOCK_NOT_READY);

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

    #[view]
    public fun nft_owner(collection_addr: address, nft_id: u64): address acquires NFTCollection {
        let collection = borrow_global<NFTCollection>(collection_addr);
        assert!(table::contains(&collection.items, nft_id), E_NOT_FOUND);
        table::borrow(&collection.items, nft_id).owner
    }
}
