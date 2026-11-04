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
 *
 * A recipient may be an ENS name (`.eth`). Names resolve on Ethereum mainnet,
 * where ENS lives; the payment itself settles on the chosen Monad network.
 */
import { defineChain, formatEther, getAddress, parseEther, zeroAddress, type Address, type Chain, type PublicClient } from 'viem';
import { normalize } from 'viem/ens';

/** Monad testnet: free test MON. */
export const TESTNET_CHAIN_ID = 10143 as const;
/** Monad mainnet: real MON. */
export const MAINNET_CHAIN_ID = 143 as const;
/** The two chains Orb pays on. */
export type ChainId = typeof TESTNET_CHAIN_ID | typeof MAINNET_CHAIN_ID;
export const CHAIN_IDS: readonly ChainId[] = [TESTNET_CHAIN_ID, MAINNET_CHAIN_ID];

/**
 * Public RPC and MonadVision explorer per chain. Callers may substitute RPCs.
 * @see https://docs.monad.xyz/developer-essentials/network-information
 */
export const NETWORKS: Record<ChainId, { key: 'testnet' | 'mainnet'; name: string; rpcUrl: string; explorerUrl: string }> = {
  [TESTNET_CHAIN_ID]: {
    key: 'testnet',
    name: 'Monad Testnet',
    rpcUrl: 'https://testnet-rpc.monad.xyz',
    explorerUrl: 'https://testnet.monadvision.com',
  },
  [MAINNET_CHAIN_ID]: { key: 'mainnet', name: 'Monad Mainnet', rpcUrl: 'https://rpc.monad.xyz', explorerUrl: 'https://monadvision.com' },
};
/** Native currency on both chains. A MON-gwei is 10^-9 MON, so MON has 18 decimals. */
export const MONAD_NATIVE_CURRENCY = { name: 'MON', symbol: 'MON', decimals: 18 } as const;

/** @returns True for a chain Orb pays on. */
export const isChainId = (v: unknown): v is ChainId => v === TESTNET_CHAIN_ID || v === MAINNET_CHAIN_ID;

/**
 * viem chain definition. Id and currency stay fixed; the RPC and explorer may be substituted.
 * @param chainId Testnet or mainnet.
 * @param rpcUrl HTTP JSON-RPC URL (default: the public one).
 * @param explorerUrl Explorer base URL, no trailing slash.
 * @returns The chain.
 */
export function monadChain(chainId: ChainId, rpcUrl = NETWORKS[chainId].rpcUrl, explorerUrl = NETWORKS[chainId].explorerUrl): Chain {
  return defineChain({
    id: chainId,
    name: NETWORKS[chainId].name,
    nativeCurrency: MONAD_NATIVE_CURRENCY,
    rpcUrls: { default: { http: [rpcUrl] } },
    blockExplorers: { default: { name: 'MonadVision', url: explorerUrl } },
    testnet: chainId === TESTNET_CHAIN_ID,
  });
}

const SAYS_MAINNET = /\bmain[\s-]?net\b/i;
const SAYS_TESTNET = /\btest[\s-]?net\b/i;

/**
 * The network the user named in their own words, newest message first.
 * Payments never default: with no mention, the caller must ask.
 * A message that names both is ambiguous and skipped.
 * @param userTexts User-authored messages, oldest first.
 * @returns The chain, or null when the user has not said.
 */
export function networkMentioned(userTexts: readonly string[]): ChainId | null {
  for (let i = userTexts.length - 1; i >= 0; i--) {
    const main = SAYS_MAINNET.test(userTexts[i]);
    const test = SAYS_TESTNET.test(userTexts[i]);
    if (main !== test) return main ? MAINNET_CHAIN_ID : TESTNET_CHAIN_ID;
  }
  return null;
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

/** Where captured context text came from. `agent` is a request from a connected agent (MCP). */
export type ContextSource = 'screen' | 'clipboard' | 'agent';
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
  /** Device only: same first and last 4 hex characters as a past recipient, different middle. */
  | 'LOOKALIKE_RECIPIENT'
  /** The paid ENS name is not the primary name of the address it resolves to. */
  | 'ENS_NOT_PRIMARY'
  /** Device only: this name resolved to a different address when it was last paid. */
  | 'ENS_ADDRESS_CHANGED'
  /** The ENS name has characters outside a-z, 0-9, hyphen and dot, which can imitate other names. */
  | 'ENS_UNUSUAL_CHARACTERS';

/** A proposed native MON transfer. Never signed by the server. */
export type Intent = {
  id: string;
  type: 'native_transfer';
  /** Monad testnet (10143) or mainnet (143). Chosen by the user, never defaulted. */
  chainId: ChainId;
  /** Checksummed recipient. For an ENS payment, the address the name resolved to. */
  to: Address;
  /** Normalized ENS name the user asked to pay, when the recipient was a name. */
  ensName?: string;
  /** The recipient address's verified primary ENS name, when it has one. */
  primaryName?: string;
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
  | 'ENS_NOT_FOUND'
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
  /** Network to pay on. `client` must be connected to this chain. */
  /** Omitted by older callers, which only know testnet. */
  chainId?: ChainId;
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

/** ENS reads on Ethereum mainnet. A viem mainnet PublicClient satisfies it. */
export type EnsReader = Pick<PublicClient, 'getEnsAddress' | 'getEnsName'>;

/** Public Ethereum mainnet RPC used for ENS when no other is configured. */
export const ENS_RPC_URL = 'https://ethereum-rpc.publicnode.com';

/** A whole `.eth` name with at least one label, e.g. "kartik.eth" or "pay.kartik.eth". */
const ENS_NAME = /^[^\s.@/:]+(?:\.[^\s.@/:]+)*\.eth$/i;
/** Labels made only of a-z, 0-9 and hyphens. Anything else can imitate another name. */
const PLAIN_ENS_NAME = /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.eth$/;

/**
 * Whether a recipient string is an ENS name rather than an address.
 * @param raw Candidate, may contain zero-width characters.
 * @returns True for "name.eth" shapes. Validity is checked by `normalize` later.
 */
export function isEnsName(raw: string): boolean {
  const s = stripZeroWidth(raw).trim();
  return s.length <= 255 && ENS_NAME.test(s);
}

/**
 * ENSIP-15 normalization ("Kartik.ETH" becomes "kartik.eth").
 * @param raw Candidate name.
 * @returns The normalized name, or null when the name is not valid.
 */
export function normalizeEnsName(raw: string): string | null {
  try {
    return normalize(stripZeroWidth(raw).trim());
  } catch {
    return null;
  }
}

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
 * Finds where an ENS name came from. Case-insensitive; the name must not be
 * part of a longer name ("pay.kartik.eth" does not count as "kartik.eth").
 * @param name Normalized name.
 * @param context Captured screen or clipboard text, if any.
 * @param userTexts User-authored messages.
 * @returns The provenance source, or null if the name appears nowhere.
 */
function findNameProvenance(
  name: string,
  context: ScreenContextInput | null,
  userTexts: string[],
): ProvenanceSource | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const needle = new RegExp(`(^|[^a-z0-9.-])${escaped}(?![a-z0-9-])`);
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
 * strictest first: address or name → provenance → amount → caps → ENS
 * resolution → chain state → balance.
 * @param client Read-only chain access.
 * @param req The transfer request. `to` is a 0x address or an ENS name.
 * @param ens Mainnet ENS reads. Without it, names are refused and no primary name is looked up.
 * @returns The intent, or a `TransferError` whose `message` is user-facing copy.
 */
export async function prepareTransfer(
  client: ChainReader,
  req: TransferRequest,
  ens?: EnsReader,
): Promise<Intent | TransferError> {
  const ensName = isEnsName(req.to) ? normalizeEnsName(req.to) : null;
  if (isEnsName(req.to) && !ensName) return fail('INVALID_ADDRESS', 'That is not a valid ENS name.');
  const address = ensName ? null : toChecksumAddress(req.to);
  if (!ensName && !address) return fail('INVALID_ADDRESS', 'That is not a valid 0x address or ENS name.');
  if (address === zeroAddress) return fail('ZERO_ADDRESS', 'That is the zero address. Funds sent there are lost.');

  const source = ensName
    ? findNameProvenance(ensName, req.context, req.userTexts)
    : findProvenance(address as Address, req.context, req.userTexts);
  if (!source) {
    return fail('ADDRESS_NOT_IN_CONTEXT', 'I can only pay addresses or names that appear on your screen or in your message.');
  }

  const amount = parseMon(req.amountMon);
  if (amount === null || amount <= 0n) return fail('INVALID_AMOUNT', 'How much MON should I send?');

  const perTx = parseMon(req.perTxMon) ?? 0n;
  const remaining = parseMon(req.dailyRemainingMon) ?? 0n;
  if (amount > perTx) return fail('OVER_TX_LIMIT', `That's over your ${req.perTxMon} MON per-payment limit.`);
  if (amount > remaining) {
    return fail('OVER_DAILY_LIMIT', `That would exceed today's limit (${req.dailyRemainingMon} MON left).`);
  }

  let to = address as Address;
  if (ensName) {
    if (!ens) return fail('RPC_ERROR', "Couldn't look up ENS names right now.");
    let resolved: Address | null;
    try {
      resolved = await ens.getEnsAddress({ name: ensName });
    } catch (e) {
      return fail('RPC_ERROR', `Couldn't look up ${ensName}: ${(e as Error).message.split('\n')[0].slice(0, 120)}`);
    }
    if (!resolved || resolved === zeroAddress) return fail('ENS_NOT_FOUND', `${ensName} has no address set.`);
    to = getAddress(resolved);
  }

  try {
    const [code, fees, balance, primaryName] = await Promise.all([
      client.getCode({ address: to }),
      client.estimateFeesPerGas(),
      client.getBalance({ address: req.wallet }),
      // Display only: a failed reverse lookup never blocks a payment.
      ens ? ens.getEnsName({ address: to }).catch(() => null) : Promise.resolve(null),
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
    if (ensName && primaryName !== ensName) warnings.push('ENS_NOT_PRIMARY');
    if (ensName && !PLAIN_ENS_NAME.test(ensName)) warnings.push('ENS_UNUSUAL_CHARACTERS');

    const now = req.now ?? Date.now();
    const memo = sanitizeMemo(req.memo);
    return {
      id: req.id,
      type: 'native_transfer',
      chainId: (req.chainId ?? TESTNET_CHAIN_ID),
      to,
      ...(ensName ? { ensName } : {}),
      ...(primaryName ? { primaryName } : {}),
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
    return fail('RPC_ERROR', `Couldn't reach ${NETWORKS[(req.chainId ?? TESTNET_CHAIN_ID)].name}: ${(e as Error).message.split('\n')[0].slice(0, 120)}`);
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

/** Old names, so the testnet-only callers keep compiling. */
export const CHAIN_ID = TESTNET_CHAIN_ID;
export const MONAD_TESTNET_RPC_URL = NETWORKS[TESTNET_CHAIN_ID].rpcUrl;
export const MONAD_TESTNET_EXPLORER_URL = NETWORKS[TESTNET_CHAIN_ID].explorerUrl;
export function monadTestnetChain(rpcUrl: string, explorerUrl: string): Chain {
  return monadChain(TESTNET_CHAIN_ID, rpcUrl, explorerUrl);
}
