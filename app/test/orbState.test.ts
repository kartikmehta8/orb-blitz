/**
 * @file Orb visual state: success and error revert, and the last call wins.
 */
import { describe, expect, it } from 'vitest';
import { createOrbStateMachine, ORB_REVERT_MS, type OrbState } from '../src/orbState';

describe('orb state machine', () => {
  it('reverts success and error to idle after 1.5s, and a new state cancels that', () => {
    let now = 0;
    const queued: { at: number; fn: () => void }[] = [];
    const applied: OrbState[] = [];
    const machine = createOrbStateMachine(
      (fn, ms) => {
        const at = now + ms;
        const job = { at, fn };
        queued.push(job);
        return () => {
          const i = queued.indexOf(job);
          if (i >= 0) queued.splice(i, 1);
        };
      },
      (state) => applied.push(state),
    );

    const fire = () => {
      const due = queued.filter((job) => job.at <= now);
      for (const job of due) {
        const i = queued.indexOf(job);
        if (i >= 0) queued.splice(i, 1);
        job.fn();
      }
    };

    machine.set('capturing');
    machine.set('thinking');
    now = ORB_REVERT_MS;
    fire();
    expect(machine.get()).toBe('thinking');

    machine.set('success');
    now = ORB_REVERT_MS + ORB_REVERT_MS;
    fire();
    expect(machine.get()).toBe('idle');

    machine.set('error');
    machine.set('capturing');
    now += ORB_REVERT_MS;
    fire();
    expect(machine.get()).toBe('capturing');
    expect(applied).toEqual(['capturing', 'thinking', 'success', 'idle', 'error', 'capturing']);
  });
});
