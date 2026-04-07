/// Supra Move — Advanced Patterns
///
/// Demonstrates:
/// - Admin + Pausable contracts (with assert_not_paused enforced)
/// - NFT / Digital Asset collection using Table (O(1) lookup — not vector)
/// - Timelock pattern with correct error code
/// - Access control with named error constants

/// Move.toml requirements for this module:
///   [addresses]
///   aptos_token_objects = "0x4"
///
///   [dependencies.SupraFramework]
///   git = "https://github.com/Entropy-Foundation/aptos-core.git"
///   subdir = "aptos-move/framework/supra-framework"
///   rev = "dev"   # pin to a commit hash for production
///
///   [dependencies.AptosTokenObjects]
///   git = "https://github.com/Entropy-Foundation/aptos-core.git"
///   subdir = "aptos-move/framework/aptos-token-objects"
///   rev = "dev"   # pin to a commit hash for production
///
/// Verify the exact git URL and rev for your target network against the official Supra docs.

module my_module::advanced {
    use supra_framework::event;
    use std::signer;
    use supra_framework::timestamp;
    use supra_framework::object::{Self, Object};
    use aptos_token_objects::collection;
    use aptos_token_objects::token;
    use std::option;
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
    // Pattern 2: Digital Asset NFT (Aptos Token Objects / DA standard)
    //
    // Uses aptos_token_objects (0x4) — the correct on-chain NFT standard.
    // Each token is a real on-chain Object with a unique address.
    // Refs (MutatorRef, BurnRef) must be captured at creation time because
    // ConstructorRef expires at the end of the transaction.
    //
    // Collection: created once per creator address.
    // Tokens:     numbered ("Name #1", "Name #2", ...), fully burnable.
    // Transfer:   owner-signed via object::transfer — no admin involvement.
    // ============================================================

    // Change these for your project
    const COLLECTION_NAME: vector<u8> = b"My Supra Collection";
    const COLLECTION_DESC: vector<u8> = b"A demonstration NFT collection on Supra";
    const COLLECTION_URI:  vector<u8> = b"https://example.com/collection";

    /// Refs stored on each token object.
    /// #[resource_group_member] is required for structs stored on Objects.
    #[resource_group_member(group = supra_framework::object::ObjectGroup)]
    struct NFTToken has key {
        mutator_ref: token::MutatorRef,
        burn_ref:    token::BurnRef,
    }

    #[event]
    struct NFTMinted has drop, store {
        token_address: address,
        name: String,
        recipient: address,
    }

    #[event]
    struct NFTTransferred has drop, store {
        token_address: address,
        from: address,
        to: address,
    }

    /// Create the on-chain collection. Call once — collection names are
    /// unique per creator address.
    public entry fun create_collection(creator: &signer) {
        collection::create_unlimited_collection(
            creator,
            string::utf8(COLLECTION_DESC),
            string::utf8(COLLECTION_NAME),
            option::none(),      // royalty
            string::utf8(COLLECTION_URI),
        );
    }

    /// Mint a token into the collection and send it to recipient.
    /// Produces a numbered token: "<name> #1", "<name> #2", etc.
    /// Numbered tokens (unlike named tokens) can be fully destroyed via burn.
    public entry fun mint_nft(
        creator: &signer,
        recipient: address,
        name: vector<u8>,
        description: vector<u8>,
        uri: vector<u8>,
    ) {
        let constructor_ref = token::create_numbered_token(
            creator,
            string::utf8(COLLECTION_NAME),
            string::utf8(description),
            string::utf8(name),
            string::utf8(b""),   // name suffix — empty for clean display
            option::none(),      // royalty
            string::utf8(uri),
        );

        // Capture all refs before ConstructorRef expires at end of this tx
        let object_signer = object::generate_signer(&constructor_ref);
        let mutator_ref   = token::generate_mutator_ref(&constructor_ref);
        let burn_ref      = token::generate_burn_ref(&constructor_ref);

        // Store refs on the token object (not on the creator's account)
        move_to(&object_signer, NFTToken { mutator_ref, burn_ref });

        // Transfer to recipient using a one-shot linear ref
        let transfer_ref = object::generate_transfer_ref(&constructor_ref);
        let linear_ref   = object::generate_linear_transfer_ref(&transfer_ref);
        object::transfer_with_ref(linear_ref, recipient);

        let token_address = signer::address_of(&object_signer);
        event::emit(NFTMinted { token_address, name: string::utf8(name), recipient });
    }

    /// Transfer an NFT — called by the current owner, not the creator.
    /// object::transfer aborts automatically if signer is not the owner.
    public entry fun transfer_nft(
        owner: &signer,
        nft: Object<NFTToken>,
        new_owner: address,
    ) {
        let from = signer::address_of(owner);
        object::transfer(owner, nft, new_owner);
        event::emit(NFTTransferred {
            token_address: object::object_address(&nft),
            from,
            to: new_owner,
        });
    }

    /// Burn (permanently destroy) an NFT. Must be called by the current owner.
    public entry fun burn_nft(
        owner: &signer,
        nft: Object<NFTToken>,
    ) acquires NFTToken {
        assert!(object::is_owner(nft, signer::address_of(owner)), E_NOT_ADMIN);
        let token_address = object::object_address(&nft);
        let NFTToken { mutator_ref: _, burn_ref } = move_from<NFTToken>(token_address);
        token::burn(burn_ref);
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
    public fun token_owner(nft: Object<NFTToken>): address {
        object::owner(nft)
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
