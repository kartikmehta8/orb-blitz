/**
 * @file React hooks shared by the tabs and the Ask sheet: Privy session and
 * embedded wallet, MON balance, and the pending-payment slot.
 */
import {
  useEmbeddedEthereumWallet,
  usePrivy,
  type ConnectedEthereumWallet,
  type PrivyEmailAccount,
  type PrivyUser,
} from '@privy-io/expo';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Address } from 'viem';
import { registerAccessTokenProvider } from './accessToken';
import { publicClient } from './chain';
import { OrbApiError, toOrbApiError } from './errors';
import { toChecksumAddress } from './intent';
import { getOrbState, subscribeOrbState } from './orbBridge';
import type { OrbState } from './orbState';
import { checkPending, type PendingStatus } from './pendingTx';
import { initialPendingView, reducePendingView, type PendingPhase, type PendingView } from './pendingView';

type WalletState = {
  /** Privy has restored (or failed to restore) the session. */
  ready: boolean;
  user: PrivyUser | null;
  /** First embedded Ethereum wallet; null until created. */
  wallet: ConnectedEthereumWallet | null;
  address: Address | null;
  /** Linked email, or null for non-email logins. */
  email: string | null;
};

/**
 * Current Privy user and embedded wallet.
 * @returns Session and wallet state.
 */
export function useWallet(): WalletState {
  const { user, isReady, getAccessToken } = usePrivy();
  const { wallets } = useEmbeddedEthereumWallet();
  useEffect(() => {
    registerAccessTokenProvider(getAccessToken);
  }, [getAccessToken]);
  const wallet = (user && wallets[0]) || null;
  const email = user?.linked_accounts.find((a): a is PrivyEmailAccount => a.type === 'email')?.address ?? null;
  return { ready: isReady, user, wallet, address: wallet ? toChecksumAddress(wallet.address) : null, email };
}

/**
 * MON balance of an address, fetched on change and on demand.
 * @param address Wallet address, or null when signed out.
 * @returns Balance (null until loaded), load error flag and a refresh function.
 */
export function useBalance(address: Address | null): {
  balance: bigint | null;
  error: boolean;
  refresh: () => Promise<void>;
} {
  const [balance, setBalance] = useState<bigint | null>(null);
  const [error, setError] = useState(false);
  const latest = useRef(0);

  const refresh = useCallback(async () => {
    const call = ++latest.current;
    if (!address) {
      setBalance(null);
      return;
    }
    try {
      const value = await publicClient.getBalance({ address });
      if (call !== latest.current) return;
      setBalance(value);
      setError(false);
    } catch {
      if (call === latest.current) setError(true);
    }
  }, [address]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { balance, error, refresh };
}

/** What `usePendingTx` returns. `status` is the chain result screens already read. */
export type PendingTxState = {
  /** Latest chain result. Stays put when a check throws. Starts as `{ kind: 'none' }` only because nothing has loaded. */
  status: PendingStatus;
  /** `loading` until the first check finishes. A thrown check is `error`, never `none`. */
  phase: PendingPhase;
  /** The failure behind `phase === 'error'`. */
  error: OrbApiError | null;
  /**
   * Checks the slot again. Does not throw: a failure sets `phase` to `error`
   * and returns the previous `status`.
   */
  recheck: () => Promise<PendingStatus>;
  /** Same as `recheck`. Named for the error-state retry control. */
  retry: () => Promise<PendingStatus>;
};

/**
 * Resumes the pending-payment slot on mount.
 * @returns Chain status, the explicit phase, and a retry that does not throw.
 */
export function usePendingTx(): PendingTxState {
  const viewRef = useRef<PendingView>(initialPendingView);
  const [view, setView] = useState<PendingView>(initialPendingView);

  const recheck = useCallback(async () => {
    try {
      const status = await checkPending(publicClient);
      const next = reducePendingView(viewRef.current, { type: 'ok', status });
      viewRef.current = next;
      setView(next);
      return status;
    } catch (e) {
      const next = reducePendingView(viewRef.current, { type: 'err', error: toOrbApiError(e) });
      viewRef.current = next;
      setView(next);
      return next.status;
    }
  }, []);

  useEffect(() => {
    void recheck();
  }, [recheck]);

  return { status: view.status, phase: view.phase, error: view.error, recheck, retry: recheck };
}

/**
 * Current orb visual state. `success` and `error` return to `idle` after 1.5s.
 * @returns The latest state from `setOrbState`.
 */
export function useOrbState(): OrbState {
  const [state, setState] = useState<OrbState>(getOrbState);
  useEffect(() => subscribeOrbState(setState), []);
  return state;
}
