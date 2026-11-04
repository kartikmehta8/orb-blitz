/**
 * @file App-facing orb state.
 *
 * Call `setOrbState` from here so the React hook and the native overlay stay
 * in step. `BubbleOverlay.setOrbState` alone updates the overlay only.
 */
import { BubbleOverlay } from '../modules/bubble-overlay';
import { createOrbStateMachine, type OrbState } from './orbState';

const machine = createOrbStateMachine(
  (fn, ms) => {
    const handle = setTimeout(fn, ms);
    return () => clearTimeout(handle);
  },
  (state) => {
    try {
      BubbleOverlay?.setOrbState(state);
    } catch {
      // Expo Go or a build without the native module. The hook still updates.
    }
  },
);

/**
 * Sets the orb visual state. `success` and `error` return to `idle` after 1.5s.
 * A later call cancels that revert.
 * @param state Next state.
 */
export function setOrbState(state: OrbState): void {
  machine.set(state);
}

/**
 * Latest state.
 * @returns The current orb state.
 */
export function getOrbState(): OrbState {
  return machine.get();
}

/**
 * Subscribes to state changes.
 * @param listener Called with each new state.
 * @returns Unsubscribe.
 */
export function subscribeOrbState(listener: (state: OrbState) => void): () => void {
  return machine.subscribe(listener);
}
