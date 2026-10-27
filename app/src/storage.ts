/**
 * @file AsyncStorage-backed local state: defensive JSON helpers, the known
 * recipient list, the executed-intent set and the last transaction.
 *
 * Every read is defensive: missing, corrupt or foreign data reads as "absent"
 * instead of throwing, so a bad write can never brick the app.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Address, Hash } from 'viem';
import { toChecksumAddress } from './intent';

/** Storage keys. Bump the version suffix when a shape changes. */
export const KEYS = {
  limits: 'limits:v1',
  recipients: 'recipients:v1',
  executed: 'executed:v1',
  pending: 'pending:v1',
  lastTx: 'lastTx:v1',
} as const;

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
 * Addresses this wallet has paid successfully before.
 * @returns Lowercased addresses.
 */
export async function getRecipients(): Promise<Set<string>> {
  return new Set((await readJson(KEYS.recipients, isStringArray))?.map((a) => a.toLowerCase()) ?? []);
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

/** The most recent finished payment, shown on Home. */
export type LastTx = { hash: Hash; to: Address; amountWei: string; status: 'confirmed' | 'failed'; at: number };

const isLastTx = (v: unknown): v is LastTx =>
  isRecord(v) &&
  isHash(v.hash) &&
  typeof v.to === 'string' &&
  toChecksumAddress(v.to) !== null &&
  isWeiString(v.amountWei) &&
  (v.status === 'confirmed' || v.status === 'failed') &&
  typeof v.at === 'number';

/**
 * Reads the last finished payment.
 * @returns The entry, or null if none.
 */
export async function getLastTx(): Promise<LastTx | null> {
  return readJson(KEYS.lastTx, isLastTx);
}

/**
 * Records the last finished payment.
 * @param tx Payment summary (no screen text, only chain data).
 * @returns Resolves once stored.
 */
export async function setLastTx(tx: LastTx): Promise<void> {
  await writeJson(KEYS.lastTx, tx);
}
