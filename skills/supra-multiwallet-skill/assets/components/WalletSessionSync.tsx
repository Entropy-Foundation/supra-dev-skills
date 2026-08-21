'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import useSupraMultiWallet from '@/hooks/useSupraMultiWallet';
import { sameAddress } from '@/lib/address';

/**
 * WalletSessionSync
 *
 * Re-renders the server tree when the connected wallet stops matching the
 * wallet the page was rendered with.
 *
 * WHY THIS COMPONENT EXISTS:
 * A wallet change is a purely client-side event. Any Server Component that
 * reads the auth cookie — a dashboard, a balance, a gated page — keeps
 * rendering the *previous* wallet's data after a switch, because the RSC
 * payload is not re-fetched. The hook's state is correct and the screen is
 * wrong, which reads to the user as "it only updates when I refresh".
 *
 * Renders nothing. Drop it into the layout or page that reads the session.
 *
 *   // app/page.tsx  (Server Component)
 *   const session = await getSession();
 *   return (
 *     <>
 *       <WalletSessionSync serverAddress={session?.address ?? null} />
 *       <Dashboard session={session} />
 *     </>
 *   );
 *
 * Copy this file to: components/WalletSessionSync.tsx in your Next.js project.
 */
export function WalletSessionSync({ serverAddress }: { serverAddress: string | null }) {
  const { accounts, isExtensionInstalled } = useSupraMultiWallet();
  const router = useRouter();

  const clientAddress = accounts[0] ?? null;

  // Both null is in sync (signed out on both sides). One null is a change.
  // Compared through sameAddress because the two sides pad and case addresses
  // differently — a raw !== here would refresh on every render.
  const outOfSync =
    isExtensionInstalled &&
    !(clientAddress === null && serverAddress === null) &&
    !sameAddress(clientAddress, serverAddress);

  useEffect(() => {
    if (outOfSync) router.refresh();
  }, [outOfSync, router]);

  return null;
}

export default WalletSessionSync;
