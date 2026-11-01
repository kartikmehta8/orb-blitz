/**
 * @file Privy access-token verification and startup auth config.
 *
 * The app sends the user's Privy access token (`getAccessToken`) as
 * `Authorization: Bearer`. This verifies it as an ES256 JWT against Privy's
 * public JWKS. No app secret is involved.
 *
 * TODO: A valid token proves the caller is that Privy user (`sub`). It does
 * not prove that `wallet.address` in the request belongs to them. Binding the
 * wallet needs the Privy app secret (a user lookup). Do not put that secret
 * in the app or in `EXPO_PUBLIC_*`.
 */
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

/** `iss` claim Privy puts on access tokens. */
export const PRIVY_ISSUER = 'privy.io';

/** Verifies a bearer token and returns the Privy user id (`sub`). */
export type AccessVerifier = (token: string) => Promise<{ sub: string }>;

/** How `createApp` authenticates `/v1/*`. */
export type AuthConfig =
  | { mode: 'token'; agentToken: string }
  | { mode: 'privy'; appId: string; verify: AccessVerifier };

/**
 * JWKS for one Privy app.
 *
 * `https://auth.privy.io/api/v1/apps/<appId>/jwks.json` answers as Privy's
 * app JWKS (a bad app id returns `missing_or_invalid_privy_app_id`). The
 * current `@privy-io/node` client builds the same document on `api.privy.io`;
 * both hosts served that error for an unknown app id. Claims checked here
 * match the access-token docs and the SDK: ES256, `iss` `privy.io`, `aud`
 * the app id, and `exp`.
 * @param appId Privy app id. Also the token `aud`.
 * @returns The JWKS URL.
 */
export function privyJwksUrl(appId: string): URL {
  return new URL(`https://auth.privy.io/api/v1/apps/${encodeURIComponent(appId)}/jwks.json`);
}

/**
 * Verifies a Privy access token.
 * @param appId Privy app id (`aud`).
 * @param getKey JWKS resolver. Defaults to a cached remote set (`jose` caches keys).
 * @returns The Privy user id (`sub`) or throws when the token is not valid.
 */
export function createPrivyAccessVerifier(
  appId: string,
  getKey: JWTVerifyGetKey = createRemoteJWKSet(privyJwksUrl(appId)),
): AccessVerifier {
  return async (token) => {
    const { payload } = await jwtVerify(token, getKey, {
      algorithms: ['ES256'],
      issuer: PRIVY_ISSUER,
      audience: appId,
      typ: 'JWT',
    });
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      throw new Error('Access token is missing sub');
    }
    return { sub: payload.sub };
  };
}

/**
 * Reads auth config from the environment.
 *
 * Privy is the default. `AUTH_MODE=token` is the only shared-token escape
 * hatch, and it has to be set explicitly. Missing `PRIVY_APP_ID` in privy
 * mode throws so the process can exit before it listens.
 * @param env Process environment.
 * @returns Token or Privy app id. The caller attaches the JWKS verifier.
 */
export function loadAuthConfig(
  env: NodeJS.ProcessEnv,
): { mode: 'token'; agentToken: string } | { mode: 'privy'; appId: string } {
  if (env.AUTH_MODE === 'token') {
    const agentToken = env.AGENT_TOKEN ?? '';
    if (!agentToken || (env.NODE_ENV === 'production' && agentToken === 'change-me')) {
      throw new Error('Refusing to start: AUTH_MODE=token requires AGENT_TOKEN (and not "change-me" in production).');
    }
    return { mode: 'token', agentToken };
  }
  if (env.AUTH_MODE !== undefined && env.AUTH_MODE !== '' && env.AUTH_MODE !== 'privy') {
    throw new Error('Refusing to start: AUTH_MODE must be "privy" or "token".');
  }
  const appId = env.PRIVY_APP_ID ?? '';
  if (!appId) throw new Error('Refusing to start: PRIVY_APP_ID is required.');
  return { mode: 'privy', appId };
}
