/**
 * @file Intent model and transfer preparation for Bubble Agent.
 *
 * SHARED FILE: byte-identical copies live at `app/src/intent.ts` and
 * `server/src/intent.ts`. Edit one, copy it to the other;
 * `server/test/shared.test.ts` fails if they drift.
 *
 * The only way an `Intent` is created is `prepareTransfer`, which enforces
 * address validity, provenance (the recipient must appear in the screen
 * context or a user message), amount format, spend caps and balance.
 */
import { formatEther, getAddress, parseEther, zeroAddress, type Address, type PublicClient } from 'viem';

/** Monad testnet. The only chain this product ever touches. */
export const CHAIN_ID = 10143 as const;
/** Intents expire five minutes after creation. */
export const INTENT_TTL_MS = 5 * 60_000;
/** Gas for a plain EOA-to-EOA MON transfer. */
export const EOA_GAS_LIMIT = 21_000n;
/** Max intents the agent may create per request. */
export const MAX_INTENTS_PER_REQUEST = 3;

export type ContextSource = 'screen' | 'clipboard';
export type ProvenanceSource = ContextSource | 'user' | 'both';

export type IntentWarning =
  | 'NEW_RECIPIENT'
  | 'RECIPIENT_IS_CONTRACT'
  | 'SELF_TRANSFER'
  | 'AMOUNT_NOT_IN_CONTEXT'
  | 'PARSED_WITHOUT_AI'
  | 'CLOSE_TO_DAILY_LIMIT';

/** A proposed native MON transfer. Never signed by the server. */
export type Intent = {
  id: string;
  type: 'native_transfer';
  chainId: typeof CHAIN_ID;
  /** Checksummed recipient. */
  to: Address;
  /** Decimal wei string. */
  amountWei: string;
  /** e.g. "2 MON". */
  amountDisplay: string;
  gasLimit: string;
  maxFeePerGasWei: string;
  /** e.g. "0.0021 MON". */
  estFeeDisplay: string;
  provenance: { source: ProvenanceSource; appLabel?: string };
  recipientIsContract: boolean;
  warnings: IntentWarning[];
  createdAt: number;
  expiresAt: number;
  parsedBy: 'agent' | 'fallback';
};

export type TransferErrorCode =
  | 'INVALID_ADDRESS'
  | 'ZERO_ADDRESS'
  | 'ADDRESS_NOT_IN_CONTEXT'
  | 'INVALID_AMOUNT'
  | 'OVER_TX_LIMIT'
  | 'OVER_DAILY_LIMIT'
  | 'INSUFFICIENT_BALANCE'
  | 'RPC_ERROR';

/** Error shape returned to the model and shown to the user (`message` is UX copy). */
export type TransferError = { error: TransferErrorCode; message: string };

/** Captured text from another app (screen) or the clipboard. */
export type ScreenContextInput = { source: ContextSource; appLabel: string; text: string };

/** Everything `prepareTransfer` needs. Amounts are MON decimal strings. */
export type TransferRequest = {
  id: string;
  to: string;
  amountMon: string;
  wallet: Address;
  perTxMon: string;
  dailyRemainingMon: string;
  context: ScreenContextInput | null;
  /** All user-authored messages in the conversation. */
  userTexts: string[];
  parsedBy: Intent['parsedBy'];
  now?: number;
};

/** The read-only chain calls `prepareTransfer` uses. A viem PublicClient satisfies it. */
export type ChainReader = Pick<PublicClient, 'getCode' | 'getBalance' | 'estimateGas' | 'estimateFeesPerGas'>;

const ZERO_WIDTH = /[​-‍﻿]/g;
const MON_DECIMAL = /^\d+(\.\d{1,18})?$/;

/**
 * Removes zero-width characters that chat apps insert into long tokens.
 * @param text Raw text.
 * @returns Text without U+200B–U+200D and U+FEFF.
 */
export function stripZeroWidth(text: string): string {
  return text.replace(ZERO_WIDTH, '');
}

/**
 * Parses a MON decimal string ("2", "0.5") to wei.
 * @param value Decimal string with at most 18 fractional digits; no sign, no exponent.
 * @returns Wei (may be 0n), or null when malformed.
 */
export function parseMon(value: string): bigint | null {
  const v = value.trim();
  return MON_DECIMAL.test(v) ? parseEther(v) : null;
}

/**
 * Formats wei as a short MON string for display.
 * @param wei Amount in wei.
 * @param maxDecimals Fractional digits to keep (truncated, trailing zeros dropped).
 * @returns e.g. "2 MON", "0.0021 MON", or "<0.0001 MON" for dust.
 */
export function formatMon(wei: bigint, maxDecimals = 4): string {
  const [int, frac = ''] = formatEther(wei).split('.');
  const cut = frac.slice(0, maxDecimals).replace(/0+$/, '');
  if (wei > 0n && int === '0' && !cut) return `<0.${'0'.repeat(maxDecimals - 1)}1 MON`;
  return `${int}${cut ? `.${cut}` : ''} MON`;
}

/**
 * Validates and checksums an address. All-lowercase and all-uppercase hex are
 * accepted as unchecksummed; mixed case must carry a valid EIP-55 checksum.
 * @param raw Candidate address, may contain zero-width characters.
 * @returns Checksummed address, or null if invalid.
 */
export function toChecksumAddress(raw: string): Address | null {
  const s = stripZeroWidth(raw).trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(s)) return null;
  const body = s.slice(2);
  const checksummed = getAddress(s.toLowerCase());
  const uniformCase = body === body.toLowerCase() || body === body.toUpperCase();
  return uniformCase || checksummed === s ? checksummed : null;
}

/**
 * Shortens an address for chips and labels.
 * @param address Any 0x address.
 * @returns e.g. "0xAbC1…F123".
 */
export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * Finds where an address came from. The match is case-insensitive, ignores
 * zero-width characters, and must not continue into more hex digits.
 * @param address Checksummed address.
 * @param context Captured screen or clipboard text, if any.
 * @param userTexts User-authored messages.
 * @returns The provenance source, or null if the address appears nowhere.
 */
export function findProvenance(
  address: Address,
  context: ScreenContextInput | null,
  userTexts: string[],
): ProvenanceSource | null {
  const needle = new RegExp(`${address.toLowerCase()}(?![0-9a-f])`);
  const has = (t: string) => needle.test(stripZeroWidth(t).toLowerCase());
  const inContext = !!context && has(context.text);
  const inUser = userTexts.some(has);
  if (inContext && inUser) return 'both';
  if (inContext) return context.source;
  return inUser ? 'user' : null;
}

/**
 * Whether the amount appears (numerically) anywhere in the given texts.
 * @param wei Amount to look for.
 * @param texts Context and user messages.
 * @returns True if any number in the texts equals the amount.
 */
function amountAppears(wei: bigint, texts: string[]): boolean {
  return texts.some((t) => (t.match(/\d+(?:\.\d{1,18})?/g) ?? []).some((n) => parseMon(n) === wei));
}

/** Builds a `TransferError`. */
const fail = (error: TransferErrorCode, message: string): TransferError => ({ error, message });

/**
 * Validates a transfer request and builds an `Intent`. Checks run in the order
 * of spec §9.5: address → provenance → amount → caps → chain state → balance.
 * @param client Read-only chain access.
 * @param req The transfer request.
 * @returns The intent, or a `TransferError` whose `message` is user-facing copy.
 */
export async function prepareTransfer(client: ChainReader, req: TransferRequest): Promise<Intent | TransferError> {
  const to = toChecksumAddress(req.to);
  if (!to) return fail('INVALID_ADDRESS', 'That is not a valid 0x address.');
  if (to === zeroAddress) return fail('ZERO_ADDRESS', 'That is the zero address. Funds sent there are lost.');

  const source = findProvenance(to, req.context, req.userTexts);
  if (!source) {
    return fail('ADDRESS_NOT_IN_CONTEXT', 'I can only pay addresses that appear on your screen or in your message.');
  }

  const amount = parseMon(req.amountMon);
  if (amount === null || amount <= 0n) return fail('INVALID_AMOUNT', 'How much MON should I send?');

  const perTx = parseMon(req.perTxMon) ?? 0n;
  const remaining = parseMon(req.dailyRemainingMon) ?? 0n;
  if (amount > perTx) return fail('OVER_TX_LIMIT', `That's over your ${req.perTxMon} MON per-payment limit.`);
  if (amount > remaining) {
    return fail('OVER_DAILY_LIMIT', `That would exceed today's limit (${req.dailyRemainingMon} MON left).`);
  }

  try {
    const [code, fees, balance] = await Promise.all([
      client.getCode({ address: to }),
      client.estimateFeesPerGas(),
      client.getBalance({ address: req.wallet }),
    ]);
    const isContract = !!code && code !== '0x';
    const gasLimit = isContract
      ? ((await client.estimateGas({ account: req.wallet, to, value: amount })) * 110n) / 100n
      : EOA_GAS_LIMIT;
    const maxFee = fees.maxFeePerGas;
    const fee = gasLimit * maxFee;
    if (balance < amount + fee) {
      return fail(
        'INSUFFICIENT_BALANCE',
        `Not enough MON (balance ${formatMon(balance)}, needed ${formatMon(amount + fee, 6)} incl. fee).`,
      );
    }

    const warnings: IntentWarning[] = [];
    if (isContract) warnings.push('RECIPIENT_IS_CONTRACT');
    if (to === getAddress(req.wallet)) warnings.push('SELF_TRANSFER');
    if (!amountAppears(amount, [...(req.context ? [req.context.text] : []), ...req.userTexts])) {
      warnings.push('AMOUNT_NOT_IN_CONTEXT');
    }
    if (req.parsedBy === 'fallback') warnings.push('PARSED_WITHOUT_AI');
    if (amount * 5n >= remaining * 4n) warnings.push('CLOSE_TO_DAILY_LIMIT');

    const now = req.now ?? Date.now();
    return {
      id: req.id,
      type: 'native_transfer',
      chainId: CHAIN_ID,
      to,
      amountWei: amount.toString(),
      amountDisplay: formatMon(amount, 18),
      gasLimit: gasLimit.toString(),
      maxFeePerGasWei: maxFee.toString(),
      estFeeDisplay: formatMon(fee, 6),
      provenance: { source, ...(req.context && source !== 'user' ? { appLabel: req.context.appLabel } : {}) },
      recipientIsContract: isContract,
      warnings,
      createdAt: now,
      expiresAt: now + INTENT_TTL_MS,
      parsedBy: req.parsedBy,
    };
  } catch (e) {
    return fail('RPC_ERROR', `Couldn't reach Monad testnet: ${(e as Error).message.split('\n')[0].slice(0, 120)}`);
  }
}

/**
 * Type guard separating a successful `prepareTransfer` result from an error.
 * @param r Result of `prepareTransfer`.
 * @returns True when `r` is a `TransferError`.
 */
export function isTransferError(r: Intent | TransferError): r is TransferError {
  return 'error' in r;
}
