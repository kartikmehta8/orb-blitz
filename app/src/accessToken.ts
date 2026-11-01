/**
 * @file Privy access token for the agent client.
 *
 * `useWallet` registers `getAccessToken` from `usePrivy`. The agent client
 * calls it at request time so the SDK can refresh a token that is about to expire.
 */

type Provider = () => Promise<string | null>;

let provider: Provider | null = null;

/**
 * Registers the Privy token provider. The latest registration wins.
 * @param next `usePrivy().getAccessToken`.
 */
export function registerAccessTokenProvider(next: Provider): void {
  provider = next;
}

/**
 * Current user's Privy access token.
 * @returns The token, or null when signed out, unregistered, or the SDK throws.
 */
export async function currentAccessToken(): Promise<string | null> {
  if (!provider) return null;
  try {
    const token = await provider();
    return token && token.length > 0 ? token : null;
  } catch {
    return null;
  }
}
