/**
 * @file AsyncStorage-backed local state: defensive JSON helpers, the known
 * recipient list, the executed-intent set and the payment activity list.
 *
 * `readJson` stays defensive: missing, corrupt or foreign data reads as
 * "absent" instead of throwing. `readStored` is the opposite, used by activity,
 * limits and the pending slot, where a real failure must not look like empty.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Address, Hash } from 'viem';
import { OrbApiError, toOrbApiError } from './errors';
import { isChainId, toChecksumAddress, type ChainId } from './intent';

/** Storage keys. Bump the version suffix when a shape changes. */
export const KEYS = {
  limits: 'limits:v1',
  recipients: 'recipients:v1',
  executed: 'executed:v1',
  pending: 'pending:v1',
  activity: 'activity:v1',
  /** ENS name to the address it resolved to when it was last paid. */
  ensBook: 'ensBook:v1',
} as const;

/** Pre-activity single-entry key, migrated into `activity:v1` on first read. */
const LEGACY_LAST_TX_KEY = 'lastTx:v1';

/** Most recent payments kept for the Activity screen. */
const MAX_ACTIVITY = 20;

/** Most executed intent IDs kept; intents expire after 5 min, so this is generous. */
const MAX_EXECUTED = 200;

/**
 * Plain-object type guard.
 * @param v Any value.
 * @returns True for non-null, non-array objects.
 */
export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * String-array type guard.
 * @param v Any value.
 * @returns True when `v` is an array of strings.
 */
export const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

/**
 * Non-negative integer decimal string guard (wei amounts).
 * @param v Any value.
 * @returns True for strings like "0" or "2000000000000000000".
 */
export const isWeiString = (v: unknown): v is string => typeof v === 'string' && /^\d{1,78}$/.test(v);

/**
 * Transaction hash guard.
 * @param v Any value.
 * @returns True for a 0x-prefixed 32-byte hex string.
 */
export const isHash = (v: unknown): v is Hash => typeof v === 'string' && /^0x[0-9a-fA-F]{64}$/.test(v);

/**
 * Reads and validates a JSON value.
 * @param key Storage key.
 * @param guard Type guard the parsed value must pass.
 * @returns The value, or null when missing, unparsable or the wrong shape.
 */
export async function readJson<T>(key: string, guard: (v: unknown) => v is T): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    return guard(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Writes a JSON value.
 * @param key Storage key.
 * @param value Serializable value.
 * @returns Resolves once stored.
 */
export async function writeJson(key: string, value: unknown): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

/**
 * Deletes a key.
 * @param key Storage key.
 * @returns Resolves once removed.
 */
export async function removeKey(key: string): Promise<void> {
  await AsyncStorage.removeItem(key);
}

/**
 * Reads a JSON value and throws when the read or the JSON is bad.
 *
 * A missing key is `undefined`, which is not a failure. An empty list or
 * object is returned as parsed. Callers decide which shapes are valid.
 * @param key Storage key.
 * @returns The parsed value, or `undefined` when the key is absent.
 * @throws OrbApiError `network`, `timeout`, or `http` when AsyncStorage throws; `parse` when the text is not JSON.
 */
export async function readStored(key: string): Promise<unknown> {
  let raw: string | null;
  try {
    raw = await AsyncStorage.getItem(key);
  } catch (e) {
    throw toOrbApiError(e);
  }
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch (e) {
    const message = e instanceof Error && e.message ? e.message : 'Could not parse stored data.';
    throw new OrbApiError('parse', message);
  }
}

/**
 * Addresses this wallet has paid successfully before.
 * @returns Lowercased addresses.
 */
export async function getRecipients(): Promise<Set<string>> {
  return new Set((await readJson(KEYS.recipients, isStringArray))?.map((a) => a.toLowerCase()) ?? []);
}

const isStringRecord = (v: unknown): v is Record<string, string> =>
  isRecord(v) && Object.values(v).every((a) => typeof a === 'string');

/**
 * ENS names this wallet has paid, with the address each resolved to then.
 * @returns Name to lowercased address.
 */
export async function getEnsBook(): Promise<Record<string, string>> {
  return (await readJson(KEYS.ensBook, isStringRecord)) ?? {};
}

/**
 * Remembers which address a name resolved to after a confirmed payment.
 * @param name Normalized ENS name.
 * @param address Address it was paid at.
 * @returns Resolves once stored.
 */
export async function addEnsName(name: string, address: Address): Promise<void> {
  const book = await getEnsBook();
  if (book[name] === address.toLowerCase()) return;
  await writeJson(KEYS.ensBook, { ...book, [name]: address.toLowerCase() });
}

/**
 * Remembers a recipient after a confirmed payment.
 * @param address Recipient address.
 * @returns Resolves once stored.
 */
export async function addRecipient(address: Address): Promise<void> {
  const known = await getRecipients();
  if (known.has(address.toLowerCase())) return;
  await writeJson(KEYS.recipients, [...known, address.toLowerCase()]);
}

// In-memory mirror so a second tap in the same session is blocked before storage resolves.
const executedMemo = new Set<string>();

/**
 * Whether an intent has already been sent.
 * @param id Intent ID.
 * @returns True if it was marked executed in this session or a previous one.
 */
export async function isExecuted(id: string): Promise<boolean> {
  if (executedMemo.has(id)) return true;
  return (await readJson(KEYS.executed, isStringArray))?.includes(id) ?? false;
}

/**
 * Marks an intent as used so it can never be sent twice.
 * @param id Intent ID.
 * @returns Resolves once stored.
 */
export async function markExecuted(id: string): Promise<void> {
  executedMemo.add(id);
  const ids = (await readJson(KEYS.executed, isStringArray)) ?? [];
  if (!ids.includes(id)) await writeJson(KEYS.executed, [...ids, id].slice(-MAX_EXECUTED));
}

/**
 * A finished payment, shown on the Activity screen. Chain data plus an optional
 * display memo. Records written before memos have no `memo` field.
 */
export type ActivityTx = {
  hash: Hash;
  to: Address;
  amountWei: string;
  status: 'confirmed' | 'failed';
  at: number;
  /** Display-only note from the intent, e.g. "dinner". Absent on older records. */
  memo?: string;
  /** Network it was sent on. Absent on records from before mainnet support (testnet). */
  chainId?: ChainId;
  /** ENS name that was paid, shown instead of the address. */
  ensName?: string;
};

const isActivityTx = (v: unknown): v is ActivityTx =>
  isRecord(v) &&
  isHash(v.hash) &&
  typeof v.to === 'string' &&
  toChecksumAddress(v.to) !== null &&
  isWeiString(v.amountWei) &&
  (v.status === 'confirmed' || v.status === 'failed') &&
  typeof v.at === 'number' &&
  (v.memo === undefined || typeof v.memo === 'string') &&
  (v.chainId === undefined || isChainId(v.chainId)) &&
  (v.ensName === undefined || typeof v.ensName === 'string');

/**
 * Reads recent payments, newest first. A missing key or an empty list is
 * empty. One bad entry is dropped. Invalid JSON or a non-list value throws,
 * so a corrupt store is not shown as "no payments".
 * On first run after the upgrade, the old single `lastTx:v1` entry becomes
 * the list's only item and is removed.
 * @returns Up to 20 payments, newest first.
 * @throws OrbApiError when the activity key cannot be read or is not a list.
 */
export async function getActivity(): Promise<ActivityTx[]> {
  const stored = await readStored(KEYS.activity);
  if (stored !== undefined) {
    if (!Array.isArray(stored)) throw new OrbApiError('parse', 'Activity is not a list.');
    return stored.filter(isActivityTx).slice(0, MAX_ACTIVITY);
  }
  const legacy = await readStored(LEGACY_LAST_TX_KEY);
  if (!isActivityTx(legacy)) return [];
  await writeJson(KEYS.activity, [legacy]);
  await removeKey(LEGACY_LAST_TX_KEY);
  return [legacy];
}

/**
 * Records a finished payment at the top of the activity list (deduplicated by
 * hash, capped at 20).
 * @param tx Payment summary (no screen text, only chain data).
 * @returns Resolves once stored.
 */
export async function addActivity(tx: ActivityTx): Promise<void> {
  const rest = (await getActivity()).filter((t) => t.hash !== tx.hash);
  await writeJson(KEYS.activity, [tx, ...rest].slice(0, MAX_ACTIVITY));
}
