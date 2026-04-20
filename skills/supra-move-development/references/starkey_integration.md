# StarKey Wallet Integration

StarKey is the native browser wallet for Supra. Docs: https://docs.starkey.app

---

## Provider Access

StarKey injects two namespaces into the browser window:

- `window.starkey` — current documented API (use this for new code)
- `window.starKeyWallet` — older namespace, still present in some environments

```javascript
function getProvider() {
    if ('starkey' in window) {
        return window.starkey.supra;
    }
    throw new Error('StarKey wallet not found. Install from https://starkey.app');
}
```

---

## Connect

`connect()` returns a **Promise that resolves to an array**. The connected account address is at index `[0]`.

```javascript
const provider = getProvider();
const accounts = await provider.connect();
const address = accounts[0];
// e.g. "0x534583cd8cE0ac1af4Ce01Ae4f294d52b4Cd305F"
```

Do not treat the return value as a plain string — it is always an array.

---

## Send a Transaction

```javascript
const provider = getProvider();

const transaction = {
    from:  fromAddress,    // string - sender address
    to:    toAddress,      // string - recipient address
    value: amount,         // amount in smallest unit
    data:  "",             // hex-encoded calldata, empty string for simple transfers
};

const txHash = await provider.sendTransaction(transaction);
console.log("txHash:", txHash);
```

---

## Detect Wallet Presence

```javascript
if (typeof window !== 'undefined' && 'starkey' in window) {
    // wallet is available
} else {
    // prompt user to install StarKey
}
```

---

## Notes

- Always guard with `typeof window !== 'undefined'` in SSR/Next.js environments — the wallet only exists in the browser.
- The official docs are at https://docs.starkey.app — verify the API before shipping since the wallet SDK evolves.

**Sources verified against:** https://docs.starkey.app/getting-started/establish-a-connection, https://docs.starkey.app/getting-started/sending-a-transaction
