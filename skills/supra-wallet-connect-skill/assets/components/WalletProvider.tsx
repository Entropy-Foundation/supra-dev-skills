'use client'

import React, { createContext, useContext } from 'react';
import useSupraWallet from '@/hooks/useSupraWallet';
import { WalletSessionSync } from '@/components/WalletSessionSync';

/** Everything useSupraWallet returns, shared through context. */
export type SupraWalletContextValue = ReturnType<typeof useSupraWallet>;

const SupraContext = createContext<SupraWalletContextValue | null>(null);

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

/**
 * Owns one useSupraWallet instance for the tree and shares it through context.
 *
 * Read it with useSupraWalletContext() instead of calling useSupraWallet()
 * again in every component: each extra call is another provider subscription,
 * another detection poll and another retried account read, and the instances
 * only converge after their next event.
 *
 * Earlier versions provided `null` and remounted the entire subtree (through a
 * changing `key`) whenever the wallet connected, which threw away every
 * consumer's local state on login. Context updates re-render consumers;
 * nothing needs to remount.
 */
export function WalletProvider({ children, serverAddress }: WalletProviderProps) {
  const wallet = useSupraWallet();

  return (
    <SupraContext.Provider value={wallet}>
      {serverAddress !== undefined && (
        <WalletSessionSync serverAddress={serverAddress} />
      )}
      {children}
    </SupraContext.Provider>
  );
}

/**
 * The provider's wallet instance. Throws outside <WalletProvider> so a missing
 * provider is a loud error in development, not a silently disconnected UI.
 */
export function useSupraWalletContext(): SupraWalletContextValue {
  const value = useContext(SupraContext);
  if (!value) {
    throw new Error('useSupraWalletContext must be used inside <WalletProvider>');
  }
  return value;
}

/**
 * @deprecated Use useSupraWalletContext(). Kept so copies of earlier versions
 * keep compiling; it now returns the shared instance instead of creating a new one.
 */
export function useSupraWalletWithRefresh() {
  return useSupraWalletContext();
}
