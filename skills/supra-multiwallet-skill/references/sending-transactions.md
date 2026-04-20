# Sending Transactions with `sendRawTransaction`

`sendRawTransaction` is the unified API for Move entry function calls across both Starkey and Ribbit. Under the hood the two wallets take very different shapes of input — the hook converts the same user-facing signature into whatever each wallet expects.

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

Move entry functions take **BCS-serialized bytes**, not JavaScript values. The reference project ships a `useConversionUtils` hook (at `hooks/useConversionUtils.ts` in the source repo) wrapping `supra-l1-sdk-core`'s `BCS` and `TxnBuilderTypes` utilities. Common helpers:

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
import useSupraMultiWallet from '@/hooks/useSupraMultiWallet';
import useConversionUtils from '@/hooks/useConversionUtils';

function TransferButton() {
  const { sendRawTransaction, accounts } = useSupraMultiWallet();
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

## Wallet-specific details (for people extending the hook)

### Starkey path

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

If the user's wallet is on the wrong network, the hook calls `provider.changeNetwork({ chainId })` first. This prompts the user to approve the network switch.

### Ribbit path

```ts
const rawTxnRequest: RawTxnRequest = {
  sender,
  moduleAddress,
  moduleName,
  functionName,
  typeArgs: runTimeParams,
  args: params,
  chainId,         // SupraChainId.TESTNET (6) or SupraChainId.MAINNET (8)
};
const rawTxnBase64 = await provider.createRawTransactionBuffer(rawTxnRequest);
const response = await provider.signAndSendRawTransaction({
  rawTxn: rawTxnBase64,
  chainId,
  meta: { description: `Call ${moduleName}::${functionName}` },
});
```

The `meta.description` is what Ribbit shows to the user on the confirmation screen — customize it for your app's transactions (e.g. `"Mint NFT"`, `"Swap 100 USDC for SUPRA"`) so users see meaningful context, not just a module/function name.

Ribbit returns `{ approved, txHash, result, error }`. The hook treats `approved: false` as a rejection and throws with the error message.

## Common pitfalls

- **Mixing up `params` and `runTimeParams`.** `params` are the BCS-serialized *value* arguments. `runTimeParams` are *type* arguments (generics). For `transfer_coins<CoinType>(to, amount)`, `runTimeParams = ["0x1::supra_coin::SupraCoin"]` and `params = [addrBytes, amountBytes]`.
- **Forgetting to scale the amount.** If the user types `1.5` and you pass `serializeUint64(BigInt(1))`, they'll send 0.00000001 SUPRA instead of 1.5. Always multiply by `10^decimals` first.
- **Passing a JS `number` instead of `bigint` to `serializeUint64`.** Numbers above `2^53` lose precision. The helper accepts either, but bigint is safer.
- **Expecting Ribbit to auto-switch networks.** It won't. Check `networkData.chainId` first and if it's wrong, show the user a message telling them to switch in the Ribbit app.
