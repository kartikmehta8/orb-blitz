/**
 * @file Pending-check phase: a failure is not "no payment".
 */
import { describe, expect, it } from 'vitest';
import type { Hash } from 'viem';
import { OrbApiError } from '../src/errors';
import type { PendingStatus } from '../src/pendingTx';
import { initialPendingView, reducePendingView } from '../src/pendingView';

const pending: PendingStatus = {
  kind: 'pending',
  tx: {
    hash: `0x${'ab'.repeat(32)}` as Hash,
    intentId: 'i',
    to: '0x1111111111111111111111111111111111111111',
    amountWei: '1',
    sentAt: 1,
  },
};

describe('reducePendingView', () => {
  it('starts loading, then none or pending from a real result', () => {
    expect(initialPendingView.phase).toBe('loading');
    expect(reducePendingView(initialPendingView, { type: 'ok', status: { kind: 'none' } }).phase).toBe('none');
    expect(reducePendingView(initialPendingView, { type: 'ok', status: pending }).phase).toBe('pending');
  });

  it('keeps the last status when the check throws', () => {
    const had = reducePendingView(initialPendingView, { type: 'ok', status: pending });
    const next = reducePendingView(had, { type: 'err', error: new OrbApiError('network', 'rpc down') });
    expect(next.phase).toBe('error');
    expect(next.status).toBe(pending);
    expect(next.error).toMatchObject({ code: 'network', message: 'rpc down' });
    const first = reducePendingView(initialPendingView, { type: 'err', error: new OrbApiError('timeout', 'slow') });
    expect(first.phase).toBe('error');
    expect(first.status).toEqual({ kind: 'none' });
  });
});
