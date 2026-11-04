/**
 * @file HTTP entry point: `GET /health`, `POST /v1/agent` and the connected-agent
 * routes (`/mcp`, `/inbox/wait`, `/v1/agents`, `/v1/requests`) with bearer auth,
 * rate limiting, body limit, zod validation and one log line per request. Run directly to start the server; tests import `createApp`.
 */
import Anthropic from '@anthropic-ai/sdk';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { createHash, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { anthropicCreateMessage, runAgent, type AgentDeps } from './agent';
import { mountAgentRoutes } from './agents/routes';
import { AgentStore } from './agents/store';
import { createPrivyAccessVerifier, loadAuthConfig, type AuthConfig } from './auth';
import { createChainClients, createEnsClient, DEFAULT_ENS_RPC_URL } from './chain';
import { CHAIN_IDS } from './intent';
import { AgentRequestSchema } from './schemas';

const BODY_LIMIT_BYTES = 32 * 1024;
const RATE_LIMIT_PER_MIN = 30;
const DEFAULT_MODEL = 'claude-haiku-5-5';

/** Agent dependencies plus the HTTP layer's auth, clock and log sink. */
export type AppDeps = AgentDeps & {
  auth: AuthConfig;
  /** Clock for the rate limiter; injectable for tests. */
  now?: () => number;
  /** Receives one JSON line per request. */
  log?: (line: string) => void;
  /** Connected agents and their requests; defaults to memory only. */
  agents?: AgentStore;
};

/** Hono context variables: safe fields for the request log line, and the caller's Privy user id. */
type Env = { Variables: { log: Record<string, unknown>; userId: string } };

const sha256 = (s: string): Buffer => createHash('sha256').update(s).digest();

/**
 * Shortens an address for logs: first and last 4 characters only.
 * @param address Any address string.
 * @returns e.g. "0xAb…12cd".
 */
export const maskAddress = (address: string): string => `${address.slice(0, 4)}…${address.slice(-4)}`;

/**
 * Builds the Hono app. All I/O (model, chain, clock, log sink) is injected.
 * @param deps Auth, model, chain client and optional clock/log sink.
 * @returns The app; use `app.fetch` or `app.request`.
 */
export function createApp(deps: AppDeps): Hono<Env> {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((line: string) => console.log(line));
  const expected = deps.auth.mode === 'token' ? sha256(deps.auth.agentToken) : null;
  // One 60s window per Privy user id (`sub`). Token mode has a single shared key.
  const windows = new Map<string, { start: number; count: number }>();
  const rateLimited = (key: string): boolean => {
    const t = now();
    let window = windows.get(key);
    if (!window || t - window.start >= 60_000) {
      window = { start: t, count: 0 };
      windows.set(key, window);
    }
    window.count += 1;
    if (windows.size > 1_000) {
      for (const [id, item] of windows) if (t - item.start >= 60_000) windows.delete(id);
    }
    return window.count > RATE_LIMIT_PER_MIN;
  };

  const app = new Hono<Env>();

  app.get('/health', (c) => c.json({ ok: true, chainIds: CHAIN_IDS, model: deps.model }));

  // One log line per API request, whatever the outcome. Handlers add safe fields via `c.set('log', …)`.
  for (const path of ['/v1/*', '/mcp', '/inbox/*']) {
    app.use(path, async (c, next) => {
      const started = now();
      await next();
      log(JSON.stringify({ path: c.req.path, status: c.res.status, ms: now() - started, ...c.get('log') }));
    });
  }

  app.use('/v1/*', async (c, next) => {
    const token = /^Bearer\s+(\S+)$/i.exec(c.req.header('authorization') ?? '')?.[1];
    if (!token) return c.json({ error: 'UNAUTHORIZED' }, 401);
    let key: string;
    if (deps.auth.mode === 'token') {
      // Hashing first gives equal-length buffers, so the compare is constant-time regardless of input length.
      if (!expected || !timingSafeEqual(sha256(token), expected)) return c.json({ error: 'UNAUTHORIZED' }, 401);
      key = 'token';
    } else {
      try {
        key = (await deps.auth.verify(token)).sub;
      } catch {
        return c.json({ error: 'UNAUTHORIZED' }, 401);
      }
    }
    if (rateLimited(key)) return c.json({ error: 'RATE_LIMITED' }, 429);
    c.set('userId', key);
    return next();
  });

  for (const path of ['/v1/*', '/mcp']) {
    app.use(path, bodyLimit({ maxSize: BODY_LIMIT_BYTES, onError: (c) => c.json({ error: 'PAYLOAD_TOO_LARGE' }, 413) }));
  }

  app.post('/v1/agent', async (c) => {
    const body: unknown = await c.req.json().catch(() => undefined);
    const parsed = AgentRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'BAD_REQUEST', message: z.prettifyError(parsed.error).slice(0, 500) }, 400);
    }
    const req = parsed.data;
    const { response, errorCodes } = await runAgent(req, deps);
    c.set('log', {
      requestId: req.requestId.slice(0, 64),
      tools: response.meta.toolCalls,
      intents: response.intents.length,
      clarification: !!response.clarification,
      fallback: response.meta.fallback,
      errors: errorCodes,
      wallet: maskAddress(req.wallet.address),
      to: response.intents.map((i) => maskAddress(i.to)),
      contextChars: req.context?.text.length ?? 0,
    });
    return c.json(response);
  });

  mountAgentRoutes(app, { store: deps.agents ?? new AgentStore(null, now), chains: deps.chains, ens: deps.ens, rateLimited });

  app.onError((err, c) => {
    c.set('log', { errors: [err.name] });
    return c.json({ error: 'INTERNAL' }, 500);
  });

  return app;
}

/** Reads env, refuses unsafe config, and starts listening. */
function main(): void {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const env = process.env;
  let loaded;
  try {
    loaded = loadAuthConfig(env);
  } catch (e) {
    console.error(e instanceof Error ? e.message : 'Refusing to start.');
    process.exit(1);
  }
  const auth: AuthConfig =
    loaded.mode === 'token' ? loaded : { mode: 'privy', appId: loaded.appId, verify: createPrivyAccessVerifier(loaded.appId) };
  const model = env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) console.warn('ANTHROPIC_API_KEY is unset: every request uses the fallback parser.');
  const app = createApp({
    auth,
    model,
    chains: createChainClients(env),
    ens: createEnsClient(env.ENS_RPC_URL || DEFAULT_ENS_RPC_URL),
    createMessage: apiKey ? anthropicCreateMessage(new Anthropic({ apiKey, maxRetries: 1 })) : null,
    agents: new AgentStore(env.AGENTS_FILE || 'data/agents.json'),
  });
  const port = Number(env.PORT) || 8787;
  serve({ fetch: app.fetch, port }, () => console.log(`Orb agent server on :${port} (model ${model}, chains ${CHAIN_IDS.join(', ')})`));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
