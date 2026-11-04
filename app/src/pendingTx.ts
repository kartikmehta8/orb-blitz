/**
 * @file Pending transaction persistence and resume.
 *
 * A sent transaction is saved to `pending:v1` before waiting for its receipt,
 * so a dismissed sheet or killed app can finish the bookkeeping later. There
 * is one slot: new payments are blocked while it is occupied.
 */
import { TransactionReceiptNotFoundError, type Address, type Hash, type PublicClient } from 'viem';
import { isChainId, TESTNET_CHAIN_ID, toChecksumAddress, type ChainId } from './intent';
import { addSpend } from './limits';
import { OrbApiError } from './errors';
import { addActivity, addEnsName, addRecipient, isHash, isRecord, isWeiString, KEYS, markExecuted, readStored, removeKey, writeJson } from './storage';

/** A sent, unconfirmed payment. Chain data, plus the intent's display memo when it had one. */
export type PendingTx = {
  hash: Hash;
  intentId: string;
  /** Network it was sent on. Missing on payments saved before mainnet support (testnet). */
  chainId?: ChainId;
  to: Address;
  amountWei: string;
  sentAt: number;
  /** Copied from the intent so a later receipt can store it on the activity row. */
  memo?: string;
  /** ENS name that was paid, remembered with its address once the payment confirms. */
  ensName?: string;
};

/** Result of checking a pending payment against the chain. */
export type PendingStatus =
  | { kind: 'none' }
  | { kind: 'confirmed' | 'failed' | 'pending' | 'unknown'; tx: PendingTx };

/** After this long without a receipt, give up and point the user at the explorer. */
const PENDING_STALE_MS = 10 * 60_000;

const isPendingTx = (v: unknown): v is PendingTx =>
  isRecord(v) &&
  isHash(v.hash) &&
  typeof v.intentId === 'string' &&
  (v.chainId === undefined || isChainId(v.chainId)) &&
  typeof v.to === 'string' &&
  toChecksumAddress(v.to) !== null &&
  isWeiString(v.amountWei) &&
  typeof v.sentAt === 'number';

/**
 * Persists a sent payment. Call before waiting for the receipt.
 * @param tx The payment.
 * @returns Resolves once stored.
 */
export async function savePending(tx: PendingTx): Promise<void> {
  await writeJson(KEYS.pending, tx);
}

/**
 * Reads the pending slot. A missing key is empty. Corrupt JSON or a value
 * that is not a pending payment throws, so a bad slot is not "no payment".
 * @returns The pending payment, or null when the slot is empty.
 * @throws OrbApiError when the slot cannot be read or is the wrong shape.
 */
export async function loadPending(): Promise<PendingTx | null> {
  const stored = await readStored(KEYS.pending);
  if (stored === undefined) return null;
  if (!isPendingTx(stored)) throw new OrbApiError('parse', 'Pending payment is corrupt.');
  return stored;
}

/**
 * Applies a receipt: on success adds spend and recipient and marks the intent
 * executed; either way appends to the activity list and clears the slot. Idempotent: does
 * nothing if the slot no longer holds this hash (already finalized elsewhere).
 * @param tx The payment.
 * @param status Receipt status.
 * @returns Resolves once stored.
 */
export async function finalizePending(tx: PendingTx, status: 'success' | 'reverted'): Promise<void> {
  if ((await loadPending())?.hash !== tx.hash) return;
  await removeKey(KEYS.pending);
  const confirmed = status === 'success';
  if (confirmed) {
    await Promise.all([
      addSpend(BigInt(tx.amountWei)),
      addRecipient(tx.to),
      markExecuted(tx.intentId),
      typeof tx.ensName === 'string' && tx.ensName ? addEnsName(tx.ensName, tx.to) : undefined,
    ]);
  }
  const memo = typeof tx.memo === 'string' && tx.memo.length > 0 ? tx.memo : undefined;
  await addActivity({
    hash: tx.hash,
    to: tx.to,
    amountWei: tx.amountWei,
    status: confirmed ? 'confirmed' : 'failed',
    at: Date.now(),
    ...(memo ? { memo } : {}),
    ...(tx.chainId ? { chainId: tx.chainId } : {}),
    ...(typeof tx.ensName === 'string' && tx.ensName ? { ensName: tx.ensName } : {}),
  });
}

/**
 * Looks up one payment's receipt and finalizes it if found.
 * @param client Read-only chain access.
 * @param tx The payment.
 * @param now Clock (ms).
 * @returns confirmed/failed when settled, pending when not yet mined (or RPC
 *   unreachable), unknown when stale (the slot is then cleared).
 */
export async function settlePending(
  client: Pick<PublicClient, 'getTransactionReceipt'>,
  tx: PendingTx,
  now = Date.now(),
): Promise<Exclude<PendingStatus, { kind: 'none' }>> {
  try {
    const receipt = await client.getTransactionReceipt({ hash: tx.hash });
    await finalizePending(tx, receipt.status);
    return { kind: receipt.status === 'success' ? 'confirmed' : 'failed', tx };
  } catch (e) {
    if (!(e instanceof TransactionReceiptNotFoundError) || now - tx.sentAt < PENDING_STALE_MS) return { kind: 'pending', tx };
    if ((await loadPending())?.hash === tx.hash) await removeKey(KEYS.pending);
    return { kind: 'unknown', tx };
  }
}

/**
 * Resumes whatever is in the pending slot (tabs layout and Ask mount).
 * @param clientFor Read-only access per network; the payment's own network is used.
 * @returns The slot's status, or `none` when empty.
 */
export async function checkPending(clientFor: (chainId: ChainId) => Pick<PublicClient, 'getTransactionReceipt'>): Promise<PendingStatus> {
  const tx = await loadPending();
  return tx ? settlePending(clientFor(tx.chainId ?? TESTNET_CHAIN_ID), tx) : { kind: 'none' };
}
