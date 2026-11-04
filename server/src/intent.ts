/**
 * @file Intent model and transfer preparation for Orb.
 *
 * SHARED FILE: byte-identical copies live at `app/src/intent.ts` and
 * `server/src/intent.ts`. Edit one, copy it to the other;
 * `server/test/shared.test.ts` fails if they drift.
 *
 * The only way an `Intent` is created is `prepareTransfer`, which enforces
 * address validity, provenance (the recipient must appear in the screen
 * context or a user message), amount format, spend caps and balance.
 */
import { defineChain, formatEther, getAddress, parseEther, zeroAddress, type Address, type Chain, type PublicClient } from 'viem';

/** Monad testnet. The only chain this product ever touches. */
export const CHAIN_ID = 10143 as const;
/**
 * Public testnet HTTP RPC.
 * @see https://docs.monad.xyz/developer-essentials/testnets
 */
export const MONAD_TESTNET_RPC_URL = 'https://testnet-rpc.monad.xyz';
/**
 * MonadVision explorer. The other listed explorer is Monadscan; links in this app use MonadVision.
 * @see https://docs.monad.xyz/developer-essentials/testnets
 */
export const MONAD_TESTNET_EXPLORER_URL = 'https://testnet.monadvision.com';
/** Native currency. A MON-gwei is 10^-9 MON, so MON has 18 decimals. */
export const MONAD_NATIVE_CURRENCY = { name: 'MON', symbol: 'MON', decimals: 18 } as const;

/**
 * Monad testnet chain. Callers may substitute the RPC or explorer; id and currency stay fixed.
 * @param rpcUrl HTTP JSON-RPC URL.
 * @param explorerUrl Explorer base URL, no trailing slash.
 * @returns The viem chain definition.
 */
export function monadTestnetChain(rpcUrl: string, explorerUrl: string): Chain {
  return defineChain({
    id: CHAIN_ID,
    name: 'Monad Testnet',
    nativeCurrency: MONAD_NATIVE_CURRENCY,
    rpcUrls: { default: { http: [rpcUrl] } },
    blockExplorers: { default: { name: 'MonadVision', url: explorerUrl } },
    testnet: true,
  });
}

/** Intents expire five minutes after creation. */
const INTENT_TTL_MS = 5 * 60_000;
/** Gas for a plain EOA-to-EOA MON transfer. Always 21,000; do not estimate. */
const EOA_GAS_LIMIT = 21_000n;
/**
 * 7.5% (10_750 bps). Monad bills the gas limit, so this margin is MON spent.
 * Rounds up. @see https://docs.monad.xyz/developer-essentials/wallet-developers
 */
const GAS_LIMIT_MARGIN_BPS = 10_750n;

/** Applies the Monad gas-limit margin to an `eth_estimateGas` result. */
function withMonadGasMargin(estimated: bigint): bigint {
  return (estimated * GAS_LIMIT_MARGIN_BPS + 9_999n) / 10_000n;
}
/** Max intents the agent may create per request. */
export const MAX_INTENTS_PER_REQUEST = 3;

/** Where captured context text came from. */
export type ContextSource = 'screen' | 'clipboard';
/** Where the recipient address was found: context, a user message, or both. */
export type ProvenanceSource = ContextSource | 'user' | 'both';

/** Soft warnings shown on the confirm card; none of them block the payment. */
export type IntentWarning =
  | 'NEW_RECIPIENT'
  | 'RECIPIENT_IS_CONTRACT'
  | 'SELF_TRANSFER'
  | 'AMOUNT_NOT_IN_CONTEXT'
  | 'PARSED_WITHOUT_AI'
  | 'CLOSE_TO_DAILY_LIMIT'
  | 'LOOKALIKE_RECIPIENT'
  | 'ENS_NOT_PRIMARY'
  | 'ENS_ADDRESS_CHANGED'
  | 'ENS_UNUSUAL_CHARACTERS';

/** A proposed native MON transfer. Never signed by the server. */
export type Intent = {
  id: string;
  type: 'native_transfer';
  chainId: typeof CHAIN_ID;
  /** Checksummed recipient. */
  to: Address;
  /** Present when the recipient was typed as a name. */
  ensName?: string;
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
  /**
   * Display-only note, e.g. "dinner". Never used for the amount, the
   * recipient, or the transaction. Omitted when there is nothing to show.
   */
  memo?: string;
};

/** Hard failures from `prepareTransfer`; no intent is created. */
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
type TransferError = { error: TransferErrorCode; message: string };

/** Captured text from another app (screen) or the clipboard. */
export type ScreenContextInput = { source: ContextSource; appLabel: string; text: string };

/** Everything `prepareTransfer` needs. Amounts are MON decimal strings. */
type TransferRequest = {
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
  /** Display-only. Sanitized onto the intent; never affects amount or recipient. */
  memo?: string;
  now?: number;
};

/** The read-only chain calls `prepareTransfer` uses. A viem PublicClient satisfies it. */
export type ChainReader = Pick<PublicClient, 'getCode' | 'getBalance' | 'estimateGas' | 'estimateFeesPerGas'>;

const ZERO_WIDTH = /[​-‍﻿]/g;
const MON_DECIMAL = /^\d+(\.\d{1,18})?$/;

/**
 * Removes zero-width characters that chat apps insert into long tokens.
 * @param text Raw text.
 * @returns Text without U+200B to U+200D and U+FEFF.
 */
export function stripZeroWidth(text: string): string {
  return text.replace(ZERO_WIDTH, '');
}

const MEMO_ADDRESS = /0x[a-fA-F0-9]{40}(?![a-fA-F0-9])/;
/** Longest memo stored on an intent. */
const MAX_MEMO_CHARS = 80;

/**
 * Cleans a display-only memo.
 *
 * Trims, replaces control characters with spaces, collapses whitespace, and
 * keeps at most 80 characters. A blank result or any 0x address is dropped
 * so a memo cannot smuggle a recipient.
 * @param raw Model or parser text. Null and undefined are empty.
 * @returns The memo, or undefined when there is nothing safe to show.
 */
export function sanitizeMemo(raw: string | null | undefined): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const cleaned = stripZeroWidth(raw).replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned || MEMO_ADDRESS.test(cleaned)) return undefined;
  const cut = cleaned.slice(0, MAX_MEMO_CHARS).trim();
  return cut.length > 0 ? cut : undefined;
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
function findProvenance(
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
 * Validates a transfer request and builds an `Intent`. Checks run cheapest and
 * strictest first: address → provenance → amount → caps → chain state → balance.
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
      ? withMonadGasMargin(await client.estimateGas({ account: req.wallet, to, value: amount }))
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
    const memo = sanitizeMemo(req.memo);
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
      ...(memo ? { memo } : {}),
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
