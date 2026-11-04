/**
 * @file Local intent checks run before Confirm is enabled and again right
 * before signing, plus the device-only recipient warnings (new, lookalike,
 * changed ENS name) that need this phone's payment history.
 *
 * Pure: the caller fetches balance, limits and the executed flag. The wallet's
 * live chain check needs the provider, so it lives in `execute.ts`.
 */
import { formatEther, zeroAddress } from 'viem';
import { formatMon, isChainId, toChecksumAddress, type Intent } from './intent';

/** Fresh device state the checks run against. */
type CheckInput = {
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
type IntentCost = { amount: bigint; fee: bigint; total: bigint };

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
 * Runs the local checks in order: chain, address, amount, caps, balance,
 * expiry, replay and the single pending slot.
 * @param intent Intent to check.
 * @param input Fresh balance, caps, executed flag and clock.
 * @returns ok, or the first failing reason.
 */
export function validateIntent(intent: Intent, input: CheckInput): IntentCheck {
  if (!isChainId(intent.chainId)) return fail('Wrong network. Orb only sends on Monad mainnet or testnet.');

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
 * Address poisoning check: same first 4 and last 4 hex characters, different address.
 * Scammers mint addresses like this and plant them in your history.
 * ponytail: 4+4 chars; a random match is about 1 in 4 billion per pair.
 * @param a Any 0x address.
 * @param b Any 0x address.
 * @returns True when they look alike but are not the same.
 */
export function isLookalike(a: string, b: string): boolean {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x !== y && x.slice(2, 6) === y.slice(2, 6) && x.slice(-4) === y.slice(-4);
}

/** Payment history the recipient checks run against. */
type RecipientHistory = {
  /** Lowercased addresses from `recipients:v1`. */
  known: Set<string>;
  /** The user's own wallet; a lookalike of it is flagged too. */
  wallet: string;
  /** ENS name to lowercased address from `ensBook:v1`. */
  ensBook: Record<string, string>;
};

/**
 * Adds the device-only warnings, most serious first:
 * `LOOKALIKE_RECIPIENT`, `ENS_ADDRESS_CHANGED`, `NEW_RECIPIENT`.
 * @param intent Intent to annotate.
 * @param history This device's payment history.
 * @returns The intent, or a copy with the warnings prepended.
 */
export function withRecipientChecks(intent: Intent, history: RecipientHistory): Intent {
  const to = intent.to.toLowerCase();
  const added: Intent['warnings'] = [];
  if ([...history.known, history.wallet].some((k) => isLookalike(to, k))) added.push('LOOKALIKE_RECIPIENT');
  const before = intent.ensName ? history.ensBook[intent.ensName] : undefined;
  if (before && before !== to) added.push('ENS_ADDRESS_CHANGED');
  if (!history.known.has(to)) added.push('NEW_RECIPIENT');
  const fresh = added.filter((w) => !intent.warnings.includes(w));
  return fresh.length ? { ...intent, warnings: [...fresh, ...intent.warnings] } : intent;
}
