/**
 * @file Intent execution as a hook driving one intent card:
 * local checks → biometric (or hold-to-confirm) → chain check → re-check →
 * sign and send through the Privy embedded wallet → persist pending → receipt.
 *
 * Sends are never retried. An intent is marked executed right before sending,
 * so it can never be sent twice, even if the receipt never arrives.
 */
import type { ConnectedEthereumWallet, PrivyEmbeddedWalletProvider } from '@privy-io/expo';
import * as Haptics from 'expo-haptics';
import * as LocalAuthentication from 'expo-local-authentication';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createWalletClient, custom, toHex, type Address, type Hash } from 'viem';
import { clientFor } from './chain';
import { monadChains } from './config';
import { approvalMode, readDeviceAuth, type DeviceAuthStatus } from './deviceAuth';
import { OrbApiError } from './errors';
import { NETWORKS, type ChainId, type Intent } from './intent';
import { getLimitState } from './limits';
import { finalizePending, loadPending, savePending, settlePending, type PendingTx } from './pendingTx';
import { isExecuted, markExecuted } from './storage';
import { validateIntent, type IntentCheck } from './validateIntent';

/** Card states, in order: idle → confirming → signing → submitted → terminal. */
export type ExecState =
  | { status: 'idle' }
  | { status: 'confirming' }
  | { status: 'signing' }
  | { status: 'submitted'; hash: Hash }
  /** `ms` runs from send to receipt; null when settled by "Check again". */
  | { status: 'confirmed'; hash: Hash; ms: number | null }
  | { status: 'failed'; reason: string; hash: Hash | null }
  | { status: 'pending_timeout'; hash: Hash }
  /** Biometric cancelled or failed; the card can be confirmed again. */
  | { status: 'cancelled' };

/** A local check result; `retryable` marks transient failures (RPC, chain switch). */
type CardCheck = IntentCheck | { ok: false; reason: string; retryable: true };

/** How the user approves: system biometric/PIN prompt, or in-app 1.5 s hold. */
type AuthMode = 'biometric' | 'hold';

type IntentExecution = {
  state: ExecState;
  /** Null while the first check runs. */
  check: CardCheck | null;
  /** Fresh balance from the last check. */
  balanceWei: bigint | null;
  walletStatus: 'loading' | 'ready' | 'error';
  /** Null until device capabilities are known. `null` also means the lookup failed, so Confirm stays disabled. */
  authMode: AuthMode | null;
  /**
   * Full device lookup. `pin` still sets `authMode` to `biometric` (same system prompt).
   * `not-enrolled`, `unavailable`, and `error` set `authMode` to `hold`. `deviceAuth` still reports `error`.
   */
  deviceAuth: DeviceAuthStatus | null;
  /** Approves and sends. With `hold` auth, call it only after the hold completes. */
  confirm: () => Promise<void>;
  /** Re-runs the local checks (after a transient failure). */
  recheck: () => Promise<void>;
  /** Looks up the receipt once after `pending_timeout`. */
  checkAgain: () => Promise<void>;
};

const WALLET_TIMEOUT_MS = 10_000;
const RECEIPT_TIMEOUT_MS = 30_000;
const rpcUnreachable = (chainId: ChainId): CardCheck => ({
  ok: false,
  reason: `Couldn't reach ${NETWORKS[chainId].name}. Check your connection.`,
  retryable: true,
});
const wrongChain = (chainId: ChainId): CardCheck => ({
  ok: false,
  reason: `Couldn't switch your wallet to ${NETWORKS[chainId].name}.`,
  retryable: true,
});

/**
 * Wallet client over the Privy provider. `retryCount: 0` so a send is never retried.
 * @param provider Privy embedded wallet EIP-1193 provider.
 * @param chainId The payment's network.
 * @returns A viem wallet client pinned to that network.
 */
const walletClientFor = (provider: PrivyEmbeddedWalletProvider, chainId: ChainId) =>
  createWalletClient({ chain: monadChains[chainId], transport: custom(provider, { retryCount: 0 }) });

/**
 * Makes sure the wallet is on the payment's network, switching if needed.
 * @param client Wallet client.
 * @param chainId Required chain.
 * @returns True when the wallet ends up on that chain.
 */
async function ensureChain(client: ReturnType<typeof walletClientFor>, chainId: ChainId): Promise<boolean> {
  try {
    if ((await client.getChainId()) === chainId) return true;
    await client.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: toHex(chainId) }] });
    return (await client.getChainId()) === chainId;
  } catch {
    return false;
  }
}

/**
 * One-line, length-capped error text for the card.
 * @param e Anything thrown.
 * @returns viem's `shortMessage` or the first line of the message.
 */
function shortError(e: unknown): string {
  const short = (e as { shortMessage?: unknown } | null)?.shortMessage;
  const text = typeof short === 'string' ? short : e instanceof Error ? e.message : '';
  return text.split('\n')[0].slice(0, 120) || 'Something went wrong.';
}

/**
 * Drives one intent card from local checks to a terminal state.
 * @param intent The locally prepared intent.
 * @param wallet Privy embedded wallet, or null while it is being created.
 * @param address Checksummed wallet address, or null.
 * @param onSettled Called once the payment confirms or reverts (refresh balances).
 * @returns State, checks and actions for the card.
 */
export function useIntentExecution(
  intent: Intent,
  wallet: ConnectedEthereumWallet | null,
  address: Address | null,
  onSettled?: () => void,
): IntentExecution {
  const [state, setState] = useState<ExecState>({ status: 'idle' });
  const [check, setCheck] = useState<CardCheck | null>(null);
  const [balanceWei, setBalanceWei] = useState<bigint | null>(null);
  const [provider, setProvider] = useState<PrivyEmbeddedWalletProvider | null>(null);
  const [walletError, setWalletError] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [deviceAuth, setDeviceAuth] = useState<DeviceAuthStatus | null>(null);
  const busy = useRef(false);
  const txRef = useRef<PendingTx | null>(null);
  const walletRef = useRef(wallet);
  walletRef.current = wallet;
  const settledRef = useRef(onSettled);
  settledRef.current = onSettled;

  useEffect(() => {
    let alive = true;
    void readDeviceAuth(LocalAuthentication).then((status) => {
      if (!alive) return;
      setDeviceAuth(status);
      setAuthMode(approvalMode(status));
    });
    return () => {
      alive = false;
    };
  }, []);

  // Resolve the provider up front so Confirm is only enabled once signing can start (max 10 s).
  // Keyed on the address: Privy may hand back a new wallet object on every render.
  useEffect(() => {
    let alive = true;
    setProvider(null);
    setWalletError(false);
    const fail = () => alive && setWalletError(true);
    const timer = setTimeout(fail, WALLET_TIMEOUT_MS);
    walletRef.current?.getProvider().then((p) => {
      if (!alive) return;
      clearTimeout(timer);
      setProvider(p);
    }, fail);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [address]);

  const runCheck = useCallback(async (): Promise<CardCheck> => {
    if (!address) return { ok: false, reason: 'Sign in to Orb first.' };
    try {
      const [balance, limits, executed, pending] = await Promise.all([
        clientFor(intent.chainId).getBalance({ address }),
        getLimitState(),
        isExecuted(intent.id),
        loadPending(),
      ]);
      setBalanceWei(balance);
      return validateIntent(intent, {
        balanceWei: balance,
        perTxWei: limits.perTxWei,
        remainingWei: limits.remainingWei,
        executed,
        otherPending: !!pending && pending.hash !== txRef.current?.hash,
        now: Date.now(),
      });
    } catch (e) {
      if (e instanceof OrbApiError) return { ok: false, reason: e.message, retryable: true };
      return rpcUnreachable(intent.chainId);
    }
  }, [address, intent]);

  const recheck = useCallback(async () => setCheck(await runCheck()), [runCheck]);

  // Check on mount, and again the moment the intent expires.
  useEffect(() => {
    let alive = true;
    const run = () => runCheck().then((c) => alive && setCheck(c));
    void run();
    const timer = setTimeout(run, Math.max(0, intent.expiresAt - Date.now()) + 100);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [runCheck, intent.expiresAt]);

  const confirm = useCallback(async () => {
    if (busy.current || !provider || !address || !authMode) return;
    busy.current = true;
    try {
      if (authMode === 'biometric') {
        setState({ status: 'confirming' });
        const auth = await LocalAuthentication.authenticateAsync({ promptMessage: 'Confirm payment', cancelLabel: 'Cancel' }).catch(
          () => null,
        );
        if (!auth?.success) {
          setState({ status: 'cancelled' });
          return;
        }
      }

      setState({ status: 'signing' });
      const client = walletClientFor(provider, intent.chainId);
      const fresh = (await ensureChain(client, intent.chainId)) ? await runCheck() : wrongChain(intent.chainId);
      setCheck(fresh);
      if (!fresh.ok) {
        setState({ status: 'idle' });
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }

      await markExecuted(intent.id);
      const sentAt = Date.now();
      let hash: Hash;
      try {
        hash = await client.sendTransaction({
          account: address,
          to: intent.to,
          value: BigInt(intent.amountWei),
          gas: BigInt(intent.gasLimit),
          maxFeePerGas: BigInt(intent.maxFeePerGasWei),
        });
      } catch (e) {
        setState({ status: 'failed', reason: shortError(e), hash: null });
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }

      const tx: PendingTx = {
        hash,
        intentId: intent.id,
        chainId: intent.chainId,
        to: intent.to,
        amountWei: intent.amountWei,
        sentAt,
        ...(intent.memo ? { memo: intent.memo } : {}),
        ...(intent.ensName ? { ensName: intent.ensName } : {}),
      };
      txRef.current = tx;
      // Persist before waiting so a dismissed sheet or killed app can resume it.
      await savePending(tx).catch(() => undefined);
      setState({ status: 'submitted', hash });

      try {
        const receipt = await clientFor(intent.chainId).waitForTransactionReceipt({ hash, pollingInterval: 400, timeout: RECEIPT_TIMEOUT_MS });
        const ms = Date.now() - sentAt;
        await finalizePending(tx, receipt.status).catch(() => undefined);
        if (receipt.status === 'success') {
          setState({ status: 'confirmed', hash, ms });
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
          setState({ status: 'failed', reason: 'Transaction reverted.', hash });
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
        settledRef.current?.();
      } catch {
        setState({ status: 'pending_timeout', hash });
      }
    } catch (e) {
      setState({ status: 'failed', reason: shortError(e), hash: txRef.current?.hash ?? null });
    } finally {
      busy.current = false;
    }
  }, [provider, address, authMode, intent, runCheck]);

  const checkAgain = useCallback(async () => {
    const tx = txRef.current;
    if (busy.current || !tx) return;
    busy.current = true;
    setState({ status: 'submitted', hash: tx.hash });
    try {
      const result = await settlePending(clientFor(tx.chainId ?? intent.chainId), tx);
      if (result.kind === 'confirmed') {
        setState({ status: 'confirmed', hash: tx.hash, ms: null });
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else if (result.kind === 'failed') {
        setState({ status: 'failed', reason: 'Transaction reverted.', hash: tx.hash });
      } else if (result.kind === 'unknown') {
        setState({ status: 'failed', reason: 'Status unknown. Check the explorer.', hash: tx.hash });
      } else {
        setState({ status: 'pending_timeout', hash: tx.hash });
      }
      if (result.kind === 'confirmed' || result.kind === 'failed') settledRef.current?.();
    } catch {
      setState({ status: 'pending_timeout', hash: tx.hash });
    } finally {
      busy.current = false;
    }
  }, [intent.chainId]);

  return {
    state,
    check,
    balanceWei,
    walletStatus: provider ? 'ready' : walletError ? 'error' : 'loading',
    authMode,
    deviceAuth,
    confirm,
    recheck,
    checkAgain,
  };
}
