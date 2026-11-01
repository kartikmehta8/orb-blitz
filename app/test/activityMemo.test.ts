/**
 * @file Activity records keep an optional memo and still load entries from before memos existed.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Address, Hash } from 'viem';
import { finalizePending } from '../src/pendingTx';
import { KEYS, getActivity } from '../src/storage';

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}));

const getItem = vi.mocked(AsyncStorage.getItem);
const setItem = vi.mocked(AsyncStorage.setItem);

const hash = `0x${'ab'.repeat(32)}` as Hash;
const to = '0x1111111111111111111111111111111111111111' as Address;

const oldRecord = {
  hash,
  to,
  amountWei: '1',
  status: 'confirmed' as const,
  at: 1,
};

beforeEach(() => {
  getItem.mockReset();
  setItem.mockReset();
  setItem.mockResolvedValue();
  getItem.mockResolvedValue(null);
});

describe('activity memo', () => {
  it('loads a payment recorded before memos existed', async () => {
    getItem.mockResolvedValue(JSON.stringify([oldRecord]));
    expect(await getActivity()).toEqual([oldRecord]);
  });

  it('stores the memo when a confirmed payment is recorded', async () => {
    const pending = {
      hash,
      intentId: 'intent-1',
      to,
      amountWei: '1',
      sentAt: 1,
      memo: 'dinner',
    };
    getItem.mockImplementation(async (key) => (key === KEYS.pending ? JSON.stringify(pending) : null));
    await finalizePending(pending, 'success');
    const activity = setItem.mock.calls
      .filter(([key]) => key === KEYS.activity)
      .map(([, raw]) => JSON.parse(raw) as unknown[]);
    expect(activity.at(-1)?.[0]).toMatchObject({ hash, status: 'confirmed', memo: 'dinner' });
  });
});
