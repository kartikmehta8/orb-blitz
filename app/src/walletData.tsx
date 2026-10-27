/**
 * @file Wallet data shared by the tabs: balance, pending payment, activity
 * and spending limits, loaded once in the tabs layout.
 *
 * One provider (instead of one fetch per tab) keeps the tabs in sync and
 * makes sure the pending slot is resumed by a single caller, so a settled
 * payment is never finalized twice.
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import type { Address } from 'viem';
import { useBalance, usePendingTx, useWallet } from './hooks';
import { getLimitState, type LimitState } from './limits';
import type { PendingStatus } from './pendingTx';
import { getActivity, type ActivityTx } from './storage';

type WalletData = {
  address: Address | null;
  email: string | null;
  /** Balance in wei; null until loaded. */
  balance: bigint | null;
  balanceError: boolean;
  pending: PendingStatus;
  recheckPending: () => void;
  /** Finished payments, newest first; null while loading. */
  activity: ActivityTx[] | null;
  /** Caps and today's spend; null while loading. */
  limits: LimitState | null;
  /** Re-reads activity and limits from storage. */
  reloadLocal: () => Promise<void>;
  /** Re-checks the pending payment, the balance and local data. */
  refresh: () => Promise<void>;
};

const WalletDataContext = createContext<WalletData | null>(null);

/**
 * Loads wallet data and refreshes it on foreground and when a pending payment settles.
 * @param props.children The signed-in tabs.
 * @returns The context provider.
 */
export function WalletDataProvider({ children }: { children: ReactNode }) {
  const { address, email } = useWallet();
  const { balance, error: balanceError, refresh: refreshBalance } = useBalance(address);
  const { status: pending, recheck } = usePendingTx();
  const [activity, setActivity] = useState<ActivityTx[] | null>(null);
  const [limits, setLimits] = useState<LimitState | null>(null);

  const reloadLocal = useCallback(async () => {
    const [items, state] = await Promise.all([getActivity(), getLimitState()]);
    setActivity(items);
    setLimits(state);
  }, []);

  const refresh = useCallback(async () => {
    await Promise.all([recheck(), refreshBalance(), reloadLocal()]);
  }, [recheck, refreshBalance, reloadLocal]);

  useEffect(() => {
    void reloadLocal();
  }, [reloadLocal]);

  // A resumed payment just settled: spend, activity and balance changed.
  useEffect(() => {
    if (pending.kind === 'confirmed' || pending.kind === 'failed') {
      void reloadLocal();
      void refreshBalance();
    }
  }, [pending, reloadLocal, refreshBalance]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void refresh());
    return () => sub.remove();
  }, [refresh]);

  const value: WalletData = {
    address,
    email,
    balance,
    balanceError,
    pending,
    recheckPending: () => void recheck(),
    activity,
    limits,
    reloadLocal,
    refresh,
  };
  return <WalletDataContext.Provider value={value}>{children}</WalletDataContext.Provider>;
}

/**
 * Reads the shared wallet data.
 * @returns Wallet data from the nearest `WalletDataProvider`.
 */
export function useWalletData(): WalletData {
  const data = useContext(WalletDataContext);
  if (!data) throw new Error('useWalletData must be used inside WalletDataProvider');
  return data;
}
