/**
 * suprans.ts
 *
 * SupraNS (Supra Name Service) reverse resolution: address -> "name.supra".
 *
 * WHY NOT `v2_1_domains`: the deployed `v2_1_domains` module exposes exactly one
 * `#[view]` function (`get_accumulated_protocol_fees`). Its `get_reverse_lookup`
 * is `public fun` but not `#[view]`, so it cannot be called over RPC at all. The
 * `router` module is the only view-callable surface. Reading the `ReverseRecord`
 * resource off the account directly is also a dead end — it stores a token object
 * address that needs a second resource read to become a name.
 *
 * WHY THE ADDRESS MAP: on mainnet the router and the core package are deployed at
 * *different* addresses, and the `Move.toml` published on GitHub lists only the
 * testnet one. Pointing at the wrong address returns 404 and silently degrades
 * every account to "no name" — there is no error to notice.
 *
 * SECURITY: display only. A SupraNS name is transferable and is not proof of
 * identity. Never compare names for auth and never accept one in place of an
 * address — `sameAddress()` from ./address stays the only identity check.
 *
 * Copy this file to: lib/suprans.ts in your Next.js project.
 */
import { normalizeAddress } from './address';

/** Keyed by NEXT_PUBLIC_SUPRA_CHAIN_ID. 6 = testnet, 8 = mainnet. */
const SNS_ROUTER: Record<string, string> = {
  '6': '0x5b3edb4f28b69c21d11ca55120460f1ad1f0baa20fb5ccbe4663092faee9ac48',
  '8': '0x41aa7e05da1d6f014a59247d06c1832fc4437964b8d21e1f8df7a464f06ea920',
};

const SNS_RPC: Record<string, string> = {
  '6': 'https://rpc-testnet.supra.com',
  '8': 'https://rpc-mainnet.supra.com',
};

const SNS_TLD = 'supra';

/** Move `Option<T>` over JSON: `{vec: []}` is None, `{vec: [value]}` is Some. */
type MoveOption<T> = { vec: [] | [T] };

function unwrap<T>(option: MoveOption<T> | undefined): T | null {
  return option?.vec?.length ? option.vec[0] : null;
}

/**
 * The account's primary SupraNS name, or `null` when it has none.
 *
 * Throws only on transport or RPC failure. An account without a name is a
 * successful `null` — the chain answers `200` with two empty options, so a
 * caller that treats "no name" as an error will break the address fallback.
 *
 * Isomorphic: safe to call from a client component, a Server Component, or a
 * route handler.
 */
export async function resolveSupraName(
  address: string,
  chainId: string = process.env.NEXT_PUBLIC_SUPRA_CHAIN_ID || '6',
  signal?: AbortSignal,
): Promise<string | null> {
  const account = normalizeAddress(address);
  const router = SNS_ROUTER[chainId];
  const rpc = SNS_RPC[chainId];
  if (!account || !router || !rpc) return null;

  const response = await fetch(`${rpc}/rpc/v3/view`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      function: `${router}::router::get_primary_name`,
      type_arguments: [],
      arguments: [account],
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`SupraNS view call failed: ${response.status}`);
  }

  const { result } = (await response.json()) as {
    result: [MoveOption<string>, MoveOption<string>];
  };

  // Ordering is (subdomain, domain) — the reverse of the (domain, subdomain)
  // argument order every other router view takes. Easy to transpose.
  const subdomain = unwrap(result?.[0]);
  const domain = unwrap(result?.[1]);
  if (!domain) return null;

  return subdomain ? `${subdomain}.${domain}.${SNS_TLD}` : `${domain}.${SNS_TLD}`;
}
