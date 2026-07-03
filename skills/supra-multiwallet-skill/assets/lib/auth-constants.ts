/**
 * auth-constants.ts
 *
 * Single source of truth for the sign-in-with-wallet auth message.
 *
 * REQUIRED CUSTOMIZATION: Replace the placeholder values below with your
 * project's actual name and Terms of Service URL before deploying.
 *
 * WHY THIS FILE EXISTS:
 * The auth message is verified byte-for-byte on the server using
 * nacl.sign.detached.verify. Even a single character difference between
 * the message signed on the client and AUTH_MESSAGE on the server causes
 * a silent 401. Previously this string was hardcoded in 6 separate places
 * (5x in useSupraMultiWallet.ts + 1x in create-jwt/route.ts), making drift
 * near-inevitable. This file is the single source of truth — update it
 * here and both client and server automatically stay in sync.
 *
 * USAGE:
 *   import { AUTH_MESSAGE } from '@/lib/auth-constants';
 *
 * Copy this file to: lib/auth-constants.ts in your Next.js project.
 */

// ─── REPLACE THESE VALUES ─────────────────────────────────────────────────────

/** Your application's display name, shown to the user in the wallet prompt. */
const APP_NAME = "MyApp"; // e.g. "Supra DEX", "My NFT Marketplace"

/** The full URL to your Terms of Service page. */
const TOS_URL = "https://myapp.com/tos"; // e.g. "https://supradex.io/tos"

// ──────────────────────────────────────────────────────────────────────────────

/**
 * The exact string that the wallet will ask the user to sign, and that the
 * server will verify against. Must be byte-identical on both sides.
 *
 * Do NOT modify the format of this string template — only change APP_NAME
 * and TOS_URL above. Any whitespace, punctuation, or casing change will
 * break signature verification with no visible error to the user (just a 401).
 */
export const AUTH_MESSAGE =
    `Sign message to login to ${APP_NAME}. By signing this message, you agree to the Terms of Service and Privacy Policy of ${APP_NAME} at ${TOS_URL}`;
