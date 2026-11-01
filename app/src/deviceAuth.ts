/**
 * @file How this phone can approve a payment.
 *
 * `readDeviceAuth` separates "nothing enrolled" from "the lookup failed".
 * `approvalMode` is what the current confirm card already switches on:
 * a system prompt, a hold, or blocked (`null`) while loading or after an error.
 */

/** Result of the LocalAuthentication probes. */
export type DeviceAuthStatus = 'biometric' | 'pin' | 'not-enrolled' | 'unavailable' | 'error';

/** The three expo-local-authentication calls this lookup needs. */
export type AuthProbe = {
  hasHardwareAsync: () => Promise<boolean>;
  isEnrolledAsync: () => Promise<boolean>;
  /** expo-local-authentication `SecurityLevel` (0 none, 1 PIN, 2+ biometric). */
  getEnrolledLevelAsync: () => Promise<number>;
};

/** `SecurityLevel.NONE`. */
const NONE = 0;
/** `SecurityLevel.SECRET` (PIN, pattern, or password). */
const SECRET = 1;

/**
 * Maps hardware, enrollment, and enrolled level to a status.
 * A thrown probe is `error`, not `not-enrolled`.
 * @param probe LocalAuthentication, or a test double.
 * @returns The device status. Never throws.
 */
export async function readDeviceAuth(probe: AuthProbe): Promise<DeviceAuthStatus> {
  try {
    const [hardware, enrolled, level] = await Promise.all([
      probe.hasHardwareAsync(),
      probe.isEnrolledAsync(),
      probe.getEnrolledLevelAsync(),
    ]);
    if (!hardware) return 'unavailable';
    if (!enrolled || level <= NONE) return 'not-enrolled';
    if (level === SECRET) return 'pin';
    return 'biometric';
  } catch {
    return 'error';
  }
}

/**
 * Button switch for the confirm card that is on main today.
 *
 * PIN uses the same system prompt as biometrics. `error` is `null` so Confirm
 * stays disabled instead of falling through to the hold copy. Not-enrolled
 * and no-hardware stay on hold, which is the path that card already renders.
 * @param status Device lookup, or null while it is in flight.
 * @returns `biometric`, `hold`, or null.
 */
export function approvalMode(status: DeviceAuthStatus | null): 'biometric' | 'hold' | null {
  if (status === null || status === 'error') return null;
  if (status === 'biometric' || status === 'pin') return 'biometric';
  return 'hold';
}
