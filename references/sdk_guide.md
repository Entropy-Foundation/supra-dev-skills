# Supra SDK Guide

## TypeScript SDK

### Install (pin to a tested version)
```bash
npm install supra-l1-sdk@latest
# Pin to a specific version for production stability:
npm install supra-l1-sdk@2.0.0
```

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
const address = account.address(); // HexString
```

### Fund from Faucet (Testnet Only)
```typescript
await client.fundAccountWithFaucet(account.address());
```

### Transfer SupraCoin
```typescript
const txRes = await client.transferSupraCoin(
  senderAccount,
  new HexString("RECEIVER_ADDRESS_HEX"),
  BigInt(1000000), // amount in Quants (1 SUPRA = 100_000_000 Quants)
  {
    enableTransactionWaitAndSimulationArgs: {
      enableWaitForTransaction: true,
      enableTransactionSimulation: true,
    },
  }
);
```

---

## Calling Contract Functions with BCS Arguments

This is the #1 place developers get stuck. Move entry functions take typed arguments. You must serialize them correctly using BCS before passing them to `invokeContractFunction`.

### BCS Serialization Reference

```typescript
import { BCS } from "supra-l1-sdk";

// u8
BCS.bcsSerializeU8(42)

// u64 — use BigInt for all u64 values
BCS.bcsSerializeUint64(BigInt(1000000))

// u128
BCS.bcsSerializeU128(BigInt("99999999999999"))

// bool
BCS.bcsSerializeBool(true)

// address (32 bytes) — from a hex string
BCS.bcsToBytes(TxnBuilderTypes.AccountAddress.fromHex("0xcafe"))

// vector<u8> (byte array / raw bytes)
BCS.bcsSerializeBytes(Buffer.from("hello world"))

// string (vector<u8> under the hood)
const encoder = new TextEncoder();
BCS.bcsSerializeBytes(encoder.encode("my_string"))
```

### Full Example: Calling a Contract with Real Arguments

```typescript
import { HexString, SupraAccount, SupraClient, BCS, TxnBuilderTypes } from "supra-l1-sdk";

(async () => {
  const client = await SupraClient.init("https://rpc-testnet.supra.com/");
  const account = new SupraAccount(
    Uint8Array.from(Buffer.from("YOUR_PRIVATE_KEY_HEX", "hex"))
  );

  // Calling: public entry fun register_member(
  //   admin: &signer,
  //   new_member: address,
  //   name: vector<u8>,
  //   score: u64,
  // )
  const txRes = await client.invokeContractFunction(
    account,
    "0xYOUR_CONTRACT_ADDRESS",    // contract address (without 0x or with)
    "registry",                    // module name
    "register_member",             // function name
    [],                            // type arguments (empty if no generics)
    [
      // new_member: address
      BCS.bcsToBytes(TxnBuilderTypes.AccountAddress.fromHex("0xbeef")),
      // name: vector<u8>
      BCS.bcsSerializeBytes(Buffer.from("Alice")),
      // score: u64
      BCS.bcsSerializeUint64(BigInt(9999)),
    ],
    {
      enableTransactionWaitAndSimulationArgs: {
        enableWaitForTransaction: true,
      },
    }
  );

  console.log("TX hash:", txRes.txHash);
  console.log("Success:", txRes.success);
})();
```

### Example: Calling with a Generic Type Argument (e.g. coin transfer)

```typescript
// public entry fun transfer<CoinType>(sender: &signer, recipient: address, amount: u64)
const txRes = await client.invokeContractFunction(
  account,
  "0x1",          // supra_framework address
  "coin",
  "transfer",
  ["0x1::supra_coin::SupraCoin"],   // type argument — the coin type
  [
    BCS.bcsToBytes(TxnBuilderTypes.AccountAddress.fromHex(recipientAddress)),
    BCS.bcsSerializeUint64(BigInt(1000000)),
  ],
  { enableTransactionWaitAndSimulationArgs: { enableWaitForTransaction: true } }
);
```

### Read a View Function

```typescript
// public fun get_score(registry_addr: address, player: address): u64
const result = await client.invokeView(
  new HexString("0xYOUR_CONTRACT_ADDRESS"),
  "leaderboard",
  "get_score",
  [],   // type args
  [
    BCS.bcsToBytes(TxnBuilderTypes.AccountAddress.fromHex("REGISTRY_ADDR")),
    BCS.bcsToBytes(TxnBuilderTypes.AccountAddress.fromHex("PLAYER_ADDR")),
  ]
);
console.log("Score:", result);
```

---

## Full Quickstart Example

```typescript
import { HexString, SupraAccount, SupraClient, BCS, TxnBuilderTypes } from "supra-l1-sdk";

(async () => {
  const client = await SupraClient.init("https://rpc-testnet.supra.com/");
  const account = new SupraAccount(
    Uint8Array.from(Buffer.from("YOUR_PRIVATE_KEY_HEX", "hex"))
  );

  await client.fundAccountWithFaucet(account.address());
  console.log("Funded:", account.address().hex());

  // Simple coin transfer
  const txRes = await client.transferSupraCoin(
    account,
    new HexString("RECEIVER_ADDRESS"),
    BigInt(1000),
    { enableTransactionWaitAndSimulationArgs: { enableWaitForTransaction: true } }
  );
  console.log("Transfer TX:", txRes);
})();
```

```bash
npx ts-node src/quickstart.ts
```

---

## Python SDK

### Install
```bash
pip install supra-sdk
```

### Basic Usage

```python
from supra_sdk import SupraClient, SupraAccount

client = SupraClient("https://rpc-testnet.supra.com")
account = SupraAccount.from_private_key("YOUR_PRIVATE_KEY_HEX")
print("Address:", account.address())

client.fund_account_with_faucet(account.address())

balance = client.get_account_balance(account.address())
print("Balance:", balance)

tx = client.transfer_supra_coin(
    sender=account,
    recipient="RECIPIENT_ADDRESS",
    amount=1000,
)
print("TX hash:", tx["hash"])
```

### Call a Contract Entry Function (Python)

```python
from supra_sdk import SupraClient, SupraAccount, bcs

client = SupraClient("https://rpc-testnet.supra.com")
account = SupraAccount.from_private_key("YOUR_PRIVATE_KEY_HEX")

# Calling: public entry fun register_member(
#   admin: &signer,
#   new_member: address,
#   name: vector<u8>,
#   score: u64,
# )
tx = client.invoke_contract_function(
    account=account,
    contract_address="CONTRACT_ADDRESS",
    module_name="registry",
    function_name="register_member",
    type_args=[],
    args=[
        bcs.encode_address("0xbeef"),         # address
        bcs.encode_bytes(b"Alice"),            # vector<u8>
        bcs.encode_u64(9999),                 # u64
    ],
)
print("TX hash:", tx["hash"])
```

### Read a View Function (Python)

```python
result = client.invoke_view(
    contract_address="CONTRACT_ADDRESS",
    module_name="leaderboard",
    function_name="get_score",
    type_args=[],
    args=[
        bcs.encode_address("REGISTRY_ADDR"),
        bcs.encode_address("PLAYER_ADDR"),
    ],
)
print("Score:", result)
```

Full Python SDK docs: https://docs.supra.com/network/move/python-sdk

---

## REST API

Base URL (Testnet): `https://rpc-testnet.supra.com`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/rpc/v1/accounts/{address}` | Get account info |
| GET | `/rpc/v1/accounts/{address}/resources` | Get account resources |
| POST | `/rpc/v1/transactions` | Submit a transaction |
| GET | `/rpc/v1/transactions/{hash}` | Get transaction by hash |
| GET | `/rpc/v1/accounts/{address}/resources/{resource_type}` | Get specific resource |

Full REST API docs: https://docs.supra.com/network/move/rest-api

---

## SDK Links

- TypeScript SDK npm: `npm install supra-l1-sdk`
- TypeScript SDK GitHub: https://github.com/Entropy-Foundation/supra-l1-sdk
- SDK Documentation: https://sdk-docs.supra.com
- REST API Docs: https://docs.supra.com/network/move/rest-api
