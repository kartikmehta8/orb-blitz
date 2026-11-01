/**
 * @file Device auth lookup: enrolled biometrics, PIN, nothing, no hardware, and a thrown probe.
 */
import { describe, expect, it } from 'vitest';
import { approvalMode, readDeviceAuth, type AuthProbe } from '../src/deviceAuth';

const probe = (over: Partial<AuthProbe> = {}): AuthProbe => ({
  hasHardwareAsync: async () => true,
  isEnrolledAsync: async () => true,
  getEnrolledLevelAsync: async () => 3,
  ...over,
});

describe('readDeviceAuth', () => {
  it('maps hardware, enrollment, and level', async () => {
    expect(await readDeviceAuth(probe())).toBe('biometric');
    expect(await readDeviceAuth(probe({ getEnrolledLevelAsync: async () => 2 }))).toBe('biometric');
    expect(await readDeviceAuth(probe({ getEnrolledLevelAsync: async () => 1 }))).toBe('pin');
    expect(await readDeviceAuth(probe({ isEnrolledAsync: async () => false }))).toBe('not-enrolled');
    expect(await readDeviceAuth(probe({ getEnrolledLevelAsync: async () => 0 }))).toBe('not-enrolled');
    expect(await readDeviceAuth(probe({ hasHardwareAsync: async () => false }))).toBe('unavailable');
  });

  it('returns error when a probe throws, which is not the not-enrolled result', async () => {
    expect(await readDeviceAuth(probe({ hasHardwareAsync: async () => Promise.reject(new Error('sensor')) }))).toBe('error');
    expect(approvalMode('not-enrolled')).toBe('hold');
    expect(approvalMode('pin')).toBe('biometric');
    expect(approvalMode('unavailable')).toBe('hold');
  });

  it('maps a lookup error to hold and still leaves loading blocked', () => {
    expect(approvalMode('error')).toBe('hold');
    expect(approvalMode(null)).toBeNull();
  });
});
