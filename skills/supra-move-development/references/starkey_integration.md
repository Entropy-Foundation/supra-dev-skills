# StarKey Wallet Integration (summary)

StarKey is the native wallet for Supra. This file is a short, current summary of the provider API for contract developers who need to call their module from a page. For a full, production-tested Next.js integration (hook, connect modal, sign-in-with-wallet, SupraNS names), use the **`supra-wallet-connect-skill`** in this plugin instead of writing wallet code from scratch.

Docs: https://docs.starkey.app/supra/api-reference (the older `docs.starkey.app/getting-started/*` URLs no longer exist).

---

## Provider

```javascript
const provider = typeof window !== 'undefined' ? window.starkey?.supra : undefined;
if (!provider) {
    // Not installed, or not injected yet - StarKey injects after page scripts run, so poll.
}
```

## Connect / accounts

```javascript
const accounts = await provider.connect({ chainId: '6' }); // string[] | null (null = user declined)
const address  = accounts?.[0];

const current  = await provider.accounts();          // string[] - [] when nothing is connected
const active   = await provider.getActiveAccount();  // { address, publicKey }
```

`connect()` resolves to an **array** (or `null`), never a bare string. `account()` (singular) is deprecated - use `accounts()`.

## Network

```javascript
const { chainId } = await provider.getChainId();     // '6' testnet, '8' mainnet - strings
await provider.changeNetwork({ chainId: '8' });
```

Read the chain back after `changeNetwork` instead of trusting its result; the mobile dApp browser can reject the call after performing the switch.

## Events

```javascript
provider.on('accountChanged', (accounts) => { /* accounts[0] is the new active account */ });
provider.on('networkChanged', ({ chainId }) => { /* ... */ });
provider.on('disconnect', () => { /* site unlinked */ });
```

## Send a Move entry-function transaction

`createRawTransactionData()` is **deprecated**. Build the raw transaction with `supra-ts-sdk`, hex-encode the bytes, and hand them to `sendTransaction`:

```typescript
import { SupraClient, Network, BCS, TypeTagParser } from 'supra-ts-sdk';

const supra  = new SupraClient({ network: Network.TESTNET });
const sender = accounts[0];
const { sequence_number } = await supra.account.getAccountInfo({ accountAddress: sender });

const rawTxn = supra.transaction.build.rawTxnObject({
    senderAddress: sender,
    senderSequenceNumber: sequence_number,
    function: '0xYOUR_ADDRESS::counter::increment_by',
    functionTypeArgs: [],   // e.g. [new TypeTagParser('0x1::supra_coin::SupraCoin').parseTypeTag()]
    functionArgs: [BCS.bcsSerializeUint64(BigInt(5))],
});

const txHash = await provider.sendTransaction({
    data: Buffer.from(rawTxn.toBytes()).toString('hex'),
    from: sender,
    to: '',
    value: '',
    chainId: '6',
    options: { waitForTransaction: true },
});
```

`sendTransaction` resolves to the hash string, or `null` if the user declined.

## Sign a message

```javascript
const hex = '0x' + Buffer.from(message, 'utf8').toString('hex');
const { address, publicKey, signature } = await provider.signMessage({ message: hex });
```

The wallet signs exactly the decoded message bytes - nothing else is mixed in. If you use signatures for login, put the server nonce **inside** the message text; see the wallet-connect skill's `references/auth-architecture.md`.

## Mobile

Phones have no extension. Send the user to StarKey's in-app browser:

```javascript
location.assign(`https://starkey.app/dApps?url=${encodeURIComponent(location.href)}`);
```

**Sources:** https://docs.starkey.app/supra/api-reference, https://docs.starkey.app/supra/events, https://docs.starkey.app/supra/signing-messages, https://docs.starkey.app/supra/sending-a-transaction, https://docs.starkey.app/mobile-deep-links
