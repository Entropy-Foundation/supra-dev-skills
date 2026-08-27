/**
 * address.ts
 *
 * Address helpers, safe to import from both client and server.
 *
 * WHY THIS FILE EXISTS:
 * Supra addresses arrive in different shapes depending on where they came
 * from — the Starkey extension, a Move view response, a JWT claim, or
 * localStorage. Some are zero-padded to 32 bytes, some are not; case is not
 * guaranteed either. A raw `===` between two of them produces false
 * mismatches (spurious re-auth loops, phantom account switches) and can just
 * as easily miss a real one. Every address comparison in this template goes
 * through `sameAddress`.
 *
 * Copy this file to: lib/address.ts in your Next.js project.
 */

/**
 * Lowercase, `0x`-prefixed, zero-padded to 32 bytes. `null` if the input is
 * not an address at all, so a bad value can never compare equal to anything.
 */
export function normalizeAddress(address: unknown): string | null {
  if (typeof address !== 'string') return null;
  const hex = (address.startsWith('0x') ? address.slice(2) : address).toLowerCase();
  if (hex.length === 0 || hex.length > 64 || !/^[0-9a-f]+$/.test(hex)) return null;
  return `0x${hex.padStart(64, '0')}`;
}

/** True only when both inputs are addresses and they are the same one. */
export function sameAddress(a: unknown, b: unknown): boolean {
  const left = normalizeAddress(a);
  return left !== null && left === normalizeAddress(b);
}

/** `0x1234…abcdef`, for display. Never use the result in a comparison. */
export function shortenAddress(address: string, visible = 6): string {
  if (address.length <= visible * 2 + 2) return address;
  return `${address.slice(0, visible + 2)}…${address.slice(-visible)}`;
}
