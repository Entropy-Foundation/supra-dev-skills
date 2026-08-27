# Sending Transactions with `sendRawTransaction`

`sendRawTransaction` is the API for Move entry function calls. It converts a plain function-call signature into the payload shape Starkey's `createRawTransactionData` expects.

## The shape you always write

```ts
await sendRawTransaction(
  moduleAddress,   // "0x...::" owner of the module
  moduleName,      // e.g. "supra_account"
  functionName,    // e.g. "transfer_coins"
  params,          // Uint8Array[] — BCS-serialized args
  runTimeParams,   // string[]    — type arguments
  txExpiryTime?,   // Unix seconds, optional
);
```

Returns the tx hash as a string. Throws if the user rejects in the wallet.

## BCS serialization

Move entry functions take **BCS-serialized bytes**, not JavaScript values. The reference project ships a `useConversionUtils` hook (at `hooks/useConversionUtils.ts` in the source repo) wrapping `supra-ts-sdk`'s `BCS` and `TxnBuilderTypes` utilities. Common helpers:

```ts
const {
  addressToUint8Array,  // "0x..." → Uint8Array (BCS AccountAddress)
  serializeUint8,       // number → u8 bytes
  serializeUint16,      // number | bigint → u16 bytes
  serializeUint32,      // number | bigint → u32 bytes
  serializeUint64,      // bigint → u64 bytes
  serializeUint128,     // bigint → u128 bytes
  serializeString,      // string → BCS string bytes
  serializeBool,        // boolean → 1 byte
} = useConversionUtils();
```

If the target project doesn't copy `useConversionUtils`, these helpers can be inlined wherever needed — they're simple wrappers around `BCS.bcsSerializeU64(...)` etc. The one non-obvious helper is `addressToUint8Array`, which wraps `BCS.bcsToBytes(TxnBuilderTypes.AccountAddress.fromHex(addr))`.

**Amount conversion:** Supra uses 8-decimal precision for native SUPRA (`1 SUPRA = 10^8 base units`). Always multiply user-entered amounts by `100_000_000` before serializing as u64. Example:

```ts
serializeUint64(BigInt(Number(amountStr) * 100_000_000))
```

(Some tokens like `SupraCoin` use 7 decimals internally — check the `decimals` field of the coin metadata when integrating non-SUPRA assets.)

## Complete example: transfer SUPRA

```tsx
import useSupraWallet from '@/hooks/useSupraWallet';
import useConversionUtils from '@/hooks/useConversionUtils';

function TransferButton() {
  const { sendRawTransaction, accounts } = useSupraWallet();
  const { addressToUint8Array, serializeUint64 } = useConversionUtils();

  const send = async (to: string, amount: string) => {
    const txHash = await sendRawTransaction(
      "0x0000000000000000000000000000000000000000000000000000000000000001",
      "supra_account",
      "transfer_coins",
      [
        addressToUint8Array(to),
        serializeUint64(BigInt(Number(amount) * 100_000_000)),
      ],
      ["0x1::supra_coin::SupraCoin"], // type argument
    );
    console.log("tx:", txHash);
  };
  // ...
}
```

## What the hook builds (for people extending it)

```ts
const rawTxPayload = [
  sender,                          // accounts[0]
  0,                               // sequence number — wallet fills this in
  moduleAddress,
  moduleName,
  functionName,
  runTimeParams,                   // type args
  params,                          // serialized args
  {},                              // options (empty object)
];
const data = await provider.createRawTransactionData(rawTxPayload);
const txHash = await provider.sendTransaction({ data, from, to, chainId, value: '' });
```

Starkey transparently handles the sequence number even though `0` is passed — it queries the chain itself before signing.

Before building the payload the hook re-reads the account the extension exposes
and refuses to sign as an address the session did not authenticate. It then runs
`ensureChain`, which switches the network if needed and confirms the result by
reading the chain back rather than trusting `changeNetwork`'s own answer.

## Common pitfalls

- **Mixing up `params` and `runTimeParams`.** `params` are the BCS-serialized *value* arguments. `runTimeParams` are *type* arguments (generics). For `transfer_coins<CoinType>(to, amount)`, `runTimeParams = ["0x1::supra_coin::SupraCoin"]` and `params = [addrBytes, amountBytes]`.
- **Forgetting to scale the amount.** If the user types `1.5` and you pass `serializeUint64(BigInt(1))`, they'll send 0.00000001 SUPRA instead of 1.5. Always multiply by `10^decimals` first.
- **Passing a JS `number` instead of `bigint` to `serializeUint64`.** Numbers above `2^53` lose precision. The helper accepts either, but bigint is safer.
- **Assuming `changeNetwork` resolving means the switch happened.** It doesn't reliably. That is why the hook reads the chain back through `ensureChain` — do the same in any custom path.
