# Supra SDK Guide

## TypeScript SDK

### Install
```bash
npm install supra-l1-sdk
```

### Import
```typescript
import { HexString, SupraAccount, SupraClient, BCS, TxnBuilderTypes } from "supra-l1-sdk";
```

### Initialize Client
```typescript
// Connect to testnet
const client = await SupraClient.init("https://rpc-testnet.supra.com/");

// Connect to mainnet
const client = await SupraClient.init("https://rpc-mainnet.supra.com/");
```

### Create / Load Account
```typescript
// Load from private key
const account = new SupraAccount(
  Uint8Array.from(Buffer.from("YOUR_PRIVATE_KEY_HEX", "hex"))
);

// Get account address
const address = account.address();
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
  BigInt(1000000), // amount in smallest unit
  {
    enableTransactionWaitAndSimulationArgs: {
      enableWaitForTransaction: true,
      enableTransactionSimulation: true,
    },
  }
);
console.log("TX Result:", txRes);
```

### Call a Contract Entry Function
```typescript
const txRes = await client.invokeContractFunction(
  account,
  "CONTRACT_ADDRESS",
  "module_name",
  "function_name",
  [], // type arguments
  [/* function arguments */],
  {
    enableTransactionWaitAndSimulationArgs: {
      enableWaitForTransaction: true,
    },
  }
);
```

### Full Quickstart Example
```typescript
import { HexString, SupraAccount, SupraClient } from "supra-l1-sdk";

(async () => {
  const client = await SupraClient.init("https://rpc-testnet.supra.com/");

  const account = new SupraAccount(
    Uint8Array.from(Buffer.from("YOUR_PRIVATE_KEY_HEX", "hex"))
  );

  await client.fundAccountWithFaucet(account.address());
  console.log("Account funded:", account.address().hex());

  const receiver = new HexString("RECEIVER_ADDRESS");

  const txRes = await client.transferSupraCoin(
    account,
    receiver,
    BigInt(1000),
    {
      enableTransactionWaitAndSimulationArgs: {
        enableWaitForTransaction: true,
        enableTransactionSimulation: true,
      },
    }
  );

  console.log("Transfer TX:", txRes);
})();
```

### Run the Script
```bash
npx ts-node src/quickstart.ts
```

---

## Python SDK

### Install
```bash
pip install supra-sdk
```

### Docs
https://docs.supra.com/network/move/python-sdk

---

## REST API

Base URL (Testnet): `https://rpc-testnet.supra.com`

### Common Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/rpc/v1/accounts/{address}` | Get account info |
| GET | `/rpc/v1/accounts/{address}/resources` | Get account resources |
| POST | `/rpc/v1/transactions` | Submit a transaction |
| GET | `/rpc/v1/transactions/{hash}` | Get transaction by hash |

Full REST API docs: https://docs.supra.com/network/move/rest-api

---

## SDK Links

- TypeScript SDK npm: `npm install supra-l1-sdk`
- TypeScript SDK GitHub: https://github.com/Entropy-Foundation/supra-l1-sdk
- SDK Documentation: https://sdk-docs.supra.com
- REST API Docs: https://docs.supra.com/network/move/rest-api
