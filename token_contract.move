/// Supra Move — Simple Token / Coin Example
///
/// Demonstrates:
/// - Creating a custom coin on Supra
/// - Minting, transferring, and burning tokens
/// - Using supra_framework::coin module
///
/// Note: For FA (Fungible Asset) standard on Mainnet,
/// use coin_wrapper: https://github.com/Entropy-Foundation/aptos-core/blob/dev/aptos-move/move-examples/swap/sources/coin_wrapper.move

module my_module::my_token {
    use supra_framework::coin::{Self, BurnCapability, FreezeCapability, MintCapability};
    use supra_framework::signer;
    use std::string;

    // ============================================================
    // Token Metadata
    // ============================================================
    struct MyToken {}

    // ============================================================
    // Capabilities (stored by admin)
    // ============================================================
    struct TokenCapabilities has key {
        burn_cap: BurnCapability<MyToken>,
        freeze_cap: FreezeCapability<MyToken>,
        mint_cap: MintCapability<MyToken>,
    }

    // ============================================================
    // Initialize the Token
    // Must be called once by the deployer
    // ============================================================
    public entry fun initialize(admin: &signer) {
        let (burn_cap, freeze_cap, mint_cap) = coin::initialize<MyToken>(
            admin,
            string::utf8(b"My Token"),    // Token name
            string::utf8(b"MTK"),         // Token symbol
            8,                            // Decimals
            true,                         // Monitor supply
        );

        // Store capabilities with the admin
        move_to(admin, TokenCapabilities {
            burn_cap,
            freeze_cap,
            mint_cap,
        });
    }

    /// Mint tokens to a recipient
    public entry fun mint(
        admin: &signer,
        recipient: address,
        amount: u64
    ) acquires TokenCapabilities {
        let admin_addr = signer::address_of(admin);
        let caps = borrow_global<TokenCapabilities>(admin_addr);
        let coins = coin::mint<MyToken>(amount, &caps.mint_cap);
        coin::deposit<MyToken>(recipient, coins);
    }

    /// Transfer tokens between accounts
    public entry fun transfer(
        sender: &signer,
        recipient: address,
        amount: u64
    ) {
        coin::transfer<MyToken>(sender, recipient, amount);
    }

    /// Register to receive this token (must call before receiving)
    public entry fun register(account: &signer) {
        coin::register<MyToken>(account);
    }

    // ============================================================
    // View Functions
    // ============================================================

    #[view]
    public fun get_balance(addr: address): u64 {
        coin::balance<MyToken>(addr)
    }
}
