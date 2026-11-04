/**
 * @file Privy access-token auth: local ES256 keypair, mocked JWKS, no network.
 */
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type CryptoKey, type JSONWebKeySet } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { createPrivyAccessVerifier, loadAuthConfig, privyJwksUrl, PRIVY_ISSUER } from '../src/auth';
import { createApp } from '../src/index';
import { mockChains, mockEns } from './helpers';

const APP_ID = 'cltestapp';
const SUB = 'did:privy:user-1';

let privateKey: CryptoKey;
let otherKey: CryptoKey;
let jwks: ReturnType<typeof createLocalJWKSet>;

beforeAll(async () => {
  const primary = await generateKeyPair('ES256');
  const other = await generateKeyPair('ES256');
  privateKey = primary.privateKey;
  otherKey = other.privateKey;
  const jwk = await exportJWK(primary.publicKey);
  jwk.alg = 'ES256';
  jwk.kid = 'test';
  jwk.use = 'sig';
  const set: JSONWebKeySet = { keys: [jwk] };
  jwks = createLocalJWKSet(set);
});

async function sign(over: { iss?: string; aud?: string; sub?: string; exp?: number; key?: CryptoKey } = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ sid: 'sess' })
    .setProtectedHeader({ alg: 'ES256', kid: 'test', typ: 'JWT' })
    .setIssuer(over.iss ?? PRIVY_ISSUER)
    .setAudience(over.aud ?? APP_ID)
    .setSubject(over.sub ?? SUB)
    .setIssuedAt(now)
    .setExpirationTime(over.exp ?? now + 3600)
    .sign(over.key ?? privateKey);
}

function app() {
  return createApp({
    auth: { mode: 'privy', appId: APP_ID, verify: createPrivyAccessVerifier(APP_ID, jwks) },
    model: 'test-model',
    chains: mockChains(), ens: mockEns(),
    createMessage: null,
  });
}

const post = (token: string | null) =>
  app().request('/v1/agent', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token === null ? {} : { authorization: `Bearer ${token}` }) },
    body: '{}',
  });

describe('privy access tokens', () => {
  it('points at the Privy app JWKS', () => {
    expect(privyJwksUrl(APP_ID).href).toBe(`https://auth.privy.io/api/v1/apps/${APP_ID}/jwks.json`);
  });

  it('accepts a valid token (auth passes, body is still validated)', async () => {
    expect((await post(await sign())).status).toBe(400);
  });

  it('rejects an expired token', async () => {
    const now = Math.floor(Date.now() / 1000);
    expect((await post(await sign({ exp: now - 10 }))).status).toBe(401);
  });

  it('rejects the wrong audience', async () => {
    expect((await post(await sign({ aud: 'other-app' }))).status).toBe(401);
  });

  it('rejects the wrong issuer', async () => {
    expect((await post(await sign({ iss: 'evil.example' }))).status).toBe(401);
  });

  it('rejects a bad signature', async () => {
    expect((await post(await sign({ key: otherKey }))).status).toBe(401);
  });

  it('rejects a missing Authorization header', async () => {
    expect((await post(null)).status).toBe(401);
  });

  it('rate-limits each Privy user id separately', async () => {
    const a = await sign({ sub: 'did:privy:a' });
    const b = await sign({ sub: 'did:privy:b' });
    const server = app();
    const hit = (token: string) =>
      server.request('/v1/agent', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: '{}',
      });
    for (let i = 0; i < 30; i++) expect((await hit(a)).status).toBe(400);
    expect((await hit(a)).status).toBe(429);
    expect((await hit(b)).status).toBe(400);
  });
});

describe('loadAuthConfig', () => {
  it('requires PRIVY_APP_ID unless AUTH_MODE=token', () => {
    expect(() => loadAuthConfig({})).toThrow(/PRIVY_APP_ID/);
    expect(() => loadAuthConfig({ AUTH_MODE: 'privy' })).toThrow(/PRIVY_APP_ID/);
    expect(loadAuthConfig({ PRIVY_APP_ID: APP_ID })).toEqual({ mode: 'privy', appId: APP_ID });
  });

  it('allows the shared token only when AUTH_MODE=token', () => {
    expect(() => loadAuthConfig({ AUTH_MODE: 'token' })).toThrow(/AGENT_TOKEN/);
    expect(() => loadAuthConfig({ AUTH_MODE: 'token', AGENT_TOKEN: 'change-me', NODE_ENV: 'production' })).toThrow(/change-me/);
    expect(loadAuthConfig({ AUTH_MODE: 'token', AGENT_TOKEN: 'local-dev' })).toEqual({ mode: 'token', agentToken: 'local-dev' });
    expect(() => loadAuthConfig({ AUTH_MODE: 'basic', PRIVY_APP_ID: APP_ID })).toThrow(/AUTH_MODE/);
  });
});
