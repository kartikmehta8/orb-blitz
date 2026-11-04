/**
 * @file The MCP server a connected agent (Claude Code, Codex, any MCP client) talks to.
 *
 * Built per HTTP request and bound to one agent, so every tool runs as that
 * agent with its own limits. Agents only ask: `request_payment` sends a push
 * to the owner's phone, and the money moves only after a fingerprint there.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { formatEther } from 'viem';
import { z } from 'zod';
import type { ChainClients } from '../chain';
import { isTransferError, MAINNET_CHAIN_ID, NETWORKS, parseMon, prepareTransfer, shortAddress, TESTNET_CHAIN_ID, type EnsReader } from '../intent';
import { getTxStatus } from '../tools/getTxStatus';
import { getWalletBalance } from '../tools/getWalletBalance';
import { inspectAddress } from '../tools/inspectAddress';
import type { ToolCtx, ToolOutput } from '../tools/tool';
import { MAX_PENDING_PER_AGENT, type AgentRecord, type AgentStore, type PaymentRequest } from './store';

/** Longest a single `get_payment_status` call may wait. */
const MAX_WAIT_S = 25;

type Deps = { store: AgentStore; chains: ChainClients; ens: EnsReader };

const INSTRUCTIONS =
  'Orb is the user\'s phone wallet on Monad (native MON) on two networks: mainnet (real MON) and testnet. ' +
  'Every payment needs a network: if the user did not say "mainnet" or "testnet", ask them before calling request_payment. ' +
  'You can check the balance, look up addresses and ENS names, ' +
  'and request payments. A payment request goes to the user\'s phone as a notification; it is sent only after they approve it ' +
  'with their fingerprint, and you have your own per-payment and daily limits. After request_payment, call get_payment_status ' +
  'with wait_seconds to learn the outcome. Never tell the user a payment was sent until the status is "sent".';

/** Agent-facing view of a request. */
function view(r: PaymentRequest): Record<string, unknown> {
  return {
    request_id: r.id,
    status: r.status,
    network: NETWORKS[r.chainId].key,
    to: r.to,
    amount_mon: r.amountMon,
    ...(r.txHash ? { tx_hash: r.txHash } : {}),
    expires_at: new Date(r.expiresAt).toISOString(),
  };
}

const json = (out: ToolOutput) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(out) }],
  isError: typeof out.error === 'string',
});

/**
 * Builds the MCP server for one agent.
 * @param agent The authenticated agent.
 * @param deps Store and chain access.
 * @param signal Aborts long waits when the client disconnects.
 * @returns A server with five tools, ready to connect to a transport.
 */
export function agentMcpServer(agent: AgentRecord, deps: Deps, signal?: AbortSignal): McpServer {
  const { store } = deps;
  const remainingMon = () => {
    const left = (parseMon(agent.dailyMon) ?? 0n) - (parseMon(store.committedMon(agent.id)) ?? 0n);
    return formatEther(left > 0n ? left : 0n);
  };
  const ctx = (): ToolCtx => ({
    chains: deps.chains,
    ens: deps.ens,
    wallet: agent.wallet,
    perTxMon: agent.perTxMon,
    dailyRemainingMon: remainingMon(),
    context: null,
    userTexts: [],
    intents: [],
    clarification: null,
    assessment: null,
  });
  const server = new McpServer({ name: 'orb', version: '1.0.0' }, { instructions: INSTRUCTIONS });

  server.registerTool(
    'get_wallet_balance',
    { description: `${getWalletBalance.description} Also returns your spending limits as this agent.`, inputSchema: getWalletBalance.input.shape },
    async () =>
      json({
        ...(await getWalletBalance.run(ctx(), {})),
        limits: { per_payment_mon: agent.perTxMon, daily_mon: agent.dailyMon, remaining_today_mon: remainingMon() },
      }),
  );
  server.registerTool(
    inspectAddress.name,
    { description: inspectAddress.description, inputSchema: inspectAddress.input.shape },
    async (input) => json(await inspectAddress.run(ctx(), input)),
  );
  server.registerTool(
    getTxStatus.name,
    { description: getTxStatus.description, inputSchema: getTxStatus.input.shape },
    async (input) => json(await getTxStatus.run(ctx(), input)),
  );

  server.registerTool(
    'request_payment',
    {
      description:
        'Asks the user to pay MON on Monad mainnet (real MON) or testnet. Sends a notification to their phone; nothing moves until they approve with their fingerprint. ' +
        'Pass the network the user named; if they did not name one, ask them first. ' +
        'Must be within your per-payment and remaining daily limit (see get_wallet_balance). Returns a request_id for get_payment_status.',
      inputSchema: {
        network: z.enum(['mainnet', 'testnet']).describe('The network the user named. Mainnet moves real MON.'),
        to: z.string().min(1).max(255).describe('Recipient 0x address or ENS name such as "kartik.eth".'),
        amount_mon: z.string().max(40).describe('Amount in MON as a decimal string, e.g. "0.25".'),
        reason: z.string().min(1).max(200).describe('Why, in a few words. Shown to the user on their phone.'),
      },
    },
    async ({ network, to, amount_mon, reason }) => {
      if (store.pendingCount(agent.id) >= MAX_PENDING_PER_AGENT) {
        return json({ error: 'TOO_MANY_PENDING', message: `You already have ${MAX_PENDING_PER_AGENT} requests waiting for the user.` });
      }
      const c = ctx();
      const chainId = network === 'mainnet' ? MAINNET_CHAIN_ID : TESTNET_CHAIN_ID;
      // Same validation the phone runs: address or ENS name, amount, limits, balance. The phone re-runs it before signing.
      const result = await prepareTransfer(
        c.chains[chainId],
        {
          id: 'agent-check',
          chainId,
          to,
          amountMon: amount_mon,
          wallet: agent.wallet,
          perTxMon: agent.perTxMon,
          dailyRemainingMon: c.dailyRemainingMon,
          context: { source: 'agent', appLabel: agent.name, text: to },
          userTexts: [],
          parsedBy: 'agent',
          memo: reason,
        },
        deps.ens,
      );
      if (isTransferError(result)) return json(result);
      const request = store.addRequest({
        agentId: agent.id,
        userId: agent.userId,
        chainId,
        to: result.ensName ?? result.to,
        toAddress: result.to,
        amountMon: amount_mon.trim(),
        // Shown in the notification and on the card: the same sanitizer as any memo (80 chars, no addresses).
        reason: result.memo ?? 'No reason given',
        ...(result.memo ? { memo: result.memo } : {}),
      });
      return json({
        ...view(request),
        message: `Sent to the user's phone: ${request.amountMon} MON on ${NETWORKS[chainId].name} to ${result.ensName ?? shortAddress(result.to)}. Waiting for their fingerprint.`,
      });
    },
  );

  server.registerTool(
    'get_payment_status',
    {
      description:
        'Status of a payment request: pending, sent (with tx_hash and on-chain status), declined or expired. ' +
        `Pass wait_seconds (up to ${MAX_WAIT_S}) to wait for the user's answer.`,
      inputSchema: {
        request_id: z.string().uuid(),
        wait_seconds: z.number().int().min(0).max(MAX_WAIT_S).optional(),
      },
    },
    async ({ request_id, wait_seconds }) => {
      let r = store.request(request_id, { agentId: agent.id });
      if (r?.status === 'pending' && wait_seconds) {
        await store.waitForStatus(request_id, wait_seconds * 1000, signal);
        r = store.request(request_id, { agentId: agent.id });
      }
      if (!r) return json({ error: 'NOT_FOUND', message: 'No such request for this agent.' });
      const hash = r.txHash;
      const chain = hash
        ? await getTxStatus.run(ctx(), { hash, network: NETWORKS[r.chainId].key }).catch(() => ({ status: 'unknown' }))
        : null;
      return json({ ...view(r), ...(chain ? { chain } : {}) });
    },
  );

  return server;
}
