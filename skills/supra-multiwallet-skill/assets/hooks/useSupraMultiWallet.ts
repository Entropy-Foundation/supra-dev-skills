import { useState, useEffect, useRef } from 'react';
import nacl from 'tweetnacl';
import { ethers } from 'ethers';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import useMoveLangConversionUtils from '@/hooks/useConversionUtils';
import { AUTH_MESSAGE } from '@/lib/auth-constants';
import { normalizeAddress, sameAddress } from '@/lib/address';
import { ensureChain } from '@/lib/starkey-network';

// Import types from ribbit-connect package
import {
  type DappMetadata,
  type WalletBalanceRequest,
  type RawTransactionResponse,
  type SignMessageResponse,
  type RawTxnRequest,
  SupraChainId,
  BCS,
  type WalletInfo,
  initSdk,
  type RibbitWalletSDK,
} from 'ribbit-wallet-connect';

// Define wallet types
export type WalletType = 'starkey' | 'ribbit';

// Define wallet capabilities interface
interface WalletCapabilities {
  signMessage: boolean;
  accountSwitching: boolean;
  networkSwitching: boolean;
  rawTransactions: boolean;
  eventListeners: boolean;
  tokenRevalidation: boolean;
}

// Wallet configuration
const WALLET_CONFIGS = {
  starkey: {
    capabilities: {
      signMessage: true,
      accountSwitching: true,
      networkSwitching: true,
      rawTransactions: true,
      eventListeners: true,
      tokenRevalidation: true,
    },
    provider: () =>
      typeof window !== 'undefined' && (window as any)?.starkey?.supra,
  },
  ribbit: {
    capabilities: {
      signMessage: true,
      accountSwitching: false, // Ribbit doesn't support account switching
      networkSwitching: false, // Ribbit network switching happens in-app
      rawTransactions: true,
      eventListeners: false,
      tokenRevalidation: false, // Ribbit doesn't support token revalidation
    },
    provider: () => initSdk(),
  },
} as const;

// Wallet events for communication with the parent window
export const WALLET_EVENTS = {
  CONNECTED: 'wallet-connected',
  PRESIGNED_STATE: 'presigned-state',
  POSTSIGNED_STATE: 'postsigned-state',
  ERROR: 'wallet-error',
} as const;

// Get cookie function
const getCookie = (name: string) => {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split('; ')
    .find((r) => r.startsWith(name + '='));
  return match
    ? decodeURIComponent(match.split('=').slice(1).join('='))
    : null;
};

/**
 * The chain this dApp runs on, as a string. "6" = testnet, "8" = mainnet.
 *
 * Must be quoted where it is configured. Every comparison against the chain
 * the wallet reports is a strict string comparison, so an unquoted integer
 * never matches and network detection fails silently.
 */
const TARGET_CHAIN_ID = process.env.NEXT_PUBLIC_SUPRA_CHAIN_ID || '6';

/** How long to keep asking Starkey for an account before believing "none". */
const ACCOUNT_READ_ATTEMPTS = 8;
const ACCOUNT_READ_DELAY_MS = 250;

/** Extension detection poll. Deliberately never times out - see below. */
const DETECT_INTERVAL_MS = 500;

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * The account Starkey exposes, retried before giving up.
 *
 * `window.starkey` is injected before the extension's background side can
 * answer, so the first `account()` after a page load routinely resolves empty
 * on a wallet that is in fact connected. One empty read is not evidence of a
 * disconnect; several spaced-out empty reads are. Reading once is what makes a
 * page refresh sign the user out.
 *
 * Pass a low `attempts` where there is nothing to reconcile against - the UI
 * must not sit disabled through a retry window that can only confirm what it
 * already knows.
 */
const readStarkeyAccount = async (
  provider: any,
  attempts = ACCOUNT_READ_ATTEMPTS
): Promise<string | null> => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const accounts: string[] = await provider
      .account()
      .catch(() => [] as string[]);
    if (accounts.length > 0) return accounts[0];
    if (attempt < attempts - 1) await delay(ACCOUNT_READ_DELAY_MS);
  }
  return null;
};

/**
 * The account switch currently being re-authenticated. Module-scoped on purpose.
 *
 * Several instances of this hook can be alive at once - WalletProvider calls it,
 * and so does the connect modal - and each one subscribes to `accountChanged`.
 * The per-instance state updates are wanted. The re-auth is a one-time side
 * effect, and running it once per instance would open one signature prompt per
 * instance. The same guard covers the provider event and the window-message
 * fallback both reporting the same switch.
 */
let switchInFlight: string | null = null;

// Storage utility functions
const STORAGE_KEY = 'multiwallet.selectedWallet';

const setStoredWalletType = (walletType: WalletType) => {
  try {
    // Try localStorage first
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(STORAGE_KEY, walletType);
      return;
    }
  } catch (e) {
    console.warn('localStorage not available');
  }

  try {
    // Fallback to sessionStorage
    if (typeof window !== 'undefined' && window.sessionStorage) {
      sessionStorage.setItem(STORAGE_KEY, walletType);
      return;
    }
  } catch (e) {
    console.warn('sessionStorage not available');
  }

  try {
    // Fallback to cookie
    if (typeof document !== 'undefined') {
      document.cookie = `${STORAGE_KEY}=${walletType}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
      return;
    }
  } catch (e) {
    console.warn('cookies not available');
  }
};

const getStoredWalletType = (): WalletType => {
  if (typeof window === 'undefined') return 'starkey';

  try {
    // Try localStorage first
    if (window.localStorage) {
      const stored = localStorage.getItem(STORAGE_KEY) as WalletType;
      if (stored && ['starkey', 'ribbit'].includes(stored)) {
        return stored;
      }
    }
  } catch (e) {
    console.warn('localStorage read failed');
  }

  try {
    // Fallback to sessionStorage
    if (window.sessionStorage) {
      const stored = sessionStorage.getItem(STORAGE_KEY) as WalletType;
      if (stored && ['starkey', 'ribbit'].includes(stored)) {
        return stored;
      }
    }
  } catch (e) {
    console.warn('sessionStorage read failed');
  }

  try {
    // Fallback to cookie
    if (typeof document !== 'undefined') {
      const stored = getCookie(STORAGE_KEY) as WalletType;
      if (stored && ['starkey', 'ribbit'].includes(stored)) {
        return stored;
      }
    }
  } catch (e) {
    console.warn('cookie read failed');
  }

  return 'starkey'; // Default fallback
};

const clearStoredWalletType = () => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch (e) {
    // Silent fail
  }

  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch (e) {
    // Silent fail
  }

  try {
    if (typeof document !== 'undefined') {
      document.cookie = `${STORAGE_KEY}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    }
  } catch (e) {
    // Silent fail
  }
};

export type UseSupraMultiWalletOptions = {
  /**
   * Called after the wallet disconnects, or reports no account at all.
   *
   * Routing is the host app's decision. Earlier versions of this hook called
   * `router.push('/')` from inside a wallet event handler, which yanks the user
   * out of a modal or a nested layout in any app whose landing route is not
   * `/`. Pass a callback if you want navigation; the default is to do nothing
   * but clear wallet state.
   */
  onDisconnect?: () => void;
};

const useSupraMultiWallet = (options: UseSupraMultiWalletOptions = {}) => {
  // Read through a ref so the provider event handlers registered below always
  // see the current callback without re-subscribing.
  const onDisconnectRef = useRef(options.onDisconnect);
  onDisconnectRef.current = options.onDisconnect;

  // Initialize wallet selection from storage
  const [selectedWallet, setSelectedWallet] = useState<WalletType>(getStoredWalletType);
  const [walletCapabilities, setWalletCapabilities] = useState<WalletCapabilities>(
    WALLET_CONFIGS[getStoredWalletType()].capabilities
  );

  // Provider states (keep separate for compatibility)
  const [supraProvider, setSupraProvider] = useState<any>(
    WALLET_CONFIGS.starkey.provider()
  );
  const [ribbitProvider, setRibbitProvider] = useState<RibbitWalletSDK | null>(
    WALLET_CONFIGS.ribbit.provider()
  );

  // Existing states
  const [isExtensionInstalled, setIsExtensionInstalled] =
    useState<boolean>(false);
  const [accounts, setAccounts] = useState<string[]>([]);
  const [networkData, setNetworkData] = useState<any>();
  const [balance, setBalance] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [justRequestedRelative, setJustRequestedRelative] =
    useState<boolean>(false);
  const [transactions, setTransactions] = useState<{ hash: string }[]>([]);
  const [selectedChainId, setSelectedChainId] = useState<string>('');

  /**
   * Serializes wallet prompts: a second click must not open a second popup.
   *
   * A ref, not the `loading` state - that is only visible to the UI once React
   * commits, which leaves a window wide enough for a second click to reach
   * `provider.connect()` and open a second approval sheet.
   */
  const inFlight = useRef(false);

  /**
   * Live mirror of `accounts` for the provider event handlers.
   *
   * Those handlers are registered once against the extension and never
   * re-registered, so they cannot close over state: Starkey documents `on` but
   * no dependable way to take a listener off again, and re-subscribing on every
   * state change would stack duplicates that nothing can remove.
   */
  const accountsRef = useRef<string[]>([]);
  useEffect(() => {
    accountsRef.current = accounts;
  }, [accounts]);

  /** Same reason as accountsRef: the provider subscription outlives this value. */
  const selectedWalletRef = useRef<WalletType>(selectedWallet);
  useEffect(() => {
    selectedWalletRef.current = selectedWallet;
  }, [selectedWallet]);

  /** Holds the extension-detection poll so it is started once and stopped on unmount. */
  const detectTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const addTransactions = (hash: string) => {
    setTransactions((prev) => [{ hash }, ...prev]);
  };

  // Get current wallet provider
  const getCurrentProvider = () => {
    switch (selectedWallet) {
      case 'starkey': {
        return supraProvider;
      }
      case 'ribbit': {
        return ribbitProvider;
      }
      default: {
        return supraProvider;
      }
    }
  };

  // Check if extension is installed
  const checkExtensionInstalled = async () => {
    switch (selectedWallet) {
      case 'starkey': {
        const provider = WALLET_CONFIGS.starkey.provider();
        setSupraProvider(provider);
        setIsExtensionInstalled(!!provider);
        return !!provider;
      }
      case 'ribbit': {
        const provider = WALLET_CONFIGS.ribbit.provider();
        if (!provider) {
          setRibbitProvider(null);
          setIsExtensionInstalled(false);
          return false;
        }

        try {
          setRibbitProvider(provider);
          setIsExtensionInstalled(true);
          return true;
        } catch (error) {
          console.error('Error checking Ribbit wallet readiness:', error);
          setRibbitProvider(null);
          setIsExtensionInstalled(false);
          return false;
        }
      }
      default: {
        return false;
      }
    }
  };

  // Initial provider setup
  useEffect(() => {
    checkExtensionInstalled();
    if (isExtensionInstalled) {
      updateAccounts();
    }
  }, [selectedWallet, isExtensionInstalled]);

  // Extension detection effect
  useEffect(() => {
    const checkExtension = async () => {
      return await checkExtensionInstalled();
    };

    // Initial check
    checkExtension().then((isInstalled) => {
      if (isInstalled && selectedWallet === 'ribbit') {
        updateAccounts();
      }
    });

    // Keep polling until the wallet shows up. No deadline: a user who reads the
    // "install Starkey" prompt, installs it and comes back - or who simply
    // unlocks a locked wallet a minute later - would otherwise stay on the
    // not-installed branch until they reload the page.
    const intv = setInterval(async () => {
      const isInstalled = await checkExtension();
      if (isInstalled) {
        clearInterval(intv);
        if (selectedWallet === 'ribbit') {
          updateAccounts();
        }
      }
    }, 1000);

    return () => clearInterval(intv);
  }, [selectedWallet]);

  /**
   * Starts (or leaves running) the extension-detection poll.
   *
   * Idempotent, so the several callers cannot stack intervals, and without a
   * deadline for the same reason as the effect above: detection that backs a
   * permanent UI state has to keep looking for as long as the component lives.
   */
  const checkIsExtensionInstalled = () => {
    if (detectTimer.current) return;

    detectTimer.current = setInterval(async () => {
      const isInstalled = await checkExtensionInstalled();
      if (isInstalled) {
        if (detectTimer.current) clearInterval(detectTimer.current);
        detectTimer.current = null;
        updateAccounts();
      }
    }, DETECT_INTERVAL_MS);
  };

  // The poll above has no deadline, so unmount is the only thing that stops it.
  useEffect(
    () => () => {
      if (detectTimer.current) clearInterval(detectTimer.current);
      detectTimer.current = null;
    },
    []
  );

  const updateAccounts = async () => {
    const provider = getCurrentProvider();
    if (!provider) return;

    try {
      switch (selectedWallet) {
        case 'starkey': {
          // Retried, not read once: see readStarkeyAccount. A single empty read
          // here is what signs the user out every time they refresh.
          const walletAccount = await readStarkeyAccount(provider);
          setAccounts(walletAccount ? [walletAccount] : []);
          if (walletAccount) {
            localStorage.setItem('starkey.accounts.0', walletAccount);
          } else {
            localStorage.removeItem('starkey.accounts.0');
          }
          // Passed explicitly: `accounts` has not committed yet in this tick, so
          // updateBalance would read the previous value and blank the balance.
          await updateBalance(walletAccount ?? undefined);
          await getNetworkData();
          break;
        }
        case 'ribbit': {
          // Connect to wallet and get current walletAddress. Currently it will return only supra address(string). In future it will return other chain address as well or may be an array of addresses with their chain types({walletAddress: string; chain: string;}).
          const wallet = provider.getWalletInfo();
          if (wallet?.connected) {
            setAccounts([wallet.walletAddress]);
            await updateBalance(wallet.walletAddress);
          } else {
            setAccounts(["0xnotconnected"]);
          }
          break;
        }
        default: {
          setAccounts([]);
          break;
        }
      }
    } catch (error) {
      setAccounts([]);
      switch (selectedWallet) {
        case 'starkey': {
          localStorage.removeItem('starkey.accounts.0');
          break;
        }
        case 'ribbit': {
          // Reset ribbit session
          break;
        }
      }
    }
  };

  /**
   * `addressOverride` exists because callers reach this immediately after
   * reading a new account, before `setAccounts` has committed. Without it the
   * guard below sees the stale array and blanks the balance on first connect.
   */
  const updateBalance = async (addressOverride?: string) => {
    const provider = getCurrentProvider();
    const address = addressOverride ?? accounts[0];
    if (!provider || !address) {
      setBalance('');
      return;
    }

    try {
      switch (selectedWallet) {
        case 'starkey': {
          const balance = await provider.balance();
          if (balance) {
            setBalance(`${balance.formattedBalance} ${balance.displayUnit}`);
          }
          break;
        }
        case 'ribbit': {
          const walletBalanceRequest: WalletBalanceRequest = {
            chainId: parseInt(process.env.NEXT_PUBLIC_SUPRA_CHAIN_ID || '6'),
            resourceType: '0x1::supra_coin::SupraCoin',
            decimals: 7,
          };
          const balanceStr = await provider.getWalletBalance(
            walletBalanceRequest
          );
          setBalance(`${balanceStr.balance || 0} SUPRA`);
          break;
        }
        default: {
          setBalance('');
          break;
        }
      }
    } catch (error) {
      console.error('Error updating balance:', error);
      setBalance('');
    }
  };

  const getNetworkData = async () => {
    const provider = getCurrentProvider();
    if (!provider) return;

    try {
      switch (selectedWallet) {
        case 'starkey': {
          const data = await provider.getChainId();
          setNetworkData(data || {});
          return data;
        }
        case 'ribbit': {
          // Ribbit doesn't have network switching, assume current chain
          const chainId = parseInt(
            process.env.NEXT_PUBLIC_SUPRA_CHAIN_ID || '6'
          );
          const mockNetworkData = { chainId: chainId.toString() };
          setNetworkData(mockNetworkData);
          return mockNetworkData;
        }
        default: {
          setNetworkData({});
          return {};
        }
      }
    } catch (error) {
      console.error('Error getting network data:', error);
      setNetworkData({});
      return {};
    }
  };

  const connectWallet = async (walletType?: WalletType) => {
    // Update wallet selection if provided
    if (walletType) {
      updateSelectedWallet(walletType);
    }

    const provider = walletType
      ? WALLET_CONFIGS[walletType].provider()
      : getCurrentProvider();

    if (!provider) {
      toast('Extension not installed',  {
        description: `Please install the ${
          walletType || selectedWallet
        } extension`,
      });
      return false;
    }

    // A second click must not open a second approval sheet. `loading` cannot do
    // this job - it is only true after React commits.
    if (inFlight.current) return false;
    inFlight.current = true;
    setLoading(true);

    try {
      switch (walletType || selectedWallet) {
        case 'starkey': {
          // Passing the target chain opens the approval sheet on the right
          // network. Starkey ships no types and its docs describe no argument
          // here; an extension that ignores it simply drops the extra argument,
          // which is why ensureChain still runs below either way.
          const approved: string[] | undefined = await provider.connect({
            chainId: TARGET_CHAIN_ID,
          });

          // The approval itself carries the account. Reading it back - retried -
          // is the fallback for a wallet that answers `connect` with nothing
          // useful, the mobile dApp browser among them.
          const walletAccount =
            approved?.[0] ?? (await readStarkeyAccount(provider, 4));

          if (!walletAccount) {
            throw new Error('No account found');
          }

          const responseAcc = [walletAccount];

          {
            localStorage.setItem('isSigningWallet', 'false');

            localStorage.setItem('starkey.accounts.0', responseAcc[0]);
            setAccounts(responseAcc);

            window.dispatchEvent(
              new CustomEvent(WALLET_EVENTS.PRESIGNED_STATE, {
                detail: {
                  timestamp: Date.now(),
                  // The account just read, not the state variable - that has not
                  // committed inside this closure, so `accounts[0]` here is the
                  // previously connected account, or undefined on first connect.
                  account: responseAcc[0],
                },
              })
            );

            // Network validation. ensureChain decides by reading the chain back
            // rather than trusting changeNetwork to report what it did; see
            // lib/starkey-network.ts.
            //
            // The previous version called switchToChain() immediately after
            // setSelectedChainId(), and switchToChain guarded on that state -
            // which React had not committed yet - so on a first connect the
            // switch silently did nothing at all.
            const landedOn = await ensureChain(provider, TARGET_CHAIN_ID);
            setSelectedChainId(landedOn);
            setNetworkData({ chainId: landedOn });

            // Authentication flow. AUTH_MESSAGE is the single source of truth
            // shared with app/api/auth/create-jwt - the server verifies it
            // byte-for-byte, so a local copy of the string here is a silent 401
            // waiting to happen.
            const nonce = await fetch('/api/auth/nonce').then((r) => r.text());
            const signature = await signMessage(
              AUTH_MESSAGE,
              nonce,
              responseAcc[0]
            );

            if (!signature) {
              throw new Error('Message signing was declined');
            }

            window.dispatchEvent(
              new CustomEvent(WALLET_EVENTS.POSTSIGNED_STATE, {
                detail: {
                  timestamp: Date.now(),
                  account: responseAcc[0],
                },
              })
            );

            const response = await fetch('/api/auth/create-jwt', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                address: responseAcc[0],
                signature,
                nonce,
              }),
            });

            const { token } = await response.json();

            await fetch('/api/auth/wallet-login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token }),
            });

            // Dispatch connection event
            window.dispatchEvent(
              new CustomEvent(WALLET_EVENTS.CONNECTED, {
                detail: {
                  timestamp: Date.now(),
                  account: responseAcc[0],
                  wallet: 'starkey',
                },
              })
            );
          }
          break;
        }
        case 'ribbit': {

          const dappMetadata: DappMetadata = {
            name: 'multiwallet',
            description: 'NFT Marketplace and Lootbox Platform',
            logo: window.location.origin + '/favicon.ico',
            url: window.location.origin,
          };

          const response: WalletInfo = await provider.connectToWallet(
            dappMetadata
          );

          if(response.walletAddress == null) {
            throw new Error('No account found');
          }

          if (response?.connected) {
            await updateAccounts();

            if (response.walletAddress) {
              localStorage.setItem('isSigningWallet', 'false');

              window.dispatchEvent(
                new CustomEvent(WALLET_EVENTS.PRESIGNED_STATE, {
                  detail: {
                    timestamp: Date.now(),
                    account: response.walletAddress, // Fixed: was accounts[0]
                  },
                })
              );

              // Authentication flow - matching Starkey exactly
              const nonce = await fetch('/api/auth/nonce').then((r) => r.text());
              const signature = await signMessage(
                AUTH_MESSAGE,
                nonce,
                response.walletAddress
              );

              window.dispatchEvent(
                new CustomEvent(WALLET_EVENTS.POSTSIGNED_STATE, {
                  detail: {
                    timestamp: Date.now(),
                    account: response.walletAddress, // Fixed: was accounts[0]
                  },
                })
              );

              const responseAuth = await fetch('/api/auth/create-jwt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  address: response.walletAddress,
                  signature,
                  nonce, // Fixed: was Date.now()
                }),
              });
  
              const { token } = await responseAuth.json();

              await fetch('/api/auth/wallet-login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token }),
              });

              // Dispatch connection event
              window.dispatchEvent(
                new CustomEvent(WALLET_EVENTS.CONNECTED, {
                  detail: {
                    timestamp: Date.now(),
                    account: response.walletAddress,
                    wallet: 'ribbit',
                  },
                })
              );
            }
          } else {
            throw new Error('Connection rejected');
          }
          break;
        }
        default: {
          throw new Error(
            `Unsupported wallet: ${walletType || selectedWallet}`
          );
        }
      }

      return true;
    } catch (error) {
      console.error('Connect error:', error);

      window.dispatchEvent(
        new CustomEvent(WALLET_EVENTS.ERROR, {
          detail: {
            timestamp: Date.now(),
            error: error,
          },
        })
      );
      return false;
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  };

  const disconnectWallet = async () => {
    const provider = getCurrentProvider();
    if (!provider) return;

    try {
      switch (selectedWallet) {
        case 'starkey': {
          await provider.disconnect();
          await fetch('/api/auth/wallet-logout', { method: 'POST' });
          break;
        }
        case 'ribbit': {
          await provider.disconnect();
          // any further clean up required do that.
          break;
        }
      }

      resetWalletData();
      // Clear wallet selection on disconnect
      clearStoredWalletType();
      onDisconnectRef.current?.();
    } catch (error) {
      console.error('Disconnect error:', error);
      resetWalletData();
      // Clear wallet selection on error too
      clearStoredWalletType();
    }
  };

  const resetWalletData = () => {
    setAccounts([]);
    setBalance('');
    setNetworkData({});

    switch (selectedWallet) {
      case 'starkey': {
        localStorage.setItem('isSigningWallet', 'false');
        localStorage.removeItem('starkey.accounts.0');
        break;
      }
      case 'ribbit': {
        // Any required clean up
        break;
      }
    }
  };

  // THis is just an example about fetching sequence number. To be used in sendTRansaction. In case you want this function to be added in sdk I can do that. 
  const getSequenceNumber = async (address: string): Promise<number> => {
    const data = await fetch(
      `https://rpc-testnet.supra.com/rpc/v1/accounts/${address}`
    );
    if (!data.ok) {
      throw new Error(`Failed to fetch sequence number for ${address}`);
    }
    const accountData = await data.json();
    return accountData.sequence_number;
  };
  // End of example

  const sendRawTransaction = async (
    moduleAddress?: string,
    moduleName?: string,
    functionName?: string,
    params?: any[],
    runTimeParams: any[] = [],
    txExpiryTime: number = Math.ceil(Date.now() / 1000) + 3000
  ) => {
    const provider = getCurrentProvider();
    if (
      !provider ||
      !accounts.length ||
      !moduleAddress ||
      !moduleName ||
      !functionName
    )
      return;

    if (inFlight.current) {
      throw new Error('Another wallet request is already open');
    }
    inFlight.current = true;

    try {
      switch (selectedWallet) {
        case 'starkey': {
          if (!walletCapabilities.rawTransactions) {
            throw new Error('Raw transactions not supported by current wallet');
          }

          // Never sign as an account the session did not authenticate.
          //
          // `accounts[0]` is the address the JWT was issued for. If the user
          // switched account in the extension and the re-auth that follows
          // failed or was rejected, the wallet is on a different key than the
          // session claims - and signing anyway means the chain sees account B
          // while every server-side check reasons about account A.
          const exposed = await readStarkeyAccount(provider, 2);
          if (exposed && !sameAddress(exposed, accounts[0])) {
            throw new Error(
              'Starkey is on a different account than this session - reconnect to continue.'
            );
          }
          const sender = accounts[0];

          // Decided by reading the chain back, not by whether changeNetwork
          // resolved. See lib/starkey-network.ts.
          const landedOn = await ensureChain(provider, TARGET_CHAIN_ID);
          setSelectedChainId(landedOn);
          setNetworkData({ chainId: landedOn });

          const rawTxPayload = [
            sender,
            0, // sequence number
            moduleAddress,
            moduleName,
            functionName,
            runTimeParams,
            params,
            {},
          ];

          const data = await provider.createRawTransactionData(rawTxPayload);
          const txHash = await provider.sendTransaction({
            data,
            from: sender,
            to: moduleAddress,
            chainId: TARGET_CHAIN_ID,
            value: '',
          });

          addTransactions(txHash || 'failed');
          return txHash;
        }
        case 'ribbit': {
          if (!walletCapabilities.rawTransactions) {
            throw new Error('Raw transactions not supported by current wallet');
          }

          let chainId = SupraChainId.TESTNET;

          if (process.env.NEXT_PUBLIC_SUPRA_CHAIN_ID == "6") {
            chainId = SupraChainId.TESTNET;
          } else if (process.env.NEXT_PUBLIC_SUPRA_CHAIN_ID == "8") {
            chainId = SupraChainId.MAINNET;
          }
          
          const rawTxnRequest: RawTxnRequest = {
            sender: accounts[0], // Use actual sender address
            moduleAddress: moduleAddress!, // Use provided module address
            moduleName: moduleName!, // Use provided module name
            functionName: functionName!, // Use provided function name
            typeArgs: runTimeParams, // Use converted runtime parameters
            args: params || [], // Use provided parameters
            chainId,
          };

          const rawTxnBase64: string =
            await provider.createRawTransactionBuffer(rawTxnRequest);

          // Send to wallet
          const response: RawTransactionResponse =
            await provider.signAndSendRawTransaction({
              rawTxn: rawTxnBase64,
              chainId,
              meta: {
                description: `Call ${moduleName}::${functionName}`, // Dynamic description
              },
            });

          if (response.approved) {
            addTransactions(response.txHash || response.result || 'success');
            return response.result || response.txHash;
          } else {
            throw new Error(response.error || 'Transaction rejected');
          }
        }
        default: {
          throw new Error(
            `Raw transactions not supported for wallet: ${selectedWallet}`
          );
        }
      }
    } catch (error) {
      console.error('Send raw transaction error:', error);
      throw error;
    } finally {
      inFlight.current = false;
    }
  };

  const signMessage = async (
    message: string,
    nonce = '12345',
    account?: any,
    forceSign = false
  ) => {
    const provider = getCurrentProvider();
    if (!provider) return;

    switch (selectedWallet) {
      case 'starkey': {
        if (!walletCapabilities.signMessage) {
          throw new Error('Message signing not supported by current wallet');
        }

        if (!accounts.length && !account) return;
        if (!accounts.length && account) {
          accounts[0] = account;
        }
        if (localStorage.getItem('isSigningWallet') === 'true' && !forceSign) {
          return;
        }

        localStorage.setItem('isSigningWallet', 'true');

        const hexMessage = '0x' + Buffer.from(message, 'utf8').toString('hex');

        const response = await provider.signMessage({
          message: hexMessage,
          nonce,
        });

        const { publicKey, signature } = response;
        const verified = nacl.sign.detached.verify(
          new TextEncoder().encode(message),
          Uint8Array.from(Buffer.from(signature.slice(2), 'hex')),
          Uint8Array.from(Buffer.from(publicKey.slice(2), 'hex'))
        );

        localStorage.setItem('isSigningWallet', 'false');
        return { ...response, verified };
      }
      case 'ribbit': {
        if (!walletCapabilities.signMessage) {
          throw new Error('Message signing not supported by current wallet');
        }

        if (!accounts.length && !account) return;
        if (!accounts.length && account) {
          accounts[0] = account;
        }
        if (localStorage.getItem('isSigningWallet') === 'true' && !forceSign) {
          return;
        }

        localStorage.setItem('isSigningWallet', 'true');

        const hexMessage = '0x' + Buffer.from(message, 'utf8').toString('hex');
        const response: SignMessageResponse = await provider.signMessage({
          message: hexMessage,
          nonce: parseInt(nonce),
          chainId: parseInt(process.env.NEXT_PUBLIC_SUPRA_CHAIN_ID || '6'),
        });

        if (response.approved && response.publicKey && response.signature) {
          const { publicKey, signature } = response;
          const verified = nacl.sign.detached.verify(
            new TextEncoder().encode(message),
            Uint8Array.from(Buffer.from(signature.slice(2), 'hex')),
            Uint8Array.from(Buffer.from(publicKey.slice(2), 'hex'))
          );

          localStorage.setItem('isSigningWallet', 'false');
          return { ...response, verified }; // Changed: return full response like Starkey
        } else {
          localStorage.setItem('isSigningWallet', 'false');
          throw new Error(response.error || 'Message signing rejected');
        }
      }
      default: {
        throw new Error(
          `Message signing not supported for wallet: ${selectedWallet}`
        );
      }
    }
  };

  const signIn = async () => {
    if (!walletCapabilities.signMessage) {
      // For wallets without signing capability, skip token revalidation
      return true;
    }

    const provider = getCurrentProvider();
    if (provider && accounts.length) {
      const nonce = await fetch('/api/auth/nonce').then((r) => r.text());
      // AUTH_MESSAGE, not a "revalidate" variant. create-jwt verifies exactly
      // one string, so any other wording here can never verify: revalidation
      // returned 401 every time and the only way out was a full reconnect.
      // forceSign, because the isSigningWallet latch would otherwise make this
      // resolve undefined without ever prompting.
      const signature = await signMessage(AUTH_MESSAGE, nonce, accounts[0], true);

      if (!signature) {
        return false;
      }

      const response = await fetch('/api/auth/create-jwt', {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: accounts[0],
          signature,
          nonce,
        }),
      });

      const { token: newToken } = await response.json();
      localStorage.setItem('authToken', newToken);
      document.cookie = `authToken=${newToken}; path=/; max-age=${
        60 * 60 * 24
      }; SameSite=Lax; ${
        window.location.protocol === 'https:' ? 'Secure;' : ''
      } HttpOnly`;

      window.dispatchEvent(
        new CustomEvent(WALLET_EVENTS.CONNECTED, {
          detail: {
            token: newToken,
            timestamp: Date.now(),
            account: accounts[0],
          },
        })
      );
    }
  };

  const checkAndRevalidateToken = async () => {
    if (!walletCapabilities.tokenRevalidation) {
      return true;
    }

    try {
      const response = await fetch('/api/auth/check', {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        const provider = getCurrentProvider();
        if (provider && accounts.length && !justRequestedRelative) {
          const nonce = await fetch('/api/auth/nonce').then((r) => r.text());
          setJustRequestedRelative(true);
          // Same single string the server verifies - see signIn above.
          const signature = await signMessage(
            AUTH_MESSAGE,
            nonce,
            accounts[0],
            true
          );

          if (!signature) {
            setJustRequestedRelative(false);
            return false;
          }

          const authResponse = await fetch('/api/auth/create-jwt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              address: accounts[0],
              signature,
              nonce,
            }),
          });
          setJustRequestedRelative(false);

          const { token } = await authResponse.json();

          await fetch('/api/auth/wallet-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
          });

          window.dispatchEvent(
            new CustomEvent(WALLET_EVENTS.CONNECTED, {
              detail: {
                timestamp: Date.now(),
                account: accounts[0],
              },
            })
          );

          return true;
        }
        return false;
      }
      return true;
    } catch (error) {
      console.error('Token validation error:', error);
      return false;
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Starkey event handling
  //
  // Starkey's documented event surface is on the provider:
  //
  //   provider.on('accountChanged', (accounts: string[]) => {})
  //   provider.on('networkChanged', (data) => {})
  //   provider.on('disconnect', () => {})
  //
  // https://docs.starkey.app/getting-started/establish-a-connection
  //
  // The `starkey-*` window messages handled further down are the extension's
  // internal page-to-content-script bridge, NOT its API. Current builds do not
  // deliver an account switch to the page that way, so a project that listens
  // only for those messages never learns the account changed and keeps
  // rendering the previous wallet until the page is reloaded. They stay wired
  // here as a fallback, never as the only listener.
  // ───────────────────────────────────────────────────────────────────────────

  /** The Starkey provider as it exists right now, not as state remembers it. */
  const getStarkeyProvider = () => WALLET_CONFIGS.starkey.provider() || null;

  /**
   * Re-authenticates against whatever account the extension now exposes.
   *
   * Order matters. The previous version called /api/auth/wallet-logout first
   * and only then asked for a signature, so a user who declined that prompt was
   * left signed out with wallet state still populated - connected in the UI,
   * rejected by every request. The new credential is acquired first and swapped
   * in on success; failure clears both sides explicitly.
   */
  const handleStarkeyAccountSwitch = async (nextAccounts: string[]) => {
    const next = nextAccounts?.[0] ?? null;

    // Nothing exposed: the user disconnected, locked the wallet, or switched to
    // an account that has not approved this site. Either way the session it was
    // bound to has to go.
    if (!next) {
      await fetch('/api/auth/wallet-logout', { method: 'POST' }).catch(() => {});
      resetWalletData();
      onDisconnectRef.current?.();
      setLoading(false);
      return;
    }

    // Compared through sameAddress: the extension and the stored copy pad and
    // case addresses differently, so a raw !== here re-authenticates the user
    // on every event for no reason.
    if (sameAddress(next, accountsRef.current[0])) {
      await updateAccounts();
      setLoading(false);
      return;
    }

    // Local state follows the wallet in every instance, unconditionally.
    setAccounts([next]);
    localStorage.setItem('starkey.accounts.0', next);

    const switchKey = normalizeAddress(next);
    if (switchInFlight === switchKey) {
      // Another listener - or another instance of this hook - is already
      // re-authenticating this exact account. One prompt, not one per listener.
      await updateAccounts();
      setLoading(false);
      return;
    }
    switchInFlight = switchKey;

    try {
      const nonce = await fetch('/api/auth/nonce').then((r) => r.text());

      // AUTH_MESSAGE and forceSign, for the same two reasons as signIn: the
      // server verifies exactly one string, and the isSigningWallet latch would
      // otherwise resolve this undefined without ever prompting.
      const signResult = await signMessage(AUTH_MESSAGE, nonce, next, true);
      if (!signResult) {
        throw new Error('Message signing was declined');
      }

      // The whole signMessage result, not `signResult.signature`. The route
      // needs both `signature` and `publicKey`, so destructuring here - as the
      // previous version did - made every account switch answer 400 "Invalid
      // signature format".
      const authResponse = await fetch('/api/auth/create-jwt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: next, signature: signResult, nonce }),
      });

      const { token } = await authResponse.json();
      if (!token) {
        throw new Error('Could not mint a session for the new account');
      }

      // Sets the new cookie, replacing the old one. No upfront logout needed.
      await fetch('/api/auth/wallet-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      window.dispatchEvent(
        new CustomEvent(WALLET_EVENTS.CONNECTED, {
          detail: { timestamp: Date.now(), account: next },
        })
      );

      await updateAccounts();
    } catch (error) {
      console.error('Account switch auth error:', error);
      await fetch('/api/auth/wallet-logout', { method: 'POST' }).catch(() => {});
      resetWalletData();
      onDisconnectRef.current?.();
      toast('Authentication Failed', {
        description: 'Failed to authenticate the new account',
      });
    } finally {
      if (switchInFlight === switchKey) switchInFlight = null;
      setLoading(false);
    }
  };

  const handleStarkeyDisconnected = async () => {
    await fetch('/api/auth/wallet-logout', { method: 'POST' }).catch(() => {});
    resetWalletData();
    onDisconnectRef.current?.();
    setLoading(false);
  };

  // Latest logic, read through refs so the provider subscription below can be
  // registered exactly once. Starkey documents `on` but no dependable way to
  // take a listener off again, so a subscription that re-registered on every
  // state change would stack duplicates that nothing can remove.
  const accountChangedRef = useRef<(accounts: string[]) => void>();
  const networkChangedRef = useRef<(data: any) => void>();
  const disconnectedRef = useRef<() => void>();

  accountChangedRef.current = (nextAccounts: string[]) => {
    if (selectedWalletRef.current !== 'starkey') return;
    void handleStarkeyAccountSwitch(nextAccounts ?? []);
  };

  networkChangedRef.current = (data: any) => {
    if (selectedWalletRef.current !== 'starkey') return;
    const next = typeof data === 'string' ? data : data?.chainId;
    if (next) {
      setSelectedChainId(next);
      setNetworkData({ chainId: next });
    }
  };

  disconnectedRef.current = () => {
    if (selectedWalletRef.current !== 'starkey') return;
    void handleStarkeyDisconnected();
  };

  /**
   * Subscribes to the provider events above, once per mount.
   *
   * The extension injects after page scripts run, so the first attempt usually
   * misses and this polls. Like the detection poll, it has no deadline: the user
   * may install or unlock Starkey long after the page opened.
   */
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const onAccountChanged = (accounts: string[]) =>
      accountChangedRef.current?.(accounts);
    const onNetworkChanged = (data: any) => networkChangedRef.current?.(data);
    const onDisconnect = () => disconnectedRef.current?.();

    const subscribe = (): boolean => {
      const provider = getStarkeyProvider();
      if (typeof provider?.on !== 'function') return false;
      provider.on('accountChanged', onAccountChanged);
      provider.on('networkChanged', onNetworkChanged);
      provider.on('disconnect', onDisconnect);
      return true;
    };

    if (!subscribe()) {
      timer = setInterval(() => {
        if (cancelled) return;
        if (subscribe() && timer) {
          clearInterval(timer);
          timer = null;
        }
      }, DETECT_INTERVAL_MS);
    }

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);

      // Removal is undocumented, so feature-test both spellings and accept that
      // some builds support neither.
      const provider = getStarkeyProvider();
      const remove = provider?.off ?? provider?.removeListener;
      if (!provider || typeof remove !== 'function') return;
      remove.call(provider, 'accountChanged', onAccountChanged);
      remove.call(provider, 'networkChanged', onNetworkChanged);
      remove.call(provider, 'disconnect', onDisconnect);
    };
  }, []);

  // Fallback transport: some builds post these window messages. Everything they
  // report is handled by the same functions the provider events use, so the two
  // paths cannot disagree - a duplicate event costs one no-op sameAddress check.
  const starkeyEventHandlerRef = useRef<(event: any) => void>();
  starkeyEventHandlerRef.current = (event: any) => {
    if (!event?.data?.name?.startsWith?.('starkey-')) return;

    switch (event.data.name) {
      case 'starkey-extension-installed': {
        checkIsExtensionInstalled();
        break;
      }
      case 'starkey-wallet-connected':
      case 'starkey-wallet-updated': {
        void (async () => {
          const provider = getStarkeyProvider();
          if (!provider) return;
          // The message carries no account, so it has to be read - retried,
          // because a read taken this soon after a switch can still come back
          // empty on a wallet that is fine.
          const walletAccount = await readStarkeyAccount(provider);
          await handleStarkeyAccountSwitch(walletAccount ? [walletAccount] : []);
        })();
        break;
      }
      case 'starkey-wallet-disconnected': {
        void handleStarkeyDisconnected();
        break;
      }
      case 'starkey-window-removed': {
        // The wallet popup was closed without acting on the request.
        setLoading(false);
        break;
      }
    }
  };

  useEffect(() => {
    if (selectedWallet !== 'starkey' || !walletCapabilities.eventListeners) {
      return;
    }
    const listener = (event: any) => starkeyEventHandlerRef.current?.(event);
    checkIsExtensionInstalled();
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [selectedWallet, walletCapabilities.eventListeners]);

  // Token revalidation effect
  useEffect(() => {
    if (accounts.length > 0 && walletCapabilities.tokenRevalidation) {
      const checkInterval = setInterval(checkAndRevalidateToken, 86400000); // Check every day
      return () => clearInterval(checkInterval);
    }
  }, [accounts, walletCapabilities]);

  const authFetch = async (url: string, options: RequestInit = {}) => {
    if (walletCapabilities.tokenRevalidation) {
      const isValid = await checkAndRevalidateToken();
      if (!isValid) {
        throw new Error('Authentication failed');
      }
    }

    return fetch(url, {
      ...options,
      credentials: 'include',
      headers: {
        ...options.headers,
      },
    });
  };

  const switchToChain = async (chainId?: string) => {
    if (!walletCapabilities.networkSwitching) {
      throw new Error('Network switching not supported by current wallet');
    }

    switch (selectedWallet) {
      case 'starkey': {
        if (!supraProvider) break;

        // No `selectedChainId &&` guard. Callers set that state in the same tick
        // and React has not committed it yet, so the old guard made this a no-op
        // exactly when it was needed - on a first connect. ensureChain also
        // verifies the result by reading the chain back rather than trusting
        // changeNetwork's own answer.
        const landedOn = await ensureChain(
          supraProvider,
          chainId || selectedChainId || TARGET_CHAIN_ID
        );
        setSelectedChainId(landedOn);
        setNetworkData({ chainId: landedOn });
        break;
      }
      case 'ribbit': {
        // Ribbit doesn't support network switching
        // call provider.onChangeNetwork when its handler is added on the app side.
        throw new Error('Network switching not available for Ribbit wallet');
      }
    }
  };

  const getAvailableWallets = () => {
    const availableWallets: Array<{
      type: WalletType;
      name: string;
      isInstalled: boolean;
      capabilities: WalletCapabilities;
    }> = [];

    // Check each wallet type
    Object.entries(WALLET_CONFIGS).forEach(([walletType, config]) => {
      const provider = config.provider();
      const isInstalled = !!provider;

      switch (walletType as WalletType) {
        case 'starkey': {
          availableWallets.push({
            type: 'starkey',
            name: 'Starkey Wallet',
            isInstalled,
            capabilities: config.capabilities,
          });
          break;
        }
        case 'ribbit': {
          availableWallets.push({
            type: 'ribbit',
            name: 'Ribbit Wallet',
            isInstalled,
            capabilities: config.capabilities,
          });
          break;
        }
      }
    });

    return availableWallets;
  };

  const updateSelectedWallet = (walletType: WalletType) => {
    setSelectedWallet(walletType);
    setWalletCapabilities(WALLET_CONFIGS[walletType].capabilities);
    setStoredWalletType(walletType);
  };

  return {
    // New wallet selection functionality
    selectedWallet,
    walletCapabilities,
    getAvailableWallets, // Add this new function

    // Existing interface (unchanged)
    getCurrentProvider,
    isExtensionInstalled,
    accounts,
    networkData,
    balance,
    transactions,
    selectedChainId,
    connectWallet, // Now accepts optional walletType parameter
    disconnectWallet,
    sendRawTransaction,
    signMessage,
    setSelectedChainId,
    switchToChain,
    loading,
    authFetch,
    checkAndRevalidateToken,
    signIn,
  };
};

export default useSupraMultiWallet;
