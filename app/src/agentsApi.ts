/**
 * @file Connected agents: the app's calls to `/v1/agents`, `/v1/inbox` and `/v1/requests`.
 *
 * An agent never reaches the phone directly. It asks the server, the orb's
 * background service turns that into a notification, and this file reads the
 * request so the review card can rebuild and check it before the fingerprint.
 */
import type { Address, Hash } from 'viem';
import { BubbleOverlay } from '../modules/bubble-overlay';
import { currentAccessToken } from './accessToken';
import { config } from './config';
import { OrbApiError } from './errors';
import { isRecord } from './storage';

export type ConnectedAgent = { id: string; name: string; perTxMon: string; dailyMon: string; spentMon: string; createdAt: number };

export type AgentPaymentRequest = {
  id: string;
  agentName: string;
  /** Monad mainnet (143) or testnet (10143), as the agent stated it. */
  chainId: number;
  /** 0x address or ENS name, exactly as the agent gave it. */
  to: string;
  amountMon: string;
  reason: string;
  status: 'pending' | 'declined' | 'sent' | 'expired';
  createdAt: number;
  expiresAt: number;
};

/**
 * Authenticated JSON call to the agent server.
 * @param path Path under the server root.
 * @param init Method and body.
 * @returns Parsed JSON.
 * @throws OrbApiError `network`, `http` or `parse`.
 */
async function call(path: string, init: { method?: string; body?: unknown } = {}): Promise<unknown> {
  if (!config.agentUrl) throw new OrbApiError('network', 'EXPO_PUBLIC_AGENT_URL is not set.');
  const token = await currentAccessToken();
  if (!token) throw new OrbApiError('http', 'Sign in again.');
  let res: Response;
  try {
    res = await fetch(`${config.agentUrl}${path}`, {
      method: init.method ?? 'GET',
      headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
      ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    });
  } catch {
    throw new OrbApiError('network', "Couldn't reach the Orb server.");
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message = isRecord(body) && typeof body.message === 'string' ? body.message : `Server error ${res.status}.`;
    throw new OrbApiError('http', message);
  }
  return body;
}

/** @returns Connected agents and the requests waiting for an answer. */
export async function listAgents(): Promise<{ agents: ConnectedAgent[]; requests: AgentPaymentRequest[] }> {
  return (await call('/v1/agents')) as { agents: ConnectedAgent[]; requests: AgentPaymentRequest[] };
}

/**
 * Connects a new agent. The key is returned once and is never stored on the phone.
 * @returns The agent and its key.
 */
export async function connectAgent(input: { name: string; wallet: Address; perTxMon: string; dailyMon: string }) {
  return (await call('/v1/agents', { method: 'POST', body: input })) as { agent: ConnectedAgent; key: string };
}

/** Revokes an agent; its key stops working and its open requests are declined. */
export async function revokeAgent(id: string): Promise<void> {
  await call(`/v1/agents/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** @returns One request, or throws when it is not this user's. */
export async function getAgentRequest(id: string): Promise<AgentPaymentRequest> {
  return (await call(`/v1/requests/${encodeURIComponent(id)}`)) as AgentPaymentRequest;
}

/**
 * Reports the user's answer so the agent can see it. Best effort: a failure
 * leaves the request to expire, which the agent also sees.
 */
export async function answerAgentRequest(id: string, answer: { status: 'declined' } | { status: 'sent'; txHash: Hash }): Promise<void> {
  await call(`/v1/requests/${encodeURIComponent(id)}`, { method: 'POST', body: answer });
}

/**
 * Gives the orb's background service a fresh inbox token so it can post
 * "agent wants to pay" notifications. Rotates the token on every call.
 */
export async function registerInbox(): Promise<void> {
  if (!BubbleOverlay) return;
  const { inboxToken } = (await call('/v1/inbox', { method: 'POST' })) as { inboxToken: string };
  BubbleOverlay.setInbox(config.agentUrl, inboxToken);
}

/** How to connect one client: where it goes and what to paste. */
export type ConnectSetup = { where: string; text: string };

/**
 * Setup for the chosen client, ready to paste.
 * @param clientId Brand id from `AGENT_BRANDS`, or anything else for the generic form.
 * @param key The agent key, shown once.
 * @returns Where to put it and the text.
 */
export function connectSetup(clientId: string, key: string): ConnectSetup {
  const url = `${config.agentUrl}/mcp`;
  const auth = { Authorization: `Bearer ${key}` };
  const json = (v: unknown) => JSON.stringify(v, null, 2);
  switch (clientId) {
    case 'claude':
      return {
        where: 'Run in a terminal (Claude Code)',
        text: `claude mcp add-json orb '${JSON.stringify({ type: 'http', url, headers: auth })}'`,
      };
    case 'codex':
      return {
        where: 'Run in a terminal (Codex CLI)',
        text: `export ORB_AGENT_KEY=${key}\ncodex mcp add orb --url ${url} --bearer-token-env-var ORB_AGENT_KEY`,
      };
    case 'cursor':
      return { where: 'Add to ~/.cursor/mcp.json', text: json({ mcpServers: { orb: { url, headers: auth } } }) };
    case 'gemini':
      return { where: 'Add to ~/.gemini/settings.json (Gemini CLI)', text: json({ mcpServers: { orb: { httpUrl: url, headers: auth } } }) };
    case 'windsurf':
      return {
        where: 'Add to ~/.codeium/windsurf/mcp_config.json',
        text: json({ mcpServers: { orb: { serverUrl: url, headers: auth } } }),
      };
    case 'copilot':
      return { where: 'Add to .vscode/mcp.json (VS Code with Copilot)', text: json({ servers: { orb: { type: 'http', url, headers: auth } } }) };
    default:
      return { where: 'Any MCP client: Streamable HTTP server', text: `URL: ${url}\nHeader: Authorization: Bearer ${key}` };
  }
}
