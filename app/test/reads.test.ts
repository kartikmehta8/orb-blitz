/**
 * @file Activity and limit reads throw on a real failure and stay empty when empty.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrbApiError } from '../src/errors';
import { getLimitState } from '../src/limits';
import { KEYS, getActivity } from '../src/storage';

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}));

const getItem = vi.mocked(AsyncStorage.getItem);

beforeEach(() => {
  getItem.mockReset();
  getItem.mockResolvedValue(null);
});

const tx = {
  hash: '0x' + 'ab'.repeat(32),
  to: '0x1111111111111111111111111111111111111111',
  amountWei: '1',
  status: 'confirmed',
  at: 1,
};

describe('getActivity', () => {
  it('returns an empty list when nothing is stored or the list is empty', async () => {
    expect(await getActivity()).toEqual([]);
    getItem.mockResolvedValue('[]');
    expect(await getActivity()).toEqual([]);
  });

  it('returns stored payments and drops corrupt entries', async () => {
    getItem.mockResolvedValue(JSON.stringify([tx, { hash: 'nope' }]));
    expect(await getActivity()).toEqual([tx]);
  });

  it('throws parse when the JSON is invalid or not a list', async () => {
    getItem.mockResolvedValue('{');
    await expect(getActivity()).rejects.toMatchObject({ name: 'OrbApiError', code: 'parse' });
    getItem.mockResolvedValue('{"no":"list"}');
    await expect(getActivity()).rejects.toBeInstanceOf(OrbApiError);
  });

  it('throws network, timeout, or http for a storage failure', async () => {
    getItem.mockRejectedValue(new Error('disk down'));
    await expect(getActivity()).rejects.toMatchObject({ code: 'network' });
    getItem.mockRejectedValue(new Error('timeout talking to storage'));
    await expect(getActivity()).rejects.toMatchObject({ code: 'timeout' });
    getItem.mockRejectedValue(Object.assign(new Error('upstream'), { status: 503 }));
    await expect(getActivity()).rejects.toMatchObject({ code: 'http' });
  });
});

describe('getLimitState', () => {
  it('returns defaults when no caps are stored', async () => {
    const state = await getLimitState();
    expect(state.limits).toEqual({ perTxMon: '1', dailyMon: '5' });
    expect(state.spentWei).toBe(0n);
  });

  it('throws parse on corrupt caps instead of silently using defaults', async () => {
    getItem.mockImplementation(async (key) => (key === KEYS.limits ? '{' : null));
    await expect(getLimitState()).rejects.toMatchObject({ code: 'parse' });
  });

  it('throws when the read itself fails', async () => {
    getItem.mockRejectedValue(new Error('disk down'));
    await expect(getLimitState()).rejects.toMatchObject({ code: 'network' });
  });
});
