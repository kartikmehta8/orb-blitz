/**
 * @file Per-payment and daily spend caps, stored on the device.
 *
 * Caps are MON decimal strings (`limits:v1`); today's spend is a wei string
 * under `spend:YYYY-MM-DD` using the phone's local date.
 */
import { formatEther, parseEther } from 'viem';
import { LIMIT_DEFAULTS } from './config';
import { parseMon } from './intent';
import { OrbApiError } from './errors';
import { isRecord, isWeiString, KEYS, readStored, writeJson } from './storage';

/** User-editable caps in MON. */
export type Limits = { perTxMon: string; dailyMon: string };

/** Caps plus today's spend, all in wei, ready for validation. */
export type LimitState = {
  limits: Limits;
  perTxWei: bigint;
  dailyWei: bigint;
  spentWei: bigint;
  /** `max(0, daily - spent)`. */
  remainingWei: bigint;
};

const HARD_MAX_WEI = parseEther(LIMIT_DEFAULTS.hardMaxMon);
const DEFAULT_LIMITS: Limits = { perTxMon: LIMIT_DEFAULTS.perTxMon, dailyMon: LIMIT_DEFAULTS.dailyMon };

/**
 * Validates a cap typed by the user.
 * @param value Raw input, e.g. "1" or "0.5".
 * @returns A short error message, or null when valid.
 */
export function limitError(value: string): string | null {
  const wei = parseMon(value);
  if (wei === null) return 'Enter a number like 1 or 0.5.';
  if (wei <= 0n) return 'Must be more than 0.';
  if (wei > HARD_MAX_WEI) return `Max ${LIMIT_DEFAULTS.hardMaxMon} MON on testnet.`;
  return null;
}

/**
 * Normalizes a valid cap ("01.50" → "1.5"), or falls back when invalid.
 * @param value Raw cap.
 * @param fallback Value to use when `value` is invalid.
 * @returns Canonical MON decimal string.
 */
function normalize(value: unknown, fallback: string): string {
  return typeof value === 'string' && limitError(value) === null ? formatEther(parseEther(value.trim())) : fallback;
}

/**
 * Loads caps. A missing key is the defaults. A present value that is not an
 * object throws. Invalid cap strings inside a valid object still fall back
 * to the defaults; that is a bad setting, not a failed read.
 * @returns Valid caps.
 * @throws OrbApiError when the limits key cannot be read or parsed.
 */
async function loadLimits(): Promise<Limits> {
  const stored = await readStored(KEYS.limits);
  if (stored === undefined) return { ...DEFAULT_LIMITS };
  if (!isRecord(stored)) throw new OrbApiError('parse', 'Stored limits are not an object.');
  return {
    perTxMon: normalize(stored.perTxMon, DEFAULT_LIMITS.perTxMon),
    dailyMon: normalize(stored.dailyMon, DEFAULT_LIMITS.dailyMon),
  };
}

/**
 * Saves caps. Invalid values are replaced by defaults, never stored.
 * @param limits Caps as typed (validate with `limitError` first).
 * @returns The canonical caps that were stored.
 */
export async function saveLimits(limits: Limits): Promise<Limits> {
  const clean = {
    perTxMon: normalize(limits.perTxMon, DEFAULT_LIMITS.perTxMon),
    dailyMon: normalize(limits.dailyMon, DEFAULT_LIMITS.dailyMon),
  };
  await writeJson(KEYS.limits, clean);
  return clean;
}

/**
 * Storage key for a day's spend, by local date.
 * @param date Day to key (default now).
 * @returns e.g. "spend:2026-11-04".
 */
function spendKey(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `spend:${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Total confirmed spend today. A missing key is zero. A present value that
 * is not a wei decimal throws.
 * @returns Wei.
 * @throws OrbApiError when today's spend key cannot be read or parsed.
 */
async function getSpentToday(): Promise<bigint> {
  const stored = await readStored(spendKey());
  if (stored === undefined) return 0n;
  if (!isWeiString(stored)) throw new OrbApiError('parse', 'Stored spend is not a wei amount.');
  return BigInt(stored);
}

/**
 * Adds a confirmed payment to today's spend.
 * @param wei Amount sent (fees excluded, matching how caps are checked).
 * @returns Resolves once stored.
 */
export async function addSpend(wei: bigint): Promise<void> {
  // ponytail: one key per day, never pruned (a few bytes/day); add cleanup if this ships beyond a demo.
  await writeJson(spendKey(), ((await getSpentToday()) + wei).toString());
}

/**
 * Caps and today's spend in one read.
 * @returns Current limit state.
 * @throws OrbApiError when either stored value cannot be read. An empty store does not throw.
 */
export async function getLimitState(): Promise<LimitState> {
  const [limits, spentWei] = await Promise.all([loadLimits(), getSpentToday()]);
  const dailyWei = parseEther(limits.dailyMon);
  return {
    limits,
    perTxWei: parseEther(limits.perTxMon),
    dailyWei,
    spentWei,
    remainingWei: spentWei >= dailyWei ? 0n : dailyWei - spentWei,
  };
}
