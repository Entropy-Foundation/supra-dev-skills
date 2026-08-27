/**
 * starkey-link.ts
 *
 * Links out to Starkey, for the two cases where the wallet is not reachable
 * from the current browser. Client-safe: URLs only, no environment reads.
 *
 * WHY THIS FILE EXISTS:
 * A phone browser has no extension to inject `window.starkey`, so a "Connect
 * Starkey" button there is a dead end no matter what it says. This file is how
 * a mobile visitor reaches the wallet at all.
 *
 * Copy this file to: lib/starkey-link.ts in your Next.js project.
 */

/** Where a desktop visitor gets the extension. */
export const STARKEY_INSTALL_URL = 'https://starkey.app/';

/**
 * Starkey's in-app dApp browser, pointed back at this page.
 *
 * Handing the current URL to the wallet app reopens the same page inside it,
 * where the provider exists and the normal connect flow works.
 *
 * The page is reopened from scratch in another browser, so nothing in this one
 * carries over — no cookies, no localStorage, no session. If your app is
 * behind a login or a site gate, the user lands on that gate again.
 */
export function starkeyDappBrowserUrl(pageUrl: string): string {
  return `https://starkey.app/dApps?url=${encodeURIComponent(pageUrl)}`;
}

/**
 * Whether this is a browser where the extension cannot exist.
 *
 * User-agent sniffing, because there is no feature to test for: the question
 * is "is this a phone or tablet", not "what can this browser do". iPadOS
 * reports a Macintosh UA, so touch points settle that case.
 */
export function isHandheldBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/Android|iPhone|iPad|iPod/i.test(ua)) return true;
  return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
}
