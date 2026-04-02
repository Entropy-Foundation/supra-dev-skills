# Supra SDK Guide

---

## TypeScript SDK

### Install
```bash
npm install supra-l1-sdk           # latest (currently 5.0.2)
npm install supra-l1-sdk@5.0.2    # pin to known-good version for production
```

> ⚠️ Version `2.0.0` does not exist on npm. The published history starts at `3.0.0`. Always check `npm show supra-l1-sdk version` for the current latest.

### Import
```typescript
import { HexString, SupraAccount, SupraClient, BCS, TxnBuilderTypes } from "supra-l1-sdk";
```

### Initialize Client
```typescript
const client = await SupraClient.init("https://rpc-testnet.supra.com/");
const client = await SupraClient.init("https://rpc-mainnet.supra.com/");
```

### Create / Load Account
```typescript
const account = new SupraAccount(
  Uint8Array.from(Buffer.from("YOUR_PRIVATE_KEY_HEX", "hex"))
);
const address: HexString = account.address();
```

### Fund from Faucet (Testnet Only)
```typescript
await client.fundAccountWithFaucet(account.address());
```

### Transfer SupraCoin (convenience method)
```typescript
// transferSupraCoin handles sequence numbers internally
const response = await client.transferSupraCoin(
  senderAccount,
  new HexString("RECEIVER_ADDRESS_HEX"),
  BigInt(1_000_000),   // Quants (1 SUPRA = 100_000_000 Quants)
  { maxGas: BigInt(10000), gasUnitPrice: BigInt(100) }
);
console.log("TX hash:", response.txHash);
```

---

## Calling Contract Functions (State-Modifying)

> ⚠️ There is **no `invokeContractFunction` method** in the SDK. State-modifying calls use a two-step pattern: `createSerializedRawTxObject` → `sendTxUsingSerializedRawTransaction`.

```typescript
import { HexString, SupraAccount, SupraClient, BCS, TxnBuilderTypes } from "supra-l1-sdk";

const client  = await SupraClient.init("https://rpc-testnet.supra.com/");
const account = new SupraAccount(Uint8Array.from(Buffer.from("PRIVATE_KEY_HEX", "hex")));

// Step 1: Get current sequence number (increments with each transaction)
const accountInfo = await client.getAccountInfo(account.address());
const seqNum = BigInt(accountInfo.sequence_number);

// Step 2: Build and serialize the transaction
// Calling: public entry fun register(admin: &signer, member: address, name: vector<u8>, score: u64)
const serializedRawTx = await client.createSerializedRawTxObject(
  account.address(),                   // sender HexString
  seqNum,                              // sequence number (bigint)
  "0xYOUR_CONTRACT_ADDRESS",           // module address
  "registry",                          // module name
  "register",                          // function name
  [],                                  // TypeTag[] — empty if no generic type params
  [
    // address argument
    TxnBuilderTypes.AccountAddress.fromHex("0xbeef").toUint8Array(),
    // vector<u8> / string argument
    BCS.bcsSerializeStr("Alice"),
    // u64 argument
    BCS.bcsSerializeUint64(BigInt(100)),
  ]
);

// Step 3: Send
const response = await client.sendTxUsingSerializedRawTransaction(
  serializedRawTx,
  account
);
console.log("TX hash:", response.txHash);
```

### BCS Encoding Reference

| Move type | TypeScript |
|---|---|
| `address` | `TxnBuilderTypes.AccountAddress.fromHex("0x...").toUint8Array()` |
| `u8` | `BCS.bcsSerializeU8(42)` |
| `u64` | `BCS.bcsSerializeUint64(BigInt(1000))` |
| `u128` | `BCS.bcsSerializeU128(BigInt("999999"))` |
| `u256` | `BCS.bcsSerializeU256(BigInt("999999"))` |
| `bool` | `BCS.bcsSerializeBool(true)` |
| `vector<u8>` (raw bytes) | `BCS.bcsSerializeBytes(new Uint8Array([1,2,3]))` |
| `string` (0x1::string::String) | `BCS.bcsSerializeStr("hello")` |

### With Generic Type Arguments

> **Framework address:** `supra_framework` is deployed at address `0x1` on Supra (same as Aptos). So `0x1::supra_coin::SupraCoin` is the canonical TypeTag path for SupraCoin. Use this literal address — do not use a named address variable here.

```typescript
// public entry fun transfer<CoinType>(sender, recipient: address, amount: u64)
import { TypeTagParser } from "supra-l1-sdk";

// 0x1 = supra_framework address; supra_coin is the module; SupraCoin is the type
const coinTypeTag = new TypeTagParser("0x1::supra_coin::SupraCoin").parseTypeTag();

const serializedRawTx = await client.createSerializedRawTxObject(
  account.address(),
  seqNum,
  "0x1",
  "coin",
  "transfer",
  [coinTypeTag],           // TypeTag[] — the generic coin type
  [
    TxnBuilderTypes.AccountAddress.fromHex(recipientAddress).toUint8Array(),
    BCS.bcsSerializeUint64(BigInt(1_000_000)),
  ]
);
await client.sendTxUsingSerializedRawTransaction(serializedRawTx, account);
```

---

## Reading View Functions

> Use `invokeViewMethod` (not `invokeContractFunction`) for read-only calls.

```typescript
// public fun get_score(registry_addr: address, player: address): u64
const result = await client.invokeViewMethod(
  "0xYOUR_CONTRACT_ADDRESS",    // module address
  "leaderboard",                 // module name
  "get_score",                   // function name
  [],                            // TypeTag[]
  [
    TxnBuilderTypes.AccountAddress.fromHex("REGISTRY_ADDR").toUint8Array(),
    TxnBuilderTypes.AccountAddress.fromHex("PLAYER_ADDR").toUint8Array(),
  ]
);
// result is Uint8Array[] — decode as needed
console.log("Result:", result);
```

---

## Simulate Before Sending

```typescript
const rawTxn = await client.createRawTxObject(
  account.address(), seqNum,
  "0xCONTRACT", "module", "function", [], [/* args */]
);
const simulation = await client.simulateTx(account, rawTxn);
console.log("Estimated gas:", simulation.gas_used);
```

---

## Multi-Agent (Multi-Signer) Transaction

```typescript
// Both accounts must sign before submission
const rawTxn = await client.createRawTxObject(
  seller.address(), seqNum,
  "0xCONTRACT", "escrow", "settle",
  [], []
);
const response = await client.sendMultiAgentTransaction(
  seller,       // primary signer (SupraAccount)
  [buyer],      // secondary signers (SupraAccount[])
  rawTxn
);
```

---

## Full Quickstart

```typescript
import { HexString, SupraAccount, SupraClient, BCS, TxnBuilderTypes } from "supra-l1-sdk";

(async () => {
  const client  = await SupraClient.init("https://rpc-testnet.supra.com/");
  const account = new SupraAccount(Uint8Array.from(Buffer.from("PRIVATE_KEY_HEX", "hex")));

  await client.fundAccountWithFaucet(account.address());
  console.log("Balance:", await client.getAccountSupraCoinBalance(account.address()));

  // Simple transfer using convenience method
  const txRes = await client.transferSupraCoin(
    account,
    new HexString("RECEIVER_ADDRESS"),
    BigInt(1000)
  );
  console.log("TX:", txRes.txHash);
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

> ⚠️ The Python SDK is **async-first**. All client methods are coroutines — run them with `asyncio.run()` or `await` inside an async context. The `SupraClient` constructor itself is synchronous; everything else is async.

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

| Method | Endpoint | Description |
|---|---|---|
| GET | `/rpc/v1/accounts/{address}` | Account info (includes sequence_number) |
| GET | `/rpc/v1/accounts/{address}/resources` | All account resources |
| GET | `/rpc/v1/accounts/{address}/resources/{type}` | Specific resource |
| POST | `/rpc/v1/transactions` | Submit a signed transaction |
| GET | `/rpc/v1/transactions/{hash}` | Transaction by hash |

Full REST API docs: https://docs.supra.com/network/move/rest-api

---

## SDK Links

- TypeScript SDK: `npm install supra-l1-sdk` | https://github.com/Entropy-Foundation/supra-l1-sdk | https://sdk-docs.supra.com
- Python SDK: `pip install supra-sdk` | https://github.com/Entropy-Foundation/supra-python-sdk | https://supra-python-sdk.docs.supra.com/
- REST API: https://docs.supra.com/network/move/rest-api
