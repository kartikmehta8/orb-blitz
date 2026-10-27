/**
 * @file HTTP entry point: `GET /health` and `POST /v1/agent` (spec §9.1) with
 * bearer auth, rate limiting, body limit, zod validation and one log line per
 * request. Run directly to start the server; tests import `createApp`.
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
import { createChainClient, DEFAULT_RPC_URL } from './chain';
import { CHAIN_ID } from './intent';
import { AgentRequestSchema } from './schemas';

const BODY_LIMIT_BYTES = 32 * 1024;
const RATE_LIMIT_PER_MIN = 30;
const DEFAULT_MODEL = 'claude-haiku-5-5';

export type AppDeps = AgentDeps & {
  agentToken: string;
  /** Clock for the rate limiter; injectable for tests. */
  now?: () => number;
  /** Receives one JSON line per request. */
  log?: (line: string) => void;
};

/** Hono context variables: safe fields for the request log line. */
type Env = { Variables: { log: Record<string, unknown> } };

const sha256 = (s: string): Buffer => createHash('sha256').update(s).digest();

/**
 * Shortens an address for logs: first and last 4 characters only.
 * @param address Any address string.
 * @returns e.g. "0xAb…12cd".
 */
export const maskAddress = (address: string): string => `${address.slice(0, 4)}…${address.slice(-4)}`;

/**
 * Builds the Hono app. All I/O (model, chain, clock, log sink) is injected.
 * @param deps Token, model, chain client and optional clock/log sink.
 * @returns The app; use `app.fetch` or `app.request`.
 */
export function createApp(deps: AppDeps): Hono<Env> {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((line: string) => console.log(line));
  const expected = sha256(deps.agentToken);
  // ponytail: one shared token, so one fixed 60 s window in process memory. Use a store keyed per token/device if tokens multiply.
  const window = { start: 0, count: 0 };

  const app = new Hono<Env>();

  app.get('/health', (c) => c.json({ ok: true, chainId: CHAIN_ID, model: deps.model }));

  // One log line per API request, whatever the outcome. Handlers add safe fields via `c.set('log', …)`.
  app.use('/v1/*', async (c, next) => {
    const started = now();
    await next();
    log(JSON.stringify({ path: c.req.path, status: c.res.status, ms: now() - started, ...c.get('log') }));
  });

  app.use('/v1/*', async (c, next) => {
    const token = /^Bearer\s+(\S+)$/i.exec(c.req.header('authorization') ?? '')?.[1];
    // Hashing first gives equal-length buffers, so the compare is constant-time regardless of input length.
    if (!token || !timingSafeEqual(sha256(token), expected)) return c.json({ error: 'UNAUTHORIZED' }, 401);
    const t = now();
    if (t - window.start >= 60_000) Object.assign(window, { start: t, count: 0 });
    if (++window.count > RATE_LIMIT_PER_MIN) return c.json({ error: 'RATE_LIMITED' }, 429);
    return next();
  });

  app.use(
    '/v1/*',
    bodyLimit({ maxSize: BODY_LIMIT_BYTES, onError: (c) => c.json({ error: 'PAYLOAD_TOO_LARGE' }, 413) }),
  );

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
  const agentToken = env.AGENT_TOKEN ?? '';
  if (!agentToken || (env.NODE_ENV === 'production' && agentToken === 'change-me')) {
    console.error('Refusing to start: set AGENT_TOKEN (and not to "change-me" in production).');
    process.exit(1);
  }
  const model = env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) console.warn('ANTHROPIC_API_KEY is unset: every request uses the fallback parser.');
  const app = createApp({
    agentToken,
    model,
    chain: createChainClient(env.MONAD_RPC_URL || DEFAULT_RPC_URL),
    createMessage: apiKey ? anthropicCreateMessage(new Anthropic({ apiKey, maxRetries: 1 })) : null,
  });
  const port = Number(env.PORT) || 8787;
  serve({ fetch: app.fetch, port }, () => console.log(`Orb agent server on :${port} (model ${model}, chain ${CHAIN_ID})`));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
