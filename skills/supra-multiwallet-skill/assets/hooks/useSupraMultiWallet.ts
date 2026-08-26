import { normalizeAddress, sameAddress } from '@/lib/address';
import { AUTH_MESSAGE } from '@/lib/auth-constants';
import { ensureChain } from '@/lib/starkey-network';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import nacl from 'tweetnacl';

/**
 * The Starkey provider as it exists right now, not as state remembers it.
 *
 * The extension injects `window.starkey` after page scripts run, so anything
 * that captured the provider at module load or at first render can be holding
 * `null` long after the wallet became available.
 */
const getStarkeyProvider = () =>
  (typeof window !== 'undefined' && (window as any)?.starkey?.supra) || null;

// Wallet events for communication with the parent window
export const WALLET_EVENTS = {
  CONNECTED: 'wallet-connected',
  PRESIGNED_STATE: 'presigned-state',
  POSTSIGNED_STATE: 'postsigned-state',
  ERROR: 'wallet-error',
} as const;

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

  const [supraProvider, setSupraProvider] = useState<any>(getStarkeyProvider);

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

  /** Holds the extension-detection poll so it is started once and stopped on unmount. */
  const detectTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const addTransactions = (hash: string) => {
    setTransactions((prev) => [{ hash }, ...prev]);
  };

  /** Escape hatch for callers that need the raw Starkey provider object. */
  const getCurrentProvider = () => supraProvider;

  // Check if extension is installed
  const checkExtensionInstalled = async () => {
    const provider = getStarkeyProvider();
    setSupraProvider(provider);
    setIsExtensionInstalled(!!provider);
    return !!provider;
  };

  // Initial provider setup
  useEffect(() => {
    checkExtensionInstalled();
    if (isExtensionInstalled) {
      updateAccounts();
    }
  }, [isExtensionInstalled]);

  /**
   * Starts (or leaves running) the extension-detection poll.
   *
   * Idempotent, so the several callers cannot stack intervals, and deliberately
   * without a deadline: detection that backs a permanent UI state has to keep
   * looking for as long as the component lives. A user who reads the "install
   * Starkey" prompt, installs it and comes back - or who simply unlocks a locked
   * wallet a minute later - would otherwise stay on the not-installed branch
   * until they reload the page.
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
    } catch {
      setAccounts([]);
      localStorage.removeItem('starkey.accounts.0');
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
      const balance = await provider.balance();
      if (balance) {
        setBalance(`${balance.formattedBalance} ${balance.displayUnit}`);
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
      const data = await provider.getChainId();
      setNetworkData(data || {});
      return data;
    } catch (error) {
      console.error('Error getting network data:', error);
      setNetworkData({});
      return {};
    }
  };

  const connectWallet = async () => {
    // Read fresh, not from state: the extension can have injected since this
    // component mounted, and `supraProvider` only catches up on the next poll.
    const provider = getStarkeyProvider();

    if (!provider) {
      toast('Extension not installed', {
        description: 'Please install the Starkey extension',
      });
      return false;
    }

    // A second click must not open a second approval sheet. `loading` cannot do
    // this job - it is only true after React commits.
    if (inFlight.current) return false;
    inFlight.current = true;
    setLoading(true);

    try {
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
      const signature = await signMessage(AUTH_MESSAGE, nonce, responseAcc[0]);

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
      await provider.disconnect();
      await fetch('/api/auth/wallet-logout', { method: 'POST' });

      resetWalletData();
      onDisconnectRef.current?.();
    } catch (error) {
      console.error('Disconnect error:', error);
      resetWalletData();
    }
  };

  const resetWalletData = () => {
    setAccounts([]);
    setBalance('');
    setNetworkData({});

    localStorage.setItem('isSigningWallet', 'false');
    localStorage.removeItem('starkey.accounts.0');
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
  };

  const signIn = async () => {
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
    void handleStarkeyAccountSwitch(nextAccounts ?? []);
  };

  networkChangedRef.current = (data: any) => {
    const next = typeof data === 'string' ? data : data?.chainId;
    if (next) {
      setSelectedChainId(next);
      setNetworkData({ chainId: next });
    }
  };

  disconnectedRef.current = () => {
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
    const listener = (event: any) => starkeyEventHandlerRef.current?.(event);
    checkIsExtensionInstalled();
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);

  // Token revalidation effect
  useEffect(() => {
    if (accounts.length > 0) {
      const checkInterval = setInterval(checkAndRevalidateToken, 86400000); // Check every day
      return () => clearInterval(checkInterval);
    }
  }, [accounts]);

  const authFetch = async (url: string, options: RequestInit = {}) => {
    const isValid = await checkAndRevalidateToken();
    if (!isValid) {
      throw new Error('Authentication failed');
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
    if (!supraProvider) return;

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
  };

  return {
    getCurrentProvider,
    isExtensionInstalled,
    accounts,
    networkData,
    balance,
    transactions,
    selectedChainId,
    connectWallet,
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
