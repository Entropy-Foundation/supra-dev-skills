# Supra SDK Guide

---

## TypeScript SDK

### Install
```bash
npm install supra-ts-sdk           # latest (currently 1.0.0)
npm install supra-ts-sdk@1.0.0     # pin to known-good version for production
```

> -- `supra-ts-sdk` replaces the older `supra-l1-sdk`. Always check `npm show supra-ts-sdk version` for the current latest.
>
> `supra-ts-sdk` depends on `supra-l1-sdk-core` internally, so that package still appears in `npm ls` output. That is expected — never install or import it directly.

### Import
```typescript
import { SupraClient, Network, HexString, SupraAccount, BCS, TxnBuilderTypes } from "supra-ts-sdk";
```

`HexString`, `SupraAccount`, `BCS`, `TxnBuilderTypes`, and `TypeTagParser` are re-exported from `supra-l1-sdk-core` unchanged. Porting code that imported them directly from `supra-l1-sdk-core` or `supra-l1-sdk` is a one-word change to the import source.

### Initialize Client
```typescript
// Construction is synchronous - there is no `await SupraClient.init(...)`
const supra = new SupraClient({ network: Network.TESTNET });
const supra = new SupraClient({ network: Network.MAINNET });

// Custom RPC (chainId is required when you supply your own rpcUrl)
const supra = new SupraClient({ rpcUrl: "https://rpc-testnet.supra.com", chainId: 6 });
```

Network defaults: mainnet = chainId 8, testnet = chainId 6.

The client is namespaced. Each area of the API hangs off its own property: `supra.account`, `supra.coin`, `supra.faucet`, `supra.methods`, `supra.contract`, `supra.events`, `supra.block`, `supra.table`, `supra.fungibleAsset`, and `supra.transaction` (which itself carries `.build`, `.simulate`, `.submit`).

### Create / Load Account
```typescript
const account = new SupraAccount(
  Uint8Array.from(Buffer.from("YOUR_PRIVATE_KEY_HEX", "hex"))
);
const address: HexString = account.address();
```

### Fund from Faucet (Testnet Only)
```typescript
await supra.faucet.fundAccountWithFaucet({ accountAddress: account.address() });
```

### Read Balance
```typescript
// Returns bigint - Quants, not SUPRA
const balance = await supra.account.getAccountSupraCoinBalance({
  accountAddress: account.address(),
});
```

### Transfer SupraCoin (convenience method)
```typescript
// transferSupraCoin handles sequence numbers internally
const response = await supra.coin.transferSupraCoin({
  senderAccount: account,
  receiverAccountAddress: "RECEIVER_ADDRESS_HEX",
  amount: BigInt(1_000_000),   // Quants (1 SUPRA = 100_000_000 Quants)
  optionalTransactionArgs: {
    optionalTransactionPayloadArgs: { maxGas: BigInt(10000), gasUnitPrice: BigInt(100) },
  },
});
console.log("TX hash:", response.hash);
```

> -- The transaction hash field is `hash`. The old `supra-l1-sdk` called it `txHash`; that property does not exist here.

---

## Calling Contract Functions (State-Modifying)

Build a raw transaction, then submit it. `supra.transaction.build.rawTxnObject(...)` returns an `ExtendedRawTransaction` that carries its own `.simulate()`, `.submitTransaction()`, and `.toBytes()` — so the whole flow chains off one object.

```typescript
import { SupraClient, Network, SupraAccount, BCS, TxnBuilderTypes } from "supra-ts-sdk";

const supra   = new SupraClient({ network: Network.TESTNET });
const account = new SupraAccount(Uint8Array.from(Buffer.from("PRIVATE_KEY_HEX", "hex")));

// Step 1: Get current sequence number (increments with each transaction)
const accountInfo = await supra.account.getAccountInfo({ accountAddress: account.address() });

// Step 2: Build the transaction
// Calling: public entry fun register(admin: &signer, member: address, name: vector<u8>, score: u64)
const rawTxn = supra.transaction.build.rawTxnObject({
  senderAddress: account.address(),
  senderSequenceNumber: accountInfo.sequence_number,   // already a bigint
  function: "0xYOUR_CONTRACT_ADDRESS::registry::register",
  functionTypeArgs: [],                                // TypeTag[] - empty if no generic type params
  functionArgs: [
    // address argument
    BCS.bcsToBytes(TxnBuilderTypes.AccountAddress.fromHex("0xbeef")),
    // vector<u8> / string argument
    BCS.bcsSerializeStr("Alice"),
    // u64 argument
    BCS.bcsSerializeUint64(BigInt(100)),
  ],
});

// Step 3: Submit
const response = await rawTxn.submitTransaction({ senderAccount: account });
console.log("TX hash:", response.hash);
```

> -- `senderSequenceNumber` takes `accountInfo.sequence_number` directly. It is typed `bigint` in `supra-ts-sdk`; the old `BigInt(accountInfo.sequence_number)` wrapper existed because `supra-l1-sdk` returned a string.
>
> -- `rawTxnObject` is **synchronous** and takes the target as one `"address::module::function"` string, not three positional arguments.

### Plain values instead of BCS bytes

`supra.transaction.build.simple(...)` accepts ordinary JavaScript values and serializes them for you. It is `async` and takes the same shape otherwise:

```typescript
const rawTxn = await supra.transaction.build.simple({
  senderAddress: account.address(),
  senderSequenceNumber: accountInfo.sequence_number,
  function: "0xYOUR_CONTRACT_ADDRESS::registry::register",
  functionTypeArgs: [],
  functionArgs: ["0xbeef", "Alice", 100n],   // no manual BCS
});
```

Use `rawTxnObject` when you need exact control over the encoding, `simple` otherwise.

### BCS Encoding Reference

For `rawTxnObject`, whose `functionArgs` is `Uint8Array[]`. `BCS` and `TxnBuilderTypes` import from `supra-ts-sdk`.

| Move type | TypeScript |
|---|---|
| `address` | `BCS.bcsToBytes(TxnBuilderTypes.AccountAddress.fromHex("0x..."))` |
| `u8` | `BCS.bcsSerializeU8(42)` |
| `u64` | `BCS.bcsSerializeUint64(BigInt(1000))` |
| `u128` | `BCS.bcsSerializeU128(BigInt("999999"))` |
| `u256` | `BCS.bcsSerializeU256(BigInt("999999"))` |
| `bool` | `BCS.bcsSerializeBool(true)` |
| `vector<u8>` (raw bytes) | `BCS.bcsSerializeBytes(new Uint8Array([1,2,3]))` |
| `string` (0x1::string::String) | `BCS.bcsSerializeStr("hello")` |

### With Generic Type Arguments

> **Framework address:** `supra_framework` is deployed at address `0x1` on Supra (same as Aptos). So `0x1::supra_coin::SupraCoin` is the canonical TypeTag path for SupraCoin. Use this literal address - do not use a named address variable here.

```typescript
// public entry fun transfer<CoinType>(sender, recipient: address, amount: u64)
import { BCS, TxnBuilderTypes, TypeTagParser } from "supra-ts-sdk";

// 0x1 = supra_framework address; supra_coin is the module; SupraCoin is the type
const coinTypeTag = new TypeTagParser("0x1::supra_coin::SupraCoin").parseTypeTag();

const rawTxn = supra.transaction.build.rawTxnObject({
  senderAddress: account.address(),
  senderSequenceNumber: accountInfo.sequence_number,
  function: "0x1::coin::transfer",
  functionTypeArgs: [coinTypeTag],     // TypeTag[] - the generic coin type
  functionArgs: [
    BCS.bcsToBytes(TxnBuilderTypes.AccountAddress.fromHex(recipientAddress)),
    BCS.bcsSerializeUint64(BigInt(1_000_000)),
  ],
});
await rawTxn.submitTransaction({ senderAccount: account });
```

> -- `rawTxnObject` requires real `TypeTag` objects, hence `TypeTagParser`. `build.simple` and `methods.view` accept the plain string `"0x1::supra_coin::SupraCoin"` instead, because their type argument is `TxnBuilderTypes.TypeTag | string`.

---

## Reading View Functions

```typescript
// public fun get_score(registry_addr: address, player: address): u64
const result = await supra.methods.view({
  function: "0xYOUR_CONTRACT_ADDRESS::leaderboard::get_score",
  typeArguments: [],
  functionArguments: ["REGISTRY_ADDR", "PLAYER_ADDR"],
});
// result is MoveValue[] - one entry per Move return value
console.log("Score:", result[0]);
```

> -- `functionArguments` takes plain JavaScript values (strings, numbers, bigints, booleans, arrays), **not** BCS bytes. Use `supra.methods.viewRaw(...)` if you need the untyped raw response.

---

## Simulate Before Sending

Simulate off the built transaction — `ExtendedRawTransaction.simulate()` takes the sender account directly, so there is no authenticator to construct.

```typescript
const accountInfo = await supra.account.getAccountInfo({ accountAddress: account.address() });
const rawTxn = supra.transaction.build.rawTxnObject({
  senderAddress: account.address(),
  senderSequenceNumber: accountInfo.sequence_number,
  function: "0xCONTRACT::module::function",
  functionTypeArgs: [],
  functionArgs: [/* BCS-encoded args */],
});

const simulation = await rawTxn.simulate(account);

// `output` is a union; narrow to the Move variant to reach gas_used
if (simulation.output && "Move" in simulation.output) {
  console.log("Estimated gas:", simulation.output.Move.gas_used);
  console.log("VM status:",     simulation.output.Move.vm_status);
}

// Happy with the estimate? Submit the same object.
const response = await rawTxn.submitTransaction({ senderAccount: account });
```

You can also let submission simulate first and wait for commitment in one call:

```typescript
const response = await rawTxn.submitTransaction({
  senderAccount: account,
  enableTransactionWaitAndSimulationArgs: {
    enableTransactionSimulation: true,
    enableWaitForTransaction: true,
  },
});
```

---

## Multi-Agent (Multi-Signer) Transaction

Multi-agent submission takes **authenticators**, not accounts. Build the raw transaction, wrap it in a `MultiAgentRawTransaction` together with the secondary signer addresses, have every party sign that wrapper, then submit.

```typescript
import { SupraClient, Network, TxnBuilderTypes, type MoveFunctionId } from "supra-ts-sdk";

const sellerInfo = await supra.account.getAccountInfo({ accountAddress: seller.address() });

const rawTxn = supra.transaction.build.rawTxnObject({
  senderAddress: seller.address(),
  senderSequenceNumber: sellerInfo.sequence_number,
  function: "0xCONTRACT::escrow::settle" as MoveFunctionId,
  functionTypeArgs: [],
  functionArgs: [],    // the signers themselves are not function arguments
});

// Wrap with the secondary signers - this is what everyone signs
const multiAgentTxn = new TxnBuilderTypes.MultiAgentRawTransaction(rawTxn, [
  new TxnBuilderTypes.AccountAddress(buyer.address().toUint8Array()),
]);

// signTransaction returns HexString for a single-signer txn and an
// AccountAuthenticatorEd25519 for a multi-agent one - narrow, don't cast
const sellerAuth = supra.transaction.signTransaction({ senderAccount: seller, rawTxn: multiAgentTxn });
const buyerAuth  = supra.transaction.signTransaction({ senderAccount: buyer,  rawTxn: multiAgentTxn });

if (
  !(sellerAuth instanceof TxnBuilderTypes.AccountAuthenticatorEd25519) ||
  !(buyerAuth  instanceof TxnBuilderTypes.AccountAuthenticatorEd25519)
) {
  throw new Error("Expected Ed25519 authenticators for a multi-agent transaction");
}

const response = await supra.transaction.submit.submitMultiAgentTransaction({
  secondarySignersAccountAddress: [buyer.address().toString()],
  rawTxn,
  senderAuthenticator: sellerAuth,
  secondarySignersAuthenticator: [buyerAuth],
});
console.log("Escrow settled:", response.hash);
```

---

## Full Quickstart

```typescript
import { SupraClient, Network, SupraAccount } from "supra-ts-sdk";

(async () => {
  const supra   = new SupraClient({ network: Network.TESTNET });
  const account = new SupraAccount(Uint8Array.from(Buffer.from("PRIVATE_KEY_HEX", "hex")));

  await supra.faucet.fundAccountWithFaucet({ accountAddress: account.address() });
  console.log("Balance:", await supra.account.getAccountSupraCoinBalance({
    accountAddress: account.address(),
  }));

  // Simple transfer using convenience method
  const txRes = await supra.coin.transferSupraCoin({
    senderAccount: account,
    receiverAccountAddress: "RECEIVER_ADDRESS",
    amount: BigInt(1000),
  });
  console.log("TX:", txRes.hash);
})();
```

```bash
npx ts-node src/quickstart.ts
```

---

## Python SDK

### Install (latest: 0.1.1)
```bash
pip install supra-sdk
```

### Real Import Paths
```python
from supra_sdk.account import Account
from supra_sdk.account_address import AccountAddress
from supra_sdk.bcs import Serializer
from supra_sdk.clients.rest import SupraClient
from supra_sdk.transactions import EntryFunction, TransactionArgument, TransactionPayload
```

> -- The Python SDK is **async-first**. All client methods are coroutines - run them with `asyncio.run()` or `await` inside an async context. The `SupraClient` constructor itself is synchronous; everything else is async.

### Basic Usage

```python
import asyncio
from supra_sdk.account import Account
from supra_sdk.clients.rest import SupraClient

async def main():
    client = SupraClient("https://rpc-testnet.supra.com")

    # Generate a new account
    alice = Account.generate()
    print("Address:", alice.address())

    # Load from existing private key
    # alice = Account.load_key("0xYOUR_PRIVATE_KEY_HEX")

    # Fund from testnet faucet
    await client.faucet(alice.address())

    # Get balance
    balance = await client.account_supra_balance(alice.address())
    print("Balance:", balance)

    # Transfer SupraCoin
    bob = Account.generate()
    await client.faucet(bob.address())
    tx_hash = await client.transfer_supra_coin(alice, bob.address(), 1_000)
    print("Transfer TX:", tx_hash)

    await client.close()

asyncio.run(main())
```

### Call a Contract Entry Function

```python
import asyncio
from supra_sdk.account import Account
from supra_sdk.account_address import AccountAddress
from supra_sdk.bcs import Serializer
from supra_sdk.clients.rest import SupraClient
from supra_sdk.transactions import EntryFunction, TransactionArgument, TransactionPayload

async def main():
    client = SupraClient("https://rpc-testnet.supra.com")
    account = Account.load_key("0xYOUR_PRIVATE_KEY_HEX")

    # Calling:
    # public entry fun register(admin: &signer, member: address, name: vector<u8>, score: u64)

    member_addr = AccountAddress.from_hex("0xbeef")

    payload = TransactionPayload(
        EntryFunction.natural(
            f"0xYOUR_CONTRACT_ADDRESS::registry",   # "address::module"
            "register",                              # function name
            [],                                      # type args (TypeTag list)
            [
                TransactionArgument(member_addr, Serializer.struct),  # address
                TransactionArgument("Alice",     Serializer.str),      # vector<u8>/string
                TransactionArgument(100,         Serializer.u64),      # u64
            ],
        )
    )

    signed_tx = await client.create_signed_transaction(account, payload)
    tx_hash   = await client.submit_transaction(signed_tx)
    print("TX hash:", tx_hash)

    # Optionally wait for confirmation
    result = await client.wait_for_transaction(tx_hash)
    print("Success:", result.get("success"))

    await client.close()

asyncio.run(main())
```

### Python BCS Encoder Reference

| Move type | Python `TransactionArgument` encoder |
|---|---|
| `address` | `Serializer.struct` (pass an `AccountAddress`) |
| `u8` | `Serializer.u8` |
| `u64` | `Serializer.u64` |
| `u128` | `Serializer.u128` |
| `bool` | `Serializer.bool` |
| `string` / `vector<u8>` | `Serializer.str` |

Full Python SDK docs: https://supra-python-sdk.docs.supra.com/
Docs page: https://docs.supra.com/network/move/python-sdk

---

## REST API

Base URL (Testnet): `https://rpc-testnet.supra.com`

> **API versions:** The current API is `/rpc/v3/`. Versions v1 and v2 exist but are deprecated - `/rpc/v1/` survives only for a handful of legacy transaction endpoints. Always use v3 for new integrations.

### Current Endpoints (`/rpc/v3/` - use these)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/rpc/v3/accounts/{address}` | Account info (includes sequence_number) |
| GET | `/rpc/v3/accounts/{address}/resources` | All account resources |
| GET | `/rpc/v3/accounts/{address}/resources/{resource_type}` | Specific resource |
| GET | `/rpc/v3/accounts/{address}/modules` | Account modules |
| GET | `/rpc/v3/accounts/{address}/transactions` | Account transactions |
| GET | `/rpc/v3/accounts/{address}/coin_transactions` | Coin transfer history |
| POST | `/rpc/v3/transactions/submit` | Submit a signed transaction |
| GET | `/rpc/v3/transactions/{hash}` | Transaction by hash |
| POST | `/rpc/v3/transactions/simulate` | Simulate a transaction |
| GET | `/rpc/v3/transactions/estimate_gas_price` | Current gas price |

### Legacy Endpoints (v1 only - chain metadata)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/rpc/v1/transactions/chain_id` | Chain ID |
| GET | `/rpc/v1/transactions/parameters` | Transaction parameters |

Full REST API docs: https://docs.supra.com/network/move/rest-api

---

## SDK Links

- TypeScript SDK: `npm install supra-ts-sdk` | https://github.com/Entropy-Foundation/supra-ts-sdk | https://sdk-docs.supra.com
- Python SDK: `pip install supra-sdk` | https://github.com/Entropy-Foundation/supra-python-sdk | https://supra-python-sdk.docs.supra.com/
- REST API: https://docs.supra.com/network/move/rest-api
