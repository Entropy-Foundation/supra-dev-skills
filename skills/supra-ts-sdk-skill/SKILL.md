---
name: supra-ts-sdk-skill
description: |
  Guide for integrating the Supra L1 blockchain TypeScript SDK (supra-ts-sdk) into React or Next.js projects. Covers client setup, account queries, coin/fungible asset transfers, smart contract interaction via ABI proxies, transaction lifecycle (build/simulate/submit/wait), view functions, events, and Move type mapping.
when_to_use: |
  Use when: user asks to integrate Supra blockchain into a React/Next.js app; user wants to query Supra accounts, balances, or transactions from a frontend; user needs to build/sign/submit Supra transactions; user wants to interact with Move smart contracts from TypeScript; user asks about supra-ts-sdk usage patterns.
---

# supra-ts-sdk Integration Guide for React / Next.js

You are helping a developer integrate the `supra-ts-sdk` package into a React or Next.js project. Follow these patterns and API references exactly.

## Installation

```bash
npm install supra-ts-sdk
# or
pnpm add supra-ts-sdk
```

The SDK requires Node.js >= 18 (uses native `fetch` and `AbortSignal.timeout()`). For Next.js, all SDK calls must run server-side or in client components that handle async correctly.

## Key Import

```typescript
import {
  SupraClient,
  Network,
  type SupraConfig,
  type TransactionResponse,
  type CommittedTransactionResponse,
  type PaginatedResponse,
  type AccountData,
  type MoveModule,
  type MoveFunctionId,
  type MoveStructId,
  type CoinInfo,
  BCS,
} from "supra-ts-sdk";
import { SupraAccount, HexString, TxnBuilderTypes, TypeTagParser } from "supra-l1-sdk-core";
```

## Client Initialization

`SupraClient` is synchronous to construct. Create one instance and reuse it.

```typescript
// Predefined network (recommended)
const supra = new SupraClient({ network: Network.TESTNET });
const supra = new SupraClient({ network: Network.MAINNET });

// Custom RPC
const supra = new SupraClient({
    rpcUrl: "https://rpc-testnet.supra.com",
    chainId: 6,
});

// With gas overrides
const supra = new SupraClient({
    network: Network.TESTNET,
    maxGas: 2000n,
    minGasUnitPrice: 100_000n,
});
```

Network defaults: mainnet = chainId 8, testnet = chainId 6.

### React Pattern: Singleton Client

```typescript
// lib/supra.ts
import { SupraClient, Network } from "supra-ts-sdk";

let client: SupraClient | null = null;

export function getSupraClient(): SupraClient {
    if (!client) {
        client = new SupraClient({ network: Network.MAINNET });
    }
    return client;
}
```

### Next.js: Server Actions / Route Handlers

The SDK uses `fetch` internally. In Next.js App Router, wrap SDK calls in Server Actions or Route Handlers to keep RPC calls server-side:

```typescript
// app/actions/supra.ts
"use server";
import { SupraClient, Network } from "supra-ts-sdk";

const supra = new SupraClient({ network: Network.MAINNET });

export async function getBalance(address: string): Promise<string> {
    const balance = await supra.account.getAccountSupraCoinBalance({
        accountAddress: address,
    });
    return balance.toString(); // bigint cannot be serialized to client
}
```

**Important**: `bigint` values cannot be serialized across the server/client boundary in Next.js. Convert to `string` or `number` before returning to client components.

---

## Account Module

All account methods accept `accountAddress` as `string` (hex) or `HexString`.

```typescript
// Check if account exists
const exists: boolean = await supra.account.isAccountExists({
    accountAddress: "0x88fbd33f54e1126269769780feb24480428179f552e2313fbe571b72e62a1c55",
});

// Get account info (sequence number, auth key)
const info: AccountData = await supra.account.getAccountInfo({
    accountAddress: address,
});
// info.sequence_number is bigint

// Get SUPRA coin balance
const balance: bigint = await supra.account.getAccountSupraCoinBalance({
    accountAddress: address,
});

// Get any coin balance (legacy coin type or fungible asset address)
const balance: bigint = await supra.account.getAccountCoinBalance({
    accountAddress: address,
    asset: "0x1::supra_coin::SupraCoin",  // MoveStructId for legacy
});
const balance: bigint = await supra.account.getAccountCoinBalance({
    accountAddress: address,
    asset: "0xa",  // address for fungible asset
});

// Get account resources (paginated)
const { response: resources, cursor } = await supra.account.getAccountResources({
    accountAddress: address,
    options: { count: 10 },
});

// Get specific resource
const resource = await supra.account.getAccountResource<{ coin: { value: string } }>({
    accountAddress: address,
    resourceType: "0x1::coin::CoinStore<0x1::supra_coin::SupraCoin>",
});

// Get account modules (paginated)
const { response: modules } = await supra.account.getAccountModules({
    accountAddress: address,
});

// Get specific module
const module = await supra.account.getAccountModule({
    accountAddress: address,
    moduleName: "acl",
});

// Get account transactions (paginated)
const { response: txns } = await supra.account.getAccountTransactions({
    accountAddress: address,
    options: { count: 10, ascending: false },
});

// Get coin transaction count
const count: number = await supra.account.getAccountCoinsCount({
    accountAddress: address,
});
```

---

## Coin Module

```typescript
// Get coin metadata
const coinInfo: CoinInfo = await supra.coin.getCoinInfo({
    coinType: "0x1::supra_coin::SupraCoin",
});
// { name: string, symbol: string, decimals: number }

// Transfer SUPRA coin (high-level, handles build+submit)
const txn: TransactionResponse = await supra.coin.transferSupraCoin({
    senderAccount: account,  // SupraAccount instance
    receiverAccountAddress: "0x...",
    amount: 10000,  // in smallest unit (octas)
    optionalTransactionArgs: {
        enableTransactionWaitAndSimulationArgs: {
            enableTransactionSimulation: true,
            enableWaitForTransaction: true,
        },
    },
});

// Transfer any coin type
const txn: TransactionResponse = await supra.coin.transferCoin({
    senderAccount: account,
    receiverAccountAddress: "0x...",
    amount: 10000,
    coinType: "0x1::supra_coin::SupraCoin",
    optionalTransactionArgs: {
        enableTransactionWaitAndSimulationArgs: {
            enableWaitForTransaction: true,
        },
    },
});
```

---

## Fungible Asset Module

```typescript
// Get fungible asset metadata
const metadata: CoinInfo = await supra.fungibleAsset.getFungibleAssetMetadata({
    assetAddress: "0xa",
});

// Transfer SUPRA as fungible asset
const txn = await supra.fungibleAsset.transferSupraFungibleAsset({
    senderAccount: account,
    receiverAccountAddress: "0x...",
    amount: 10000n,
});

// Transfer any fungible asset
const txn = await supra.fungibleAsset.transferFungibleAsset({
    senderAccount: account,
    receiverAccountAddress: "0x...",
    amount: 10000n,
    assetAddress: "0x...",
});
```

---

## View Functions (Read-Only Contract Calls)

Two approaches: typed `view` and untyped `viewRaw`.

```typescript
// Typed view - returns values converted to TS types
const [balance] = await supra.methods.view<[bigint]>({
    function: "0x1::coin::balance",
    functionArguments: ["0x..."],  // account address
    typeArguments: [new TypeTagParser("0x1::supra_coin::SupraCoin").parseTypeTag()],
});

// Raw view - returns raw JSON values (u64/u128/u256 come as strings)
const [balanceRaw] = await supra.methods.viewRaw({
    function: "0x1::coin::balance",
    functionArguments: ["0x..."],
    typeArguments: ["0x1::supra_coin::SupraCoin"],
});
```

### Move Type Argument Mapping

When passing **function arguments** to `view()`:
| Move Type | TypeScript Value |
|-----------|-----------------|
| `u8`, `u16`, `u32` | `number` (e.g., `10`) |
| `u64`, `u128`, `u256` | `bigint` (e.g., `100n`) |
| `bool` | `boolean` |
| `address` | `string` (hex, e.g., `"0x1"`) |
| `vector<u8>` | `string` (hex) |
| `vector<T>` | `T[]` |
| `0x1::string::String` | `string` |
| `0x1::option::Option<T>` | `T \| null` |
| `signer` / `&signer` | `SupraAccount` (for entry functions) |

When **return types** come back from `view()`:
| Move Type | TypeScript Return |
|-----------|------------------|
| `u8`, `u16`, `u32` | `number` |
| `u64`, `u128`, `u256` | `bigint` |
| `bool` | `boolean` |
| `address` | `string` |
| `vector<T>` | `T[]` |
| `Option<T>` | `T \| null` |

---

## Contract ABI Proxy (Type-Safe Contract Interaction)

Define ABIs as `const` for full type inference:

```typescript
const MY_CONTRACT_ABI = {
    address: "0x1",
    name: "coin",
    friends: [],
    exposed_functions: [
        {
            name: "balance",
            visibility: "public",
            is_entry: false,
            is_view: true,
            generic_type_params: [{ constraints: [] }],
            params: ["address"],
            return: ["u64"],
        },
        {
            name: "transfer",
            visibility: "public",
            is_entry: true,
            is_view: false,
            generic_type_params: [{ constraints: [] }],
            params: ["&signer", "address", "u64"],
            return: [],
        },
    ],
    structs: [],
} as const;

// Create typed proxy
const { contracts } = supra.contract.fromABI([MY_CONTRACT_ABI] as const);

// View function call (read-only)
const [balance] = await contracts.coin.view.balance({
    functionArguments: ["0x..."],
    typeArguments: ["0x1::supra_coin::SupraCoin"],
});
// balance is typed as bigint (from u64 return)

// Entry function call (state-changing, requires signer)
const txn = await contracts.coin.entry.transfer({
    functionArguments: [account, "0x...", 1000n],
    typeArguments: [new TypeTagParser("0x1::supra_coin::SupraCoin").parseTypeTag()],
    enableTransactionWaitAndSimulationArgs: {
        enableTransactionSimulation: true,
        enableWaitForTransaction: true,
    },
});
```

**Key rules for ABI proxy**:
- ABI array must be `as const` for type inference to work
- `is_view: true` functions appear under `.view`, `is_entry: true` under `.entry`
- `&signer` params in entry functions expect a `SupraAccount` instance
- Entry functions accept optional `optionalTransactionPayloadArgs` and `enableTransactionWaitAndSimulationArgs`

---

## Transaction Lifecycle (Low-Level)

### 1. Build

```typescript
// High-level simple build (auto-serializes args based on ABI or type inference)
const rawTxn = await supra.transaction.build.simple({
    senderAddress: account.address(),
    senderSequenceNumber: (await supra.account.getAccountInfo({
        accountAddress: account.address(),
    })).sequence_number,
    function: "0x1::supra_account::transfer_coins",
    functionTypeArgs: ["0x1::supra_coin::SupraCoin"],
    functionArgs: ["0x...", 10000],
});

// Low-level build (pre-serialized BCS args)
const rawTxn = supra.transaction.build.rawTxnObject({
    senderAddress: account.address(),
    senderSequenceNumber: seqNum,
    function: "0x1::supra_account::transfer" as MoveFunctionId,
    functionTypeArgs: [],
    functionArgs: [receiverAddress.toUint8Array(), BCS.bcsSerializeUint64(10000)],
});
```

### 2. Simulate

```typescript
// Build a sendTxnPayload for simulation
const sendPayload = supra.transaction.build.sendTxnPayload({
    senderAccount: account,
    rawTxn: rawTxn,
});

const simResult = await supra.transaction.simulate.simple({
    sendTxPayload: sendPayload,
});

// Or use shorthand on ExtendedRawTransaction
const simResult = await rawTxn.simulate(account);
```

### 3. Submit

```typescript
// Submit raw transaction (signs internally)
const txn = await supra.transaction.submit.submitRawTransaction({
    senderAccount: account,
    rawTransaction: rawTxn,
    enableTransactionWaitAndSimulationArgs: {
        enableTransactionSimulation: true,
        enableWaitForTransaction: true,
    },
});

// Submit serialized bytes
const txn = await supra.transaction.submit.submitSerializedRawTransaction({
    senderAccount: account,
    serializedRawTransaction: rawTxn.toBytes(),
    enableTransactionWaitAndSimulationArgs: {
        enableWaitForTransaction: true,
    },
});

// Submit with pre-computed signature
const signature = supra.transaction.signTransaction({
    senderAccount: account,
    rawTxn: rawTxn,
});
const txn = await supra.transaction.submit.submitSerializedRawTransactionAndSignature({
    senderPubkey: account.pubKey(),
    signature: signature as HexString,
    serializedRawTransaction: rawTxn.toBytes(),
});
```

### 4. Wait & Query

```typescript
// Wait for transaction confirmation
const committed: CommittedTransactionResponse = await supra.transaction.waitForTransaction({
    transactionHash: txn.hash,
    options: { timeoutSecs: 30, checkSuccess: true },
});

// Check if pending
const isPending: boolean = await supra.transaction.isPendingTransaction({
    transactionHash: "0x...",
});

// Get transaction by hash
const txnData = await supra.transaction.getTransactionByHash({
    transactionHash: "0x...",
});
```

---

## Sponsored Transactions

```typescript
const rawTxn = supra.transaction.build.rawTxnObject({ /* ... */ });

const feePayerPayload = new TxnBuilderTypes.FeePayerRawTransaction(
    rawTxn,
    [],
    new TxnBuilderTypes.AccountAddress(feePayerAccount.address().toUint8Array()),
);

const senderAuth = supra.transaction.signTransaction({
    senderAccount: account,
    rawTxn: feePayerPayload,
}) as TxnBuilderTypes.AccountAuthenticatorEd25519;

const feePayerAuth = supra.transaction.signTransaction({
    senderAccount: feePayerAccount,
    rawTxn: feePayerPayload,
}) as TxnBuilderTypes.AccountAuthenticatorEd25519;

const txn = await supra.transaction.submit.submitSponsorTransaction({
    feePayerAddress: feePayerAccount.address().toString(),
    secondarySignersAccountAddress: [],
    rawTxn: rawTxn,
    senderAuthenticator: senderAuth,
    feePayerAuthenticator: feePayerAuth,
    secondarySignersAuthenticator: [],
    enableTransactionWaitAndSimulationArgs: {
        enableWaitForTransaction: true,
    },
});
```

---

## Events

```typescript
const { response: events, cursor } = await supra.events.getEventsByType({
    eventType: "0x1::fungible_asset::Deposit",
    options: { limit: 100, startHeight: 1000, endHeight: 2000 },
});
```

---

## Block Queries

```typescript
const latestBlock = await supra.block.getLatestBlock();
const block = await supra.block.getBlockByHeight({
    height: 1000,
    options: { withFinalizedTransactions: true },
});
const block = await supra.block.getBlockByHash({ blockHash: "0x..." });
const txHashes = await supra.block.getTransactionsByBlockHash({
    blockHash: "0x...",
    options: { type: "user" },
});
```

---

## Table Items

```typescript
const item = await supra.table.getTableItem({
    handle: "0x...",
    data: {
        key_type: "u64",
        value_type: "0x...::pool::Position",
        key: "1",
    },
});
```

---

## Faucet (Testnet Only)

```typescript
const result = await supra.faucet.fundAccountWithFaucet({
    accountAddress: "0x...",
});
// result.hash contains the faucet transaction hash
```

---

## Account Creation

`SupraAccount` comes from `supra-l1-sdk-core`:

```typescript
import { SupraAccount } from "supra-l1-sdk-core";

// Generate new account
const account = new SupraAccount();

// From existing keys
const account = SupraAccount.fromSupraAccountObject({
    address: "0x...",
    privateKeyHex: "PRIVATE_KEY" + "PUBLIC_KEY_WITHOUT_0x",
    publicKeyHex: "0x" + "PUBLIC_KEY_WITHOUT_0x",
});

// Get address
const address: HexString = account.address();
const addressStr: string = account.address().toString();
```

---

## Error Handling

```typescript
import { SupraAPIError, MoveVmError, isMoveVmError } from "supra-ts-sdk";

try {
    const balance = await supra.account.getAccountSupraCoinBalance({
        accountAddress: "0xinvalid",
    });
} catch (err) {
    if (err instanceof SupraAPIError) {
        console.error(err.status);       // HTTP status code
        console.error(err.statusText);   // HTTP status text
        console.error(err.url);          // Request URL
        console.error(err.data);         // Response body
        console.error(err.major_status); // Move VM error code (if applicable)

        if (isMoveVmError(err.major_status)) {
            // Handle specific Move VM errors
            if (err.major_status === MoveVmError.INSUFFICIENT_BALANCE_FOR_TRANSACTION_FEE) {
                // ...
            }
        }
    }
}
```

---

## Pagination Pattern

All paginated methods return `PaginatedResponse<T>`:

```typescript
// Fetch all pages
let cursor: string | undefined;
const allResources = [];

do {
    const { response, cursor: nextCursor } = await supra.account.getAccountResources({
        accountAddress: address,
        options: { count: 25, start: cursor },
    });
    allResources.push(...response);
    cursor = nextCursor;
} while (cursor);
```

---

## React Hook Patterns

### useQuery (TanStack Query)

```typescript
import { useQuery } from "@tanstack/react-query";
import { getSupraClient } from "@/lib/supra";

export function useAccountBalance(address: string | undefined) {
    return useQuery({
        queryKey: ["supra", "balance", address],
        queryFn: async () => {
            const supra = getSupraClient();
            const balance = await supra.account.getAccountSupraCoinBalance({
                accountAddress: address!,
            });
            return balance;
        },
        enabled: !!address,
    });
}

export function useCoinInfo(coinType: string) {
    return useQuery({
        queryKey: ["supra", "coinInfo", coinType],
        queryFn: async () => {
            const supra = getSupraClient();
            return supra.coin.getCoinInfo({ coinType });
        },
    });
}
```

### Transaction Mutation

```typescript
import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useTransferSupra() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (params: {
            account: SupraAccount;
            to: string;
            amount: bigint;
        }) => {
            const supra = getSupraClient();
            return supra.coin.transferSupraCoin({
                senderAccount: params.account,
                receiverAccountAddress: params.to,
                amount: params.amount,
                optionalTransactionArgs: {
                    enableTransactionWaitAndSimulationArgs: {
                        enableWaitForTransaction: true,
                    },
                },
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["supra", "balance"] });
        },
    });
}
```

---

## Important Caveats

1. **`bigint` serialization**: JSON.stringify cannot handle `bigint`. When passing data from server to client in Next.js, convert to `string` first. Use a custom serializer or SuperJSON if needed.
2. **Private keys on client**: Never expose `SupraAccount` private keys in client-side code. Sign transactions server-side or use a wallet adapter.
3. **RPC rate limits**: Create one `SupraClient` instance and reuse it. Do not create a new client per request.
4. **`as const` for ABIs**: The ABI proxy type system requires `as const` assertion on the ABI array for TypeScript to infer the literal types.
5. **Pagination limits**: The `count` option accepts 1-100 per page.
6. **Transaction wait**: By default `enableWaitForTransaction` is `false`. Pass `true` to get a `CommittedTransactionResponse` instead of a `PendingTransactionResponse`.
7. **Gas defaults**: `maxGas: 1000`, `minGasUnitPrice: 100_000`. Override via `SupraConfig` or per-transaction via `optionalTransactionPayloadArgs`.
