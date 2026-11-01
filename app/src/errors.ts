/**
 * @file Typed failure for reads the UI must not treat as an empty result.
 */

/** Why a read failed. */
export type OrbApiErrorCode = 'network' | 'timeout' | 'http' | 'parse';

/**
 * A real read failure. An empty store is not an `OrbApiError`.
 */
export class OrbApiError extends Error {
  readonly code: OrbApiErrorCode;

  /**
   * @param code Failure class.
   * @param message Short explanation safe to show in a retry card.
   */
  constructor(code: OrbApiErrorCode, message: string) {
    super(message);
    this.name = 'OrbApiError';
    this.code = code;
  }
}

/**
 * Classifies an unknown throw.
 * @param e Anything caught.
 * @returns An `OrbApiError`, reused when `e` already is one.
 */
export function toOrbApiError(e: unknown): OrbApiError {
  if (e instanceof OrbApiError) return e;
  if (e instanceof SyntaxError) return new OrbApiError('parse', e.message || 'Could not parse the response.');
  const message = e instanceof Error && e.message ? e.message : 'Request failed';
  const status =
    typeof e === 'object' && e !== null && 'status' in e && typeof (e as { status: unknown }).status === 'number'
      ? (e as { status: number }).status
      : undefined;
  if (status !== undefined) return new OrbApiError('http', message);
  if (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')) return new OrbApiError('timeout', message);
  if (/timeout|timed out/i.test(message)) return new OrbApiError('timeout', message);
  return new OrbApiError('network', message);
}
