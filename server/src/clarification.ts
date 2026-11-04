/**
 * @file Turns an `ask_user` call into a `Clarification` whose chips are safe to tap.
 *
 * A tapped chip is sent back as the user's next message, so the option string
 * has to be the address or the MON amount itself. The model is asked to do
 * this, but it also returns names, free-text prompts, and amounts over the cap.
 */
import { formatEther } from 'viem';
import { amountsWithinCap, defaultAmountOptions, labelField, labelsForOptions, MAX_LABEL_CHARS, parseFallback } from './fallbackParser';
import { parseMon, shortAddress, stripZeroWidth, toChecksumAddress } from './intent';
import type { Clarification } from './schemas';

const ADDRESS_OPTION = /^0x[a-fA-F0-9]{40}$/;
/** A whole option, not a number buried in a sentence. The unit is optional; we normalize it on the way out. */
const AMOUNT_OPTION = /^(\d+(?:\.\d{1,18})?)\s*(?:MON)?$/i;
const MAX_OPTIONS = 4;

/** What `ask_user` produced, plus the caps and text the chip must be checked against. */
export type ClarificationSource = {
  question: string;
  options: string[];
  /**
   * Names the model proposed, parallel to `options` by index. Missing entries
   * mean "no proposal" (a grounded name may still be used). A string is kept
   * only when it is that address's grounded name.
   */
  labels?: (string | null)[];
  perTxMon: string;
  dailyRemainingMon: string;
  /** Screen or clipboard text, or null when the user excluded it. */
  contextText: string | null;
  /** User-authored messages, oldest first. */
  userTexts: string[];
};

/**
 * Keeps only tappable addresses and in-cap MON amounts.
 *
 * Names and prompts are dropped. Amounts above the tighter of the per-payment
 * cap and the remaining daily limit are dropped, because `prepareTransfer`
 * would reject them with OVER_TX_LIMIT or OVER_DAILY_LIMIT. At most four
 * options are kept. When that leaves nothing, the offline parser's own
 * chips are used (it already returns raw addresses, at most four, and
 * default amounts under the cap). If those are empty too, the question is
 * kept with no chips: the composer is how the user answers, and a free-text
 * chip would be sent back as their message.
 *
 * Full addresses in the question are shortened. The reply is this question,
 * and every other reply already uses the short form. The option value stays
 * the full address, because the app shortens only the chip label.
 *
 * `labels`, when present, stays aligned with the options that survive filtering.
 * A model-supplied name is kept only when it is the name actually written next
 * to that address; an invented name becomes null and is not replaced with a
 * different one. Amount chips are always null. With no proposal, the grounded
 * name is used. The field is omitted when every label is null.
 * @param source Model question and options, caps, and the texts an address must appear in.
 * @returns Clarification safe to return to the app.
 */
export function sanitizeClarification(source: ClarificationSource): Clarification {
  const capMon = effectiveCapMon(source.perTxMon, source.dailyRemainingMon);
  const texts = [source.contextText ?? '', ...source.userTexts];
  const kept = concreteOptions(source.options, source.labels ?? [], texts, capMon);
  const chosen =
    kept.length > 0
      ? kept
      : recoverOptions(source, texts, capMon).map((option) => ({ option, proposed: undefined }));
  const grounded = labelsForOptions(
    chosen.map((item) => item.option),
    texts,
  );
  const labels = chosen.map((item, index) => acceptLabel(item.proposed, grounded[index] ?? null));
  return {
    question: shortenAddresses(source.question),
    options: chosen.map((item) => item.option),
    ...labelField(labels),
  };
}

/**
 * A proposed name is trusted only when it is the grounded one (same letters,
 * source spelling). No proposal means "use the grounded name". An invented
 * name, an over-long one, or one that contains an address is null — we do not
 * silently swap in a different name from the text.
 * @param proposed What the model sent for this chip, if anything.
 * @param grounded Name written next to the address, or null.
 * @returns The label to store, or null.
 */
function acceptLabel(proposed: string | null | undefined, grounded: string | null): string | null {
  if (proposed == null || proposed.trim() === '') return grounded;
  const trimmed = proposed.trim();
  if (trimmed.length > MAX_LABEL_CHARS || /0x[a-fA-F0-9]/i.test(trimmed)) return null;
  if (!grounded || trimmed.toLowerCase() !== grounded.toLowerCase()) return null;
  return grounded;
}

/**
 * Tighter of the two spend caps, as a MON decimal.
 * The fallback parser only knows the per-payment cap, so this string is passed
 * in as `perTxMon` when its default chips must respect the daily limit too.
 * @param perTxMon Per-payment cap.
 * @param dailyRemainingMon MON still allowed today.
 * @returns The smaller of the two. An unparseable cap counts as zero.
 */
function effectiveCapMon(perTxMon: string, dailyRemainingMon: string): string {
  const perTx = parseMon(perTxMon) ?? 0n;
  const daily = parseMon(dailyRemainingMon) ?? 0n;
  return formatEther(perTx < daily ? perTx : daily);
}

type KeptOption = { option: string; proposed?: string | null };

/** Model options that are an in-scope address or an in-cap amount, in model order. The proposal at the same index travels with the option. */
function concreteOptions(
  options: string[],
  proposed: (string | null)[],
  texts: string[],
  capMon: string,
): KeptOption[] {
  const kept: KeptOption[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < options.length && kept.length < MAX_OPTIONS; i++) {
    const raw = options[i];
    if (raw === undefined) continue;
    const option = concreteOption(raw.trim(), texts, capMon);
    if (!option) continue;
    const key = optionKey(option);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push({ option, proposed: proposed[i] });
  }
  return kept;
}

/**
 * One option, or null when tapping it would not yield an address or a payable amount.
 * @param option Trimmed model option.
 * @param texts Context and user messages. An address chip must appear in one of them.
 * @param capMon Effective cap.
 * @returns The chip value, or null.
 */
function concreteOption(option: string, texts: string[], capMon: string): string | null {
  if (ADDRESS_OPTION.test(option)) {
    // Same acceptance rule as a transfer: mixed case must be a real checksum.
    if (!toChecksumAddress(option)) return null;
    // An invented address would become the next user message and then pass provenance.
    if (!addressAppears(option, texts)) return null;
    return option;
  }
  const decimal = AMOUNT_OPTION.exec(option)?.[1];
  if (!decimal) return null;
  const [kept] = amountsWithinCap([decimal], capMon);
  return kept ? `${kept} MON` : null;
}

/** Case-insensitive for addresses, by value for amounts, so "0.5" and "0.5 MON" are one chip. */
function optionKey(option: string): string {
  if (ADDRESS_OPTION.test(option)) return `a:${option.toLowerCase()}`;
  const decimal = /^(\d+(?:\.\d{1,18})?)/.exec(option)?.[1] ?? option;
  return `m:${(parseMon(decimal) ?? decimal).toString()}`;
}

/**
 * Whether `address` occurs as its own token. A longer hex string must not count.
 * @param address Full 0x address.
 * @param texts Context and user messages.
 * @returns True when the address appears in any text.
 */
function addressAppears(address: string, texts: string[]): boolean {
  const needle = new RegExp(`${address.toLowerCase()}(?![0-9a-f])`);
  return texts.some((text) => needle.test(stripZeroWidth(text).toLowerCase()));
}

/**
 * Options the offline parser would have offered, checked again so an extracted
 * amount above the cap (the parser does not filter those) cannot sneak back in.
 * Passing the effective cap as its per-payment cap makes its default chips
 * respect the daily limit too.
 * @param source Original ask, used only for the texts the parser reads.
 * @param texts Context and user messages.
 * @param capMon Effective cap.
 * @returns At most four concrete chips, or empty when nothing payable is known.
 */
function recoverOptions(source: ClarificationSource, texts: string[], capMon: string): string[] {
  const parsed = parseFallback({
    contextText: source.contextText,
    userTexts: source.userTexts,
    perTxMon: capMon,
  });
  if (parsed.kind !== 'clarify') return [];
  const kept = concreteOptions(parsed.options, [], texts, capMon).map((item) => item.option);
  if (kept.length > 0) return kept;
  // It offered amount chips and every one was over the cap. Use the standard defaults.
  const offeredAmount = parsed.options.some((option) => AMOUNT_OPTION.test(option.trim()));
  return offeredAmount ? defaultAmountOptions(capMon) : [];
}

/** The reply shown above the chips is this question, so a full address here is shortened the same way other replies are. */
function shortenAddresses(text: string): string {
  // Same boundary as address extraction: don't eat a prefix of a longer hex token.
  return text.replace(/0x[a-fA-F0-9]{40}(?![a-fA-F0-9])/g, (address) => shortAddress(address));
}
