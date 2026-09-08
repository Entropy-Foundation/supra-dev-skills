/**
 * starkey-network.ts
 *
 * Getting Starkey onto the target chain.
 *
 * WHY THIS FILE EXISTS:
 * `changeNetwork` cannot be trusted to report what it did. Starkey's mobile
 * dApp browser rejects the call with "Unrecognized chain ID." *after* carrying
 * out the switch, so a project that treats the rejection as failure reports a
 * network error while the wallet is sitting on the right chain — the classic
 * "works on desktop, fails on mobile" connect bug. The read-back below also
 * catches the opposite lie: a wallet that resolves the call and stays put.
 *
 * Copy this file to: lib/starkey-network.ts in your Next.js project.
 */

/** The part of the Starkey provider this module touches. */
type NetworkProvider = {
  getChainId(): Promise<{ chainId: string }>;
  changeNetwork(args: { chainId: string }): Promise<{ chainId: string }>;
};

/**
 * The wallet is on a chain the app cannot use. Carries that chain so callers
 * can tell the user which network they are stuck on rather than showing a blank.
 */
export class WrongChainError extends Error {
  /** The chain the wallet is actually on. */
  readonly chainId: string;

  constructor(message: string, chainId: string) {
    super(message);
    this.name = 'WrongChainError';
    this.chainId = chainId;
  }
}

function messageOf(error: unknown): string | null {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return null;
}

/**
 * Puts the wallet on `chainId` and returns the chain it ends up on.
 *
 * Success is decided by reading the chain back, never by whether
 * `changeNetwork` resolved. Throws `WrongChainError` only when the wallet is
 * genuinely on the wrong chain, quoting the wallet's own words when it also
 * rejected — that string is the only diagnostic a user of the mobile dApp
 * browser can give you, since it exposes no console.
 *
 * `chainId` must be a string ("6" = testnet, "8" = mainnet). Comparison is
 * strict, so an unquoted integer in NEXT_PUBLIC_SUPRA_CHAIN_ID never matches.
 */
export async function ensureChain(
  provider: NetworkProvider,
  chainId: string,
  networkName = `chain ${chainId}`
): Promise<string> {
  const before = await provider.getChainId();
  if (before.chainId === chainId) return before.chainId;

  let rejection: string | null = null;
  try {
    await provider.changeNetwork({ chainId });
  } catch (cause) {
    rejection = messageOf(cause) ?? 'rejected with no message';
  }

  const after = await provider.getChainId();
  if (after.chainId === chainId) return after.chainId;

  throw new WrongChainError(
    rejection
      ? `Switch Starkey to ${networkName} to continue — the wallet refused: ${rejection}`
      : `Switch Starkey to ${networkName} to continue.`,
    after.chainId
  );
}
