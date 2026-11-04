/**
 * @file Routes for connected agents.
 *
 * - `/mcp`: Streamable HTTP MCP for agents, authenticated by `Bearer orb_ak_…`.
 * - `/inbox/wait`: long poll the orb's background service holds open, authenticated
 *   by `Bearer orb_in_…`. It returns notification text only, never anything to sign.
 * - `/v1/agents`, `/v1/inbox`, `/v1/requests/:id`: the app's own calls, behind the
 *   Privy check in `index.ts`, which sets `userId`.
 */
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { Hono } from 'hono';
import { z } from 'zod';
import type { ChainClients } from '../chain';
import { NETWORKS, parseMon, shortAddress, toChecksumAddress, type EnsReader } from '../intent';
import { agentMcpServer } from './mcp';
import type { AgentRecord, AgentStore, PaymentRequest } from './store';

/** Server-side hold for one long poll. The phone reads with a longer timeout. */
const INBOX_WAIT_MS = 25_000;
/** Same hard ceiling as the app's spend limits. */
const HARD_MAX_MON = 10n * 10n ** 18n;

export type AgentRouteDeps = {
  store: AgentStore;
  chains: ChainClients;
  ens: EnsReader;
  /** Shared per-key rate limiter from `index.ts`. */
  rateLimited: (key: string) => boolean;
};

type Env = { Variables: { log: Record<string, unknown>; userId: string } };

const bearer = (header: string | undefined) => /^Bearer\s+(\S+)$/i.exec(header ?? '')?.[1] ?? null;

const MonDecimal = z.string().regex(/^\d{1,2}(\.\d{1,18})?$/);
const CreateAgentSchema = z
  .object({
    name: z.string().trim().min(1).max(40),
    wallet: z.string(),
    perTxMon: MonDecimal,
    dailyMon: MonDecimal,
  })
  .refine((b) => toChecksumAddress(b.wallet) !== null, 'wallet must be a 0x address')
  .refine((b) => {
    const perTx = parseMon(b.perTxMon) ?? 0n;
    const daily = parseMon(b.dailyMon) ?? 0n;
    return perTx > 0n && perTx <= daily && daily <= HARD_MAX_MON;
  }, 'limits must satisfy 0 < per payment <= daily <= 10 MON');

const AnswerSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('declined') }),
  z.object({ status: z.literal('sent'), txHash: z.templateLiteral(['0x', z.string().regex(/^[0-9a-fA-F]{64}$/)]) }),
]);

/** What the app sees for one agent. */
function agentView(a: AgentRecord, store: AgentStore) {
  return { id: a.id, name: a.name, perTxMon: a.perTxMon, dailyMon: a.dailyMon, spentMon: store.committedMon(a.id), createdAt: a.createdAt };
}

/** What the app sees for one request; `agentName` is the owner's own label for the agent. */
function requestView(r: PaymentRequest, store: AgentStore) {
  const agent = store.agentsFor(r.userId).find((a) => a.id === r.agentId);
  return {
    id: r.id,
    agentName: agent?.name ?? 'An agent',
    chainId: r.chainId,
    to: r.to,
    amountMon: r.amountMon,
    reason: r.reason,
    status: r.status,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
    ...(r.txHash ? { txHash: r.txHash } : {}),
  };
}

/**
 * Notification copy for the phone. Built here so the Kotlin side only displays text.
 * @returns Title and body.
 */
function notificationText(r: PaymentRequest, store: AgentStore): { title: string; body: string } {
  const v = requestView(r, store);
  const to = r.to.startsWith('0x') ? shortAddress(r.to) : r.to;
  const on = NETWORKS[r.chainId].key === 'mainnet' ? 'on Mainnet' : 'on Testnet';
  return { title: `${v.agentName} wants to pay ${r.amountMon} MON ${on}`, body: `To ${to}, for ${r.reason}. Tap to review.` };
}

/**
 * Adds the agent routes to the app.
 * @param app Hono app; `/v1/*` must already be behind the Privy check.
 * @param deps Store, chain access and the rate limiter.
 */
export function mountAgentRoutes(app: Hono<Env>, deps: AgentRouteDeps): void {
  const { store } = deps;

  app.all('/mcp', async (c) => {
    const key = bearer(c.req.header('authorization'));
    const agent = key ? store.agentByKey(key) : null;
    if (!agent) return c.json({ error: 'UNAUTHORIZED', message: 'Connect this agent from the Orb app and use its key.' }, 401);
    if (deps.rateLimited(`agent:${agent.id}`)) return c.json({ error: 'RATE_LIMITED' }, 429);
    c.set('log', { agent: agent.id });
    // Stateless: one server and transport per request, so nothing leaks between agents.
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await agentMcpServer(agent, deps, c.req.raw.signal).connect(transport);
    return transport.handleRequest(c.req.raw);
  });

  app.get('/inbox/wait', async (c) => {
    const token = bearer(c.req.header('authorization'));
    const userId = token ? store.inboxOwner(token) : null;
    if (!userId) return c.json({ error: 'UNAUTHORIZED' }, 401);
    // The phone holds one poll at a time (~2/min); anything far above that is not the phone.
    if (deps.rateLimited(`inbox:${userId}`)) return c.json({ error: 'RATE_LIMITED' }, 429);
    const since = Number(c.req.query('since')) || 0;
    const fresh = () => store.pendingFor(userId).filter((r) => r.createdAt > since);
    if (fresh().length === 0) await store.waitForRequest(userId, INBOX_WAIT_MS, c.req.raw.signal);
    return c.json({
      requests: fresh().map((r) => ({ id: r.id, createdAt: r.createdAt, ...notificationText(r, store) })),
    });
  });

  app.post('/v1/agents', async (c) => {
    const parsed = CreateAgentSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return c.json({ error: 'BAD_REQUEST', message: z.prettifyError(parsed.error).slice(0, 300) }, 400);
    const { name, wallet, perTxMon, dailyMon } = parsed.data;
    const { agent, key } = store.createAgent({
      userId: c.get('userId'),
      wallet: toChecksumAddress(wallet) as `0x${string}`,
      name,
      perTxMon,
      dailyMon,
    });
    c.set('log', { agent: agent.id });
    return c.json({ agent: agentView(agent, store), key });
  });

  app.get('/v1/agents', (c) => {
    const userId = c.get('userId');
    return c.json({
      agents: store.agentsFor(userId).map((a) => agentView(a, store)),
      requests: store.pendingFor(userId).map((r) => requestView(r, store)),
    });
  });

  app.delete('/v1/agents/:id', (c) =>
    store.revokeAgent(c.get('userId'), c.req.param('id')) ? c.json({ ok: true }) : c.json({ error: 'NOT_FOUND' }, 404),
  );

  app.post('/v1/inbox', (c) => c.json({ inboxToken: store.rotateInbox(c.get('userId')) }));

  app.get('/v1/requests/:id', (c) => {
    const r = store.request(c.req.param('id'), { userId: c.get('userId') });
    return r ? c.json(requestView(r, store)) : c.json({ error: 'NOT_FOUND' }, 404);
  });

  app.post('/v1/requests/:id', async (c) => {
    const parsed = AnswerSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return c.json({ error: 'BAD_REQUEST' }, 400);
    const r = store.answer(c.get('userId'), c.req.param('id'), parsed.data);
    return r ? c.json(requestView(r, store)) : c.json({ error: 'NOT_PENDING' }, 409);
  });
}
