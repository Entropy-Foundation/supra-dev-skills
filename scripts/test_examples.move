/// Supra Move — Testing Patterns
///
/// Demonstrates:
/// - Unit test setup with #[test]
/// - Using test accounts with #[test(account = @0xcafe)]
/// - Expected failure tests with #[expected_failure]
/// - Testing entry functions end-to-end
///
/// Run tests: supra move tool test --package-dir /supra/move_workspace/myProject

#[test_only]
module my_module::counter_tests {
    use my_module::counter;
    use supra_framework::account;

    // ============================================================
    // Test: Initialize counter successfully
    // ============================================================
    #[test(admin = @0xCAFE)]
    public fun test_initialize(admin: signer) {
        // Create a test account
        account::create_account_for_test(std::signer::address_of(&admin));

        // Initialize the counter
        counter::initialize(&admin);

        // Verify it's initialized
        assert!(counter::is_initialized(std::signer::address_of(&admin)), 0);
        assert!(counter::get_value(std::signer::address_of(&admin)) == 0, 1);
    }

    // ============================================================
    // Test: Increment counter
    // ============================================================
    #[test(admin = @0xCAFE)]
    public fun test_increment(admin: signer) {
        account::create_account_for_test(std::signer::address_of(&admin));
        counter::initialize(&admin);

        // Increment 3 times
        counter::increment(&admin);
        counter::increment(&admin);
        counter::increment(&admin);

        // Value should be 3
        assert!(counter::get_value(std::signer::address_of(&admin)) == 3, 0);
    }

    // ============================================================
    // Test: Increment by custom amount
    // ============================================================
    #[test(admin = @0xCAFE)]
    public fun test_increment_by(admin: signer) {
        account::create_account_for_test(std::signer::address_of(&admin));
        counter::initialize(&admin);

        counter::increment_by(&admin, 50);
        assert!(counter::get_value(std::signer::address_of(&admin)) == 50, 0);

        counter::increment_by(&admin, 25);
        assert!(counter::get_value(std::signer::address_of(&admin)) == 75, 1);
    }

    // ============================================================
    // Test: Reset counter
    // ============================================================
    #[test(admin = @0xCAFE)]
    public fun test_reset(admin: signer) {
        account::create_account_for_test(std::signer::address_of(&admin));
        counter::initialize(&admin);

        counter::increment_by(&admin, 100);
        assert!(counter::get_value(std::signer::address_of(&admin)) == 100, 0);

        counter::reset(&admin);
        assert!(counter::get_value(std::supra::address_of(&admin)) == 0, 1);
    }

    // ============================================================
    // Test: Expected failure — double initialization
    // ============================================================
    #[test(admin = @0xCAFE)]
    #[expected_failure(abort_code = 2)] // E_ALREADY_INITIALIZED = 2
    public fun test_double_init_fails(admin: signer) {
        account::create_account_for_test(std::signer::address_of(&admin));

        counter::initialize(&admin);
        counter::initialize(&admin); // Should abort here
    }

    // ============================================================
    // Test: Expected failure — increment without init
    // ============================================================
    #[test(user = @0xBEEF)]
    #[expected_failure(abort_code = 1)] // E_NOT_INITIALIZED = 1
    public fun test_increment_without_init_fails(user: signer) {
        account::create_account_for_test(std::signer::address_of(&user));
        counter::increment(&user); // Should abort — not initialized
    }

    // ============================================================
    // Test: Multiple users have independent counters
    // ============================================================
    #[test(user1 = @0xCAFE, user2 = @0xBEEF)]
    public fun test_independent_counters(user1: signer, user2: signer) {
        account::create_account_for_test(std::signer::address_of(&user1));
        account::create_account_for_test(std::signer::address_of(&user2));

        counter::initialize(&user1);
        counter::initialize(&user2);

        // user1 increments 5 times
        counter::increment_by(&user1, 5);

        // user2 increments 10 times
        counter::increment_by(&user2, 10);

        // Each counter is independent
        assert!(counter::get_value(std::signer::address_of(&user1)) == 5, 0);
        assert!(counter::get_value(std::signer::address_of(&user2)) == 10, 1);
    }
}
