/**
 * @file Pending-check phase kept apart from the chain result.
 *
 * `phase` is `loading | none | pending | error`. A thrown check sets `error`
 * and leaves the last `status` in place, so a failure is not "no payment".
 */
import type { OrbApiError } from './errors';
import type { PendingStatus } from './pendingTx';

/** Explicit check phase for the pending slot. */
export type PendingPhase = 'loading' | 'none' | 'pending' | 'error';

/** What `usePendingTx` stores. */
export type PendingView = {
  status: PendingStatus;
  phase: PendingPhase;
  error: OrbApiError | null;
};

/** Before the first check. `status.kind` is `none` only because nothing has loaded. */
export const initialPendingView: PendingView = { status: { kind: 'none' }, phase: 'loading', error: null };

/** Outcome of one `checkPending` call. */
export type PendingEvent = { type: 'ok'; status: PendingStatus } | { type: 'err'; error: OrbApiError };

/**
 * Phase for a successful check. In-flight and stale slots are `pending`;
 * an empty slot and a settled receipt are `none`.
 * @param status Chain result.
 * @returns `none` or `pending`.
 */
export function pendingPhaseFor(status: PendingStatus): 'none' | 'pending' {
  return status.kind === 'pending' || status.kind === 'unknown' ? 'pending' : 'none';
}

/**
 * Applies one check to the view. An error does not replace `status`.
 * @param prev Previous view.
 * @param event Success or failure.
 * @returns The next view.
 */
export function reducePendingView(prev: PendingView, event: PendingEvent): PendingView {
  if (event.type === 'err') return { status: prev.status, phase: 'error', error: event.error };
  return { status: event.status, phase: pendingPhaseFor(event.status), error: null };
}
