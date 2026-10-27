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
import { publicClient } from './chain';
import { toChecksumAddress } from './intent';
import { checkPending, type PendingStatus } from './pendingTx';

export type WalletState = {
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
  const { user, isReady } = usePrivy();
  const { wallets } = useEmbeddedEthereumWallet();
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

/**
 * Resumes the pending-payment slot on mount (spec §7.8).
 * @returns The slot status and a re-check function.
 */
export function usePendingTx(): { status: PendingStatus; recheck: () => Promise<PendingStatus> } {
  const [status, setStatus] = useState<PendingStatus>({ kind: 'none' });

  const recheck = useCallback(async () => {
    const next = await checkPending(publicClient).catch((): PendingStatus => ({ kind: 'none' }));
    setStatus(next);
    return next;
  }, []);

  useEffect(() => {
    void recheck();
  }, [recheck]);

  return { status, recheck };
}
