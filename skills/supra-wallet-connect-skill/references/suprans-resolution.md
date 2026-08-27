# SupraNS name resolution

How to show `alice.supra` instead of `0x944f…c2f1` once a wallet is connected.

Ships as two optional files: `assets/lib/suprans.ts` (the resolver) and
`assets/hooks/useSupraName.ts` (the React binding). Neither is imported by anything
else in the skill — a project that doesn't want SupraNS skips both.

---

## Start here: the published docs are not implementable

`https://docs.suprans.id/` is seven pages — introduction, get-username, create-domain,
manage-domain, access-subdomain, why-transfer, how-transfer. Every one is an end-user UI
walkthrough. There is **no developer section, no contract address, no function
reference, and no SDK**, and `suprans` returns zero packages on npm.

Everything below was derived from the deployed contract and confirmed against mainnet.
Don't re-run that research — and don't send someone to the docs site expecting an API.

## Do not call `v2_1_domains`

The obvious-looking module is a dead end. Deployed `v2_1_domains` exposes exactly one
`#[view]`: `get_accumulated_protocol_fees()`. Its `get_reverse_lookup(address)` and
`get_name_props_from_token_addr(address)` are `public fun` but **not** `#[view]`, so
they are unreachable over RPC.

Reading the `ReverseRecord` resource straight off the account is also a dead end — it
stores a token object address, which needs a second resource read to become a name.

Use the **`router`** module. It is the only view-callable surface.

The GitHub source (`DexlynLabs/dexlyn_products_interface` → `dexlyn_sns/core/`) publishes
`native fun` stubs with the `#[view]` annotations stripped. It is a linking interface,
not the deployed source. The on-chain ABI is authoritative.

## Addresses

| Network | Chain ID | RPC | `router` module | `supra_names` core |
|---|---|---|---|---|
| Testnet | `6` | `https://rpc-testnet.supra.com` | `0x5b3edb4f28b69c21d11ca55120460f1ad1f0baa20fb5ccbe4663092faee9ac48` | same address |
| Mainnet | `8` | `https://rpc-mainnet.supra.com` | `0x41aa7e05da1d6f014a59247d06c1832fc4437964b8d21e1f8df7a464f06ea920` | `0x944f432f645bc38929c1995a71ac02366bd86af8c6f75ab378efc147d776c2f1` |

On mainnet the router and the core package are at **different** addresses, and the
`Move.toml` on GitHub lists only the testnet one. Using it against mainnet returns
`404 Information not available` — which looks exactly like "this account has no name",
for every account, with nothing logged. This is the most likely way to get this wrong.

`lib/suprans.ts` keys both maps off `NEXT_PUBLIC_SUPRA_CHAIN_ID`, so a mainnet project
must set it to `'8'`.

## The call

```
router::get_primary_name(address) -> (Option<String> subdomain, Option<String> domain)
```

```
POST https://rpc-mainnet.supra.com/rpc/v3/view
Content-Type: application/json

{ "function": "0x41aa…a920::router::get_primary_name",
  "type_arguments": [],
  "arguments": ["0x944f432f645bc38929c1995a71ac02366bd86af8c6f75ab378efc147d776c2f1"] }
```

| Case | Response | Renders as |
|---|---|---|
| Has a primary name | `{"result":[{"vec":[]},{"vec":["crypto"]}]}` | `crypto.supra` |
| No primary name | `{"result":[{"vec":[]},{"vec":[]}]}` — HTTP **200** | address fallback |

Return order is `(subdomain, domain)`, which is the reverse of the `(domain, subdomain)`
argument order every other router view takes. Transposing them is the easiest mistake
here.

## Encoding rules

- Move `Option<T>` is `{"vec": []}` for `None` and `{"vec": [value]}` for `Some`, in
  **both** arguments and results. Passing `[]` or `null` for an `Option` argument fails
  with `500 parse arguments[N] failed … Expecting a JSON Map for struct`.
- Addresses may be short (`0x1`) or zero-padded to 64 hex — both are accepted. Pad via
  `normalizeAddress()` so cache keys stay canonical.
- A missing name is **HTTP 200 with empty options**, never a 404 and never an error.
  Code that treats "no name" as a failure breaks the address fallback.
- The TLD is `.supra`. The contract returns the bare label (`crypto`); the app appends
  the suffix.

## Call site

`useSupraName` returns `null` while resolving, when the account has no name, and when
the lookup fails. The address is always the fallback:

```tsx
'use client';
import { useSupraName } from '@/hooks/useSupraName';
import { shortenAddress } from '@/lib/address';

export function WalletChip({ address }: { address: string }) {
  const supraName = useSupraName(address);
  return <span title={address}>{supraName ?? shortenAddress(address)}</span>;
}
```

The `title` is not decoration. When a name is displayed the real address must stay
reachable — a user verifying where their funds are going needs to see the address, and a
name is not a substitute for it.

With `ConnectWalletHandler`, the render-prop already hands you `accounts`:

```tsx
<ConnectWalletHandler>
  {({ isConnected, accounts, handleConnect }) =>
    isConnected ? <WalletChip address={accounts[0]} /> : <button onClick={handleConnect}>Connect</button>
  }
</ConnectWalletHandler>
```

That component also has an existing `userProfile.username` slot fed by a
`profile-updated` event. It is for app-level profiles, not SupraNS — don't overload it.
If you want SupraNS to win over an app profile, decide the precedence explicitly at the
call site rather than writing the resolved name into that event.

## Security: display only

A SupraNS name is an NFT. It can be sold, transferred, or left to expire, and the same
label can belong to a different account tomorrow.

- Never compare names to decide identity or authorization. `sameAddress()` remains the
  only identity check in this template.
- Never put the name in the JWT. A stale name would survive until token expiry after a
  transfer, and it would look authoritative because it came from the server.
- Never show a name without the address reachable alongside it.
- Names are user-chosen strings. Render them as text — never into `dangerouslySetInnerHTML`
  — and be aware that homoglyphs (`раypal` with Cyrillic а/р) can impersonate. For any
  money-movement confirmation, show the address, not the name.

## Forward resolution (not shipped)

`alice.supra` → address is `router::get_target_addr(domain, subdomain)`. Note the
argument order is the reverse of `get_primary_name`'s return order, and the input is the
bare label — strip the `.supra` suffix before calling.

```ts
// arguments: [domain, Option<subdomain>]
{ function: `${router}::router::get_target_addr`,
  type_arguments: [],
  arguments: ['alice', { vec: [] }] }        // -> {"result":[{"vec":["0x…"]}]}
```

Resolving a name in a send form is a money path. If you add it:

- Show the resolved address for explicit confirmation before submitting.
- Re-resolve at submit time rather than trusting a value resolved when the field
  was typed — ownership can change between the two.
- Treat an unresolvable name as a validation error, never as "send to zero".
- `router::name_registered(domain, Option<subdomain>)` returns a plain `bool` and is the
  cheap availability check.

## Other router views

All eleven, confirmed on mainnet:

`get_admin_addr()`, `get_expiration(String, Option<String>)`,
`get_name_by_obj_address(address)`, `get_owner_addr(String, Option<String>)`,
`get_pending_admin_addr()`, `get_primary_name(address)`,
`get_subdomain_expiration_policy(String, String)`, `get_target_addr(String, Option<String>)`,
`is_name_owner(address, String, Option<String>)`, `name_registered(String, Option<String>)`,
`tokendata_url_by_name(String, Option<String>)`.

Every `(String, Option<String>)` pair is `(domain, subdomain)`.

## Verifying against the chain

Run the bundled check — it asserts the module is deployed, the empty case is a 200, the
tuple order is `(subdomain, domain)`, and the name round-trips forward to the same
account:

```bash
node assets/scripts/check-suprans.mjs            # mainnet
node assets/scripts/check-suprans.mjs testnet    # needs SUPRANS_TESTNET_NAMED_ADDRESS
```

By hand, for your own wallet:

```bash
curl -s -X POST https://rpc-mainnet.supra.com/rpc/v3/view \
  -H 'Content-Type: application/json' \
  -d '{"function":"0x41aa7e05da1d6f014a59247d06c1832fc4437964b8d21e1f8df7a464f06ea920::router::get_primary_name","type_arguments":[],"arguments":["<YOUR_ADDRESS>"]}'
```

Or with no code at all: SupraScan → the router address → **Modules** tab → `router` →
**View** → `get_primary_name`.

## Troubleshooting

| Symptom | Cause |
|---|---|
| Every account resolves to no name | Wrong network. `NEXT_PUBLIC_SUPRA_CHAIN_ID` unset defaults to `'6'` (testnet); a mainnet app needs `'8'`. Confirm with the module-list curl above — an empty `[]` means nothing is deployed at that address on that network. |
| Your own named account resolves to no name | Owning a name is not enough — it must be set as the **primary** (`set_reverse_lookup`, "set as primary" in the suprans.id UI). Cross-check with `get_owner_addr("yourname", {"vec":[]})`: if that returns your address but `get_primary_name` is empty, that's the reason. |
| `500 … Expecting a JSON Map for struct` | An `Option` argument was passed as `[]` or `null`. It must be `{"vec": []}`. |
| `404 Information not available` | Right function, wrong address for that network — most likely the testnet address against mainnet RPC. |
| Name renders as `alice.pay.supra` instead of `pay.alice.supra` | The `(subdomain, domain)` unwraps in `resolveSupraName` are transposed. |
| Name briefly shows the previous account's after a switch | The `entry.account === account` guard in `useSupraName` was removed. It exists precisely to make a late in-flight response unpaintable. |
