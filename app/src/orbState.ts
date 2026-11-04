/**
 * @file In-memory orb visual state.
 *
 * `success` and `error` revert to `idle` after {@link ORB_REVERT_MS}.
 * A newer `set` cancels that revert. The native overlay applies the same
 * rule; this machine is what `useOrbState` and the agent flow share.
 */

/** How long a terminal flash stays up before returning to idle. */
export const ORB_REVERT_MS = 1500;

/** Visual state of the floating orb. */
export type OrbState = 'idle' | 'capturing' | 'thinking' | 'success' | 'error';

type Cancel = () => void;

/**
 * State machine with an injected clock and an apply hook (the native bridge).
 * @param schedule Runs `fn` after `ms` and returns a cancel.
 * @param apply Called with every state that becomes current, including a revert to idle.
 * @returns Get, set, and subscribe.
 */
export function createOrbStateMachine(schedule: (fn: () => void, ms: number) => Cancel, apply: (state: OrbState) => void) {
  let state: OrbState = 'idle';
  let cancel: Cancel | null = null;
  const listeners = new Set<(state: OrbState) => void>();

  const set = (next: OrbState): void => {
    cancel?.();
    cancel = null;
    state = next;
    apply(next);
    for (const listener of listeners) listener(next);
    if (next === 'success' || next === 'error') {
      cancel = schedule(() => set('idle'), ORB_REVERT_MS);
    }
  };

  return {
    /** Current state. Starts at `idle` before the first `set`. */
    get: (): OrbState => state,
    /** Moves to `next`. Cancels a pending revert first. */
    set,
    /**
     * Listens for changes.
     * @param listener Called after each `set`, including reverts.
     * @returns Unsubscribe.
     */
    subscribe(listener: (state: OrbState) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
