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

/**
 * Decimal amounts that fit under a MON cap, in the given order.
 * A chip above the cap is omitted: tapping it would fail the per-payment check.
 * Zero and unparseable values are omitted because they are not payable.
 * @param amounts Decimal strings such as "0.5", without a unit suffix.
 * @param capMon Cap as a MON decimal string.
 * @returns At most four amounts.
 */
export function amountsWithinCap(amounts: readonly string[], capMon: string): string[] {
  const cap = parseMon(capMon) ?? 0n;
  const kept: string[] = [];
  for (const amount of amounts) {
    const wei = parseMon(amount);
    if (wei === null || wei <= 0n || wei > cap) continue;
    kept.push(amount);
    if (kept.length === 4) break;
  }
  return kept;
}

/**
 * Concrete MON chips for "how much?" when the user named no amount.
 * @param capMon Cap as a MON decimal string. Chips above it are hidden.
 * @returns Labels such as "0.1 MON", at most four.
 */
export function defaultAmountOptions(capMon: string): string[] {
  return amountsWithinCap(AMOUNT_CHIPS, capMon).map((amount) => `${amount} MON`);
}

/**
 * How far, in characters, a name may sit from an address and still label it.
 * The window stays on the same line: a newline ends it. 24 fits a short name
 * ("Priya Sharma") plus punctuation.
 */
export const LABEL_RADIUS = 24;

/** Longest display name we return. A longer proposal is dropped, not truncated. */
export const MAX_LABEL_CHARS = 32;

/** Title-case words only, so "to" / "or" / "MON" next to an address are not names. Created per scan so the global flag cannot leak. */
const namePattern = (): RegExp => /[A-Z][a-z]+(?: [A-Z][a-z]+){0,2}/g;
const HAS_ADDRESS = /0x[a-fA-F0-9]/i;

type NameHit = { name: string; start: number; distance: number; before: boolean };

/**
 * Display names for clarification chips, parallel to `options`.
 *
 * A label is non-null only for an address option, and only when a name is
 * adjacent to that exact address in `texts`: on the same line, and the whole
 * name lies within {@link LABEL_RADIUS} characters before the address or after
 * it. The closer side wins; a tie prefers the name written before the address.
 * One name is given to one address, the closer one. Amount options are null.
 * Names longer than {@link MAX_LABEL_CHARS}, or that contain an address, are null.
 * @param options Chip values, addresses or MON amounts.
 * @param texts Screen text and user messages. Zero-width characters are ignored.
 * @returns One entry per option. All null when nothing is grounded.
 */
export function labelsForOptions(options: readonly string[], texts: readonly string[]): (string | null)[] {
  const claims = options.map((option) => (isAddressOption(option) ? closestName(option, texts) : null));
  const owner = new Map<string, number>();
  claims.forEach((hit, index) => {
    if (!hit) return;
    const key = `${hit.textIndex}:${hit.start}`;
    const previous = owner.get(key);
    if (previous === undefined || closer(hit, claims[previous])) owner.set(key, index);
  });
  return claims.map((hit, index) => {
    if (!hit || hit.name.length > MAX_LABEL_CHARS || HAS_ADDRESS.test(hit.name)) return null;
    return owner.get(`${hit.textIndex}:${hit.start}`) === index ? hit.name : null;
  });
}

/**
 * `labels` when at least one name is grounded. Omitted when every entry is
 * null, so a clarification with no names keeps the shape older clients expect.
 * @param labels Parallel labels, null where no name is grounded.
 * @returns `{ labels }` or an empty object.
 */
export function labelField(labels: (string | null)[]): { labels?: (string | null)[] } {
  return labels.some((label) => label !== null) ? { labels } : {};
}

type Claim = NameHit & { textIndex: number };

function isAddressOption(option: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(option);
}

/** True when `a` is a tighter claim than `b` (closer, then prefer the name before the address). */
function closer(a: Claim, b: Claim | null): boolean {
  if (!b) return true;
  if (a.distance !== b.distance) return a.distance < b.distance;
  return a.before && !b.before;
}

/** Best name written next to any occurrence of `address`. */
function closestName(address: string, texts: readonly string[]): Claim | null {
  const needle = address.toLowerCase();
  let best: Claim | null = null;
  texts.forEach((raw, textIndex) => {
    const text = stripZeroWidth(raw);
    for (const match of text.matchAll(/0x[a-fA-F0-9]{40}(?![a-fA-F0-9])/g)) {
      if (match[0].toLowerCase() !== needle || match.index === undefined) continue;
      const lineStart = text.lastIndexOf('\n', match.index - 1) + 1;
      const newline = text.indexOf('\n', match.index);
      const lineEnd = newline === -1 ? text.length : newline;
      const localStart = match.index - lineStart;
      const hit = nearestName(text.slice(lineStart, lineEnd), localStart, localStart + match[0].length);
      if (!hit) continue;
      const claim: Claim = { ...hit, start: lineStart + hit.start, textIndex };
      if (closer(claim, best)) best = claim;
    }
  });
  return best;
}

/**
 * Closest whole name inside the radius, still on this line. The line is passed
 * without its newlines. Hex inside another address is not a name: checksum
 * letters like "Cd" would otherwise label the next chip.
 */
function nearestName(line: string, addressStart: number, addressEnd: number): NameHit | null {
  const spans = [...line.matchAll(/0x[a-fA-F0-9]{40}(?![a-fA-F0-9])/g)].map((match) => ({
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }));
  const beforeFrom = Math.max(0, addressStart - LABEL_RADIUS);
  const afterTo = Math.min(line.length, addressEnd + LABEL_RADIUS);
  let best: NameHit | null = null;
  for (const match of line.matchAll(namePattern())) {
    const start = match.index ?? 0;
    const name = match[0];
    const end = start + name.length;
    if (spans.some((span) => start < span.end && end > span.start)) continue;
    const before = end <= addressStart && start >= beforeFrom;
    const after = start >= addressEnd && end <= afterTo;
    if (!before && !after) continue;
    const hit: NameHit = { name, start, distance: before ? addressStart - end : start - addressEnd, before };
    if (!best || hit.distance < best.distance || (hit.distance === best.distance && hit.before && !best.before)) best = hit;
  }
  return best;
}

// Payment verbs. Without one in a user message, the parser never proposes a transfer: screen text alone cannot trigger a payment.
const PAY_REQUEST = /\b(?:pay|send|transfer|tip|split|settle|give|refund)\b/i;

/** A transfer candidate (still unvalidated) or a question with tappable options. */
type FallbackResult =
  | { kind: 'candidate'; to: string; amountMon: string }
  | { kind: 'clarify'; question: string; options: string[]; labels?: (string | null)[] };

/** What the parser reads: context, user messages and the per-tx cap. */
type FallbackInput = {
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
function extractAddresses(text: string): string[] {
  const seen = new Map<string, string>();
  for (const a of text.match(ADDRESS) ?? []) if (!seen.has(a.toLowerCase())) seen.set(a.toLowerCase(), a);
  return [...seen.values()];
}

/**
 * Unique MON amounts in a text, compared by value.
 * @param text Source text (zero-width characters already stripped).
 * @returns Amount strings as written, e.g. ["2.5"].
 */
function extractAmounts(text: string): string[] {
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
    const options = addresses.slice(0, 4);
    const labels = labelsForOptions(options, [context ?? '', ...users]);
    return {
      kind: 'clarify',
      question: `I see ${addresses.length} addresses. Which one?`,
      options,
      ...labelField(labels),
    };
  }
  if (amounts.length !== 1) {
    const fiat = amounts.length === 0 && FIAT.test([context ?? '', ...users].join(' '));
    // Named amounts are the user's words (capped at 4). Defaults go through the shared cap filter.
    const options = amounts.length
      ? amounts.slice(0, 4).map((amount) => `${amount} MON`)
      : defaultAmountOptions(input.perTxMon);
    return {
      kind: 'clarify',
      question: fiat ? 'I can only send MON on testnet. How much MON?' : 'How much MON should I send?',
      options,
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
