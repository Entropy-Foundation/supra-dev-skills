'use client'

import React, { useState, useEffect, createContext, useContext } from 'react';
import useSupraWallet from '@/hooks/useSupraWallet';
import { WALLET_EVENTS } from '@/hooks/useSupraWallet';
import { WalletSessionSync } from '@/components/WalletSessionSync';

// Create a context to hold the wallet state and a force update function
const SupraContext = createContext<any>(null);

export interface WalletProviderProps {
  children: React.ReactNode;
  /**
   * The signed-in address the page was rendered with, read from the auth cookie
   * in a Server Component.
   *
   * Pass it whenever any Server Component renders from the session. A wallet
   * change is client-side only, so the RSC payload is not re-fetched and those
   * components keep showing the *previous* wallet's data - correct client state,
   * wrong screen, reported as "it only updates when I refresh". Supplying this
   * mounts WalletSessionSync, which calls router.refresh() when the connected
   * address and the rendered one diverge.
   *
   * Omit it for an app that renders everything client-side.
   */
  serverAddress?: string | null;
}

export function WalletProvider({ children, serverAddress }: WalletProviderProps) {
  const [forceUpdateKey, setForceUpdateKey] = useState(0);
  const starkey = useSupraWallet();
  // Listen for wallet connection events
  useEffect(() => {
    const handleWalletConnected = () => {
        if(starkey.accounts[0] == null) {
            // Force a re-render of the component tree
            setForceUpdateKey(prev => prev + 1);
        }
    };

    window.addEventListener(WALLET_EVENTS.CONNECTED, handleWalletConnected);

    return () => {
      window.removeEventListener(WALLET_EVENTS.CONNECTED, handleWalletConnected);
    };
  }, []);

  // The key prop forces the component to re-mount when the wallet connects
  return (
    <SupraContext.Provider value={null} key={forceUpdateKey}>
      {serverAddress !== undefined && (
        <WalletSessionSync serverAddress={serverAddress} />
      )}
      {children}
    </SupraContext.Provider>
  );
}

// Custom hook that combines the StarkeyProvider with useStarkeyWallet
export function useSupraWalletWithRefresh() {
  const starkey = useSupraWallet();
  return starkey;
}
