/**
 * @file Local intent checks run before Confirm is enabled and again right
 * before signing (spec §7.6, checks 1–7), plus the local `NEW_RECIPIENT` flag.
 *
 * Pure: the caller fetches balance, limits and the executed flag. The wallet's
 * live chain check (part of check 1) needs the provider, so it lives in
 * `execute.ts`.
 */
import { formatEther, zeroAddress } from 'viem';
import { CHAIN_ID, formatMon, toChecksumAddress, type Intent } from './intent';

/** Fresh device state the checks run against. */
export type CheckInput = {
  balanceWei: bigint;
  perTxWei: bigint;
  /** Daily cap minus today's confirmed spend. */
  remainingWei: bigint;
  /** The intent ID is in the executed set. */
  executed: boolean;
  /** Another payment is still pending (single pending slot). */
  otherPending: boolean;
  now: number;
};

/** Outcome of the checks. `reason` is user-facing copy. */
export type IntentCheck = { ok: true } | { ok: false; reason: string };

/** Wei amounts derived from an intent. */
export type IntentCost = { amount: bigint; fee: bigint; total: bigint };

/**
 * Parses an intent's wei fields.
 * @param intent The intent.
 * @returns Amount, max fee and total, or null if any field is malformed.
 */
export function intentCost(intent: Intent): IntentCost | null {
  try {
    const amount = BigInt(intent.amountWei);
    const fee = BigInt(intent.gasLimit) * BigInt(intent.maxFeePerGasWei);
    return { amount, fee, total: amount + fee };
  } catch {
    return null;
  }
}

const fail = (reason: string): IntentCheck => ({ ok: false, reason });

/**
 * Runs local checks 1–7 in spec order.
 * @param intent Intent to check.
 * @param input Fresh balance, caps, executed flag and clock.
 * @returns ok, or the first failing reason.
 */
export function validateIntent(intent: Intent, input: CheckInput): IntentCheck {
  if (intent.chainId !== CHAIN_ID) return fail('Wrong network. Bubble Agent only sends on Monad testnet.');

  const to = toChecksumAddress(intent.to);
  if (!to || to !== intent.to) return fail('That is not a valid 0x address.');
  if (to === zeroAddress) return fail('That is the zero address. Funds sent there are lost.');

  const cost = intentCost(intent);
  if (!cost || cost.amount <= 0n || cost.fee <= 0n) return fail('This payment is malformed. Ask again.');
  if (cost.amount > input.perTxWei) {
    return fail(`That's over your ${formatEther(input.perTxWei)} MON per-payment limit.`);
  }
  if (cost.amount > input.remainingWei) {
    return fail(`That would exceed today's limit (${formatEther(input.remainingWei)} MON left).`);
  }
  if (input.balanceWei < cost.total) {
    return fail(`Not enough MON (balance ${formatMon(input.balanceWei)}, needed ${formatMon(cost.total, 6)} incl. fee).`);
  }
  if (input.now >= intent.expiresAt) return fail('Expired, ask again.');
  if (input.executed) return fail('Already sent. Ask again to make a new payment.');
  if (input.otherPending) return fail('Your last payment is still pending. Try again once it settles.');
  return { ok: true };
}

/**
 * Adds `NEW_RECIPIENT` when the address has never been paid from this device.
 * @param intent Intent to annotate.
 * @param known Lowercased addresses from `recipients:v1`.
 * @returns The same intent, or a copy with the warning first.
 */
export function withNewRecipient(intent: Intent, known: Set<string>): Intent {
  if (known.has(intent.to.toLowerCase()) || intent.warnings.includes('NEW_RECIPIENT')) return intent;
  return { ...intent, warnings: ['NEW_RECIPIENT', ...intent.warnings] };
}
