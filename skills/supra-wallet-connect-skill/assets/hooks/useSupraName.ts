'use client';

/**
 * useSupraName.ts
 *
 * Resolves a wallet address to its primary SupraNS name for display.
 *
 * Returns `null` while resolving, when the account has no name, and when the
 * lookup fails. Every caller must keep the address as the fallback — see
 * `references/suprans-resolution.md` for the two-line call site.
 *
 * This is a separate hook rather than new state inside `useSupraWallet`
 * on purpose: that file is ~1,000 lines of worked-out wallet edge cases, and a
 * cosmetic label has no business being added to it. Projects that don't want
 * SupraNS just skip this file.
 *
 * Copy this file to: hooks/useSupraName.ts in your Next.js project.
 */
import { useEffect, useState } from 'react';
import { normalizeAddress } from '@/lib/address';
import { resolveSupraName } from '@/lib/suprans';

/**
 * Module-scoped so every consumer of the same address shares one lookup for the
 * page's lifetime. Names change rarely and this is display-only, so a reload is
 * an acceptable invalidation boundary.
 */
const nameCache = new Map<string, string | null>();

export function useSupraName(address: string | undefined | null): string | null {
  const account = normalizeAddress(address);
  const [entry, setEntry] = useState<{ account: string; name: string | null } | null>(
    null,
  );

  useEffect(() => {
    if (!account) return;

    const cached = nameCache.get(account);
    if (cached !== undefined) {
      setEntry({ account, name: cached });
      return;
    }

    const controller = new AbortController();

    resolveSupraName(account, undefined, controller.signal)
      .then((name) => {
        nameCache.set(account, name);
        setEntry({ account, name });
      })
      .catch(() => {
        // Deliberately not cached and not surfaced. This is a cosmetic label and
        // the address is already on screen, so there is nothing for the user to
        // act on. Leaving it out of the cache means a transient RPC failure
        // retries on the next mount instead of sticking for the whole session.
      });

    return () => controller.abort();
  }, [account]);

  // Guarding on `entry.account` means an in-flight response for a previous
  // address can never paint under the current one during an account switch.
  return entry?.account === account ? entry.name : null;
}

export default useSupraName;
