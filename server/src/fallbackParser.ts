/**
 * @file Offline regex parser used when the agent server is unreachable.
 *
 * SHARED FILE: byte-identical copies live at `app/src/fallbackParser.ts` and
 * `server/src/fallbackParser.ts`. Edit one, copy it to the other;
 * `server/test/shared.test.ts` fails if they drift.
 *
 * It only acts when a user message asks to pay (pay/send/transfer…), and only
 * extracts `0x` addresses and "<n> MON" amounts. A single address and a single
 * amount yield a candidate; anything else yields a clarification. The
 * caller must still run `prepareTransfer`, so the parser itself grants nothing.
 */
import { parseMon, shortAddress, stripZeroWidth } from './intent';

const ADDRESS = /0x[a-fA-F0-9]{40}(?![a-fA-F0-9])/g;
// Leading guard instead of a lookbehind so "0.0000000000000000001 MON" can't match its tail.
const AMOUNT = /(?:^|[^\d.])(\d+(?:\.\d{1,18})?)\s*(?:MON|mon|Mon)\b/g;
const FIAT = /[₹$]|\b(?:INR|USD|rs\.?|rupees?|dollars?)\b/i;
const AMOUNT_CHIPS = ['0.1', '0.5', '1'];
// Payment verbs. Without one, the parser never proposes a transfer (spec §9.4 rule 3).
const PAY_REQUEST = /\b(?:pay|send|transfer|tip|split|settle|give|refund)\b/i;

export type FallbackResult =
  | { kind: 'candidate'; to: string; amountMon: string }
  | { kind: 'clarify'; question: string; options: string[] };

export type FallbackInput = {
  /** Screen or clipboard text, or null when excluded/unavailable. */
  contextText: string | null;
  /** User messages, oldest first. */
  userTexts: string[];
  /** Per-transaction cap in MON; amount chips above it are hidden. */
  perTxMon: string;
};

/**
 * Unique addresses in a text, compared case-insensitively, first spelling kept.
 * @param text Source text (zero-width characters already stripped).
 * @returns Addresses in order of appearance.
 */
export function extractAddresses(text: string): string[] {
  const seen = new Map<string, string>();
  for (const a of text.match(ADDRESS) ?? []) if (!seen.has(a.toLowerCase())) seen.set(a.toLowerCase(), a);
  return [...seen.values()];
}

/**
 * Unique MON amounts in a text, compared by value.
 * @param text Source text (zero-width characters already stripped).
 * @returns Amount strings as written, e.g. ["2.5"].
 */
export function extractAmounts(text: string): string[] {
  const seen = new Map<bigint, string>();
  for (const m of text.matchAll(AMOUNT)) {
    const wei = parseMon(m[1]);
    if (wei !== null && !seen.has(wei)) seen.set(wei, m[1]);
  }
  return [...seen.values()];
}

/**
 * Picks matches from the newest user message that has any, else from the context.
 * A chip the user tapped therefore overrides ambiguity on screen.
 * @param extract Extractor to apply.
 * @param userTexts User messages, oldest first.
 * @param contextText Context text or null.
 * @returns The chosen matches.
 */
function pick(extract: (t: string) => string[], userTexts: string[], contextText: string | null): string[] {
  for (let i = userTexts.length - 1; i >= 0; i--) {
    const found = extract(userTexts[i]);
    if (found.length) return found;
  }
  return contextText ? extract(contextText) : [];
}

/**
 * Parses a payment request without AI.
 * @param input Context, user messages and the per-tx cap.
 * @returns A transfer candidate or a clarification question with options.
 */
export function parseFallback(input: FallbackInput): FallbackResult {
  const context = input.contextText === null ? null : stripZeroWidth(input.contextText);
  const users = input.userTexts.map(stripZeroWidth);
  if (!users.some((t) => PAY_REQUEST.test(t))) {
    return { kind: 'clarify', question: 'Agent offline. I can still prepare a payment: say "pay this".', options: [] };
  }
  const addresses = pick(extractAddresses, users, context);
  const amounts = pick(extractAmounts, users, context);

  if (addresses.length === 0) {
    return { kind: 'clarify', question: 'I need a 0x address. Copy it and tap "Use clipboard".', options: [] };
  }
  if (addresses.length > 1) {
    return { kind: 'clarify', question: `I see ${addresses.length} addresses. Which one?`, options: addresses.slice(0, 4) };
  }
  if (amounts.length !== 1) {
    const fiat = amounts.length === 0 && FIAT.test([context ?? '', ...users].join(' '));
    const cap = parseMon(input.perTxMon) ?? 0n;
    const chips = amounts.length ? amounts.slice(0, 4) : AMOUNT_CHIPS.filter((a) => (parseMon(a) ?? 0n) <= cap);
    return {
      kind: 'clarify',
      question: fiat ? 'I can only send MON on testnet. How much MON?' : 'How much MON should I send?',
      options: chips.map((a) => `${a} MON`),
    };
  }
  return { kind: 'candidate', to: addresses[0], amountMon: amounts[0] };
}

/**
 * Label for a clarification chip: addresses are shortened, other options shown as-is.
 * @param option Option value sent back as the user's message when tapped.
 * @returns Display label.
 */
export function chipLabel(option: string): string {
  return /^0x[a-fA-F0-9]{40}$/.test(option) ? shortAddress(option) : option;
}
