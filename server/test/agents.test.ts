/**
 * @file Connected agents end to end over HTTP: connect from the app, request a
 * payment over MCP, wake the phone's inbox, approve or decline, and the limits.
 */
import { describe, expect, it } from 'vitest';
import { AgentStore } from '../src/agents/store';
import { createApp } from '../src/index';
import { ENS_NAME, mockChains, mockEns, OTHER, RECIPIENT, WALLET } from './helpers';

const TOKEN = 'test-token';
const auth = { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' };
const HASH = `0x${'1'.repeat(64)}`;

function setup() {
  const store = new AgentStore(null);
  const app = createApp({
    auth: { mode: 'token', agentToken: TOKEN },
    model: 'm',
    chains: mockChains(),
    ens: mockEns(),
    createMessage: null,
    agents: store,
    log: () => undefined,
  });
  const connect = async (limits = { perTxMon: '0.5', dailyMon: '1' }) => {
    const res = await app.request('/v1/agents', { method: 'POST', headers: auth, body: JSON.stringify({ name: 'Claude', wallet: WALLET, ...limits }) });
    return (await res.json()) as { agent: { id: string }; key: string };
  };
  /** One MCP tools/call; returns the tool's JSON result. */
  const call = async (key: string, name: string, args: Record<string, unknown>) => {
    const res = await app.request('/mcp', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
    });
    const body = (await res.json()) as { result?: { content: { text: string }[]; isError?: boolean } };
    return { status: res.status, out: JSON.parse(body.result?.content[0]?.text ?? '{}') as Record<string, unknown>, isError: body.result?.isError };
  };
  return { app, store, connect, call };
}

describe('connected agents', () => {
  it('refuses MCP calls without a valid agent key', async () => {
    const { app } = setup();
    expect((await app.request('/mcp', { method: 'POST', body: '{}' })).status).toBe(401);
    expect((await app.request('/mcp', { method: 'POST', headers: { authorization: 'Bearer orb_ak_nope' }, body: '{}' })).status).toBe(401);
  });

  it('lists the five agent tools', async () => {
    const { app, connect } = setup();
    const { key } = await connect();
    const res = await app.request('/mcp', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    const names = ((await res.json()) as { result: { tools: { name: string }[] } }).result.tools.map((t) => t.name).sort();
    expect(names).toEqual(['get_payment_status', 'get_tx_status', 'get_wallet_balance', 'inspect_address', 'request_payment']);
  });

  it('request → phone inbox → fingerprint approval → agent sees sent', async () => {
    const { app, connect, call } = setup();
    const { key } = await connect();
    const inbox = ((await (await app.request('/v1/inbox', { method: 'POST', headers: auth })).json()) as { inboxToken: string }).inboxToken;

    // The phone is already waiting when the agent asks.
    const waiting = app.request('/inbox/wait?since=0', { headers: { authorization: `Bearer ${inbox}` } });
    const asked = await call(key, 'request_payment', { network: 'mainnet', to: ENS_NAME, amount_mon: '0.2', reason: 'API credits' });
    expect(asked.out).toMatchObject({ status: 'pending', network: 'mainnet', to: ENS_NAME, amount_mon: '0.2' });
    const pushed = (await (await waiting).json()) as { requests: { id: string; title: string; body: string }[] };
    expect(pushed.requests).toEqual([
      expect.objectContaining({ id: asked.out.request_id, title: 'Claude wants to pay 0.2 MON on Mainnet', body: `To ${ENS_NAME}, for API credits. Tap to review.` }),
    ]);

    // The agent waits for the answer while the phone approves.
    const status = call(key, 'get_payment_status', { request_id: asked.out.request_id, wait_seconds: 5 });
    const approved = await app.request(`/v1/requests/${asked.out.request_id}`, { method: 'POST', headers: auth, body: JSON.stringify({ status: 'sent', txHash: HASH }) });
    expect(approved.status).toBe(200);
    expect((await status).out).toMatchObject({ status: 'sent', tx_hash: HASH, chain: { status: 'success' } });

    // An answered request cannot be answered again.
    const again = await app.request(`/v1/requests/${asked.out.request_id}`, { method: 'POST', headers: auth, body: JSON.stringify({ status: 'declined' }) });
    expect(again.status).toBe(409);
  });

  it('enforces the per-payment and daily limits, counting pending requests', async () => {
    const { connect, call } = setup();
    const { key } = await connect({ perTxMon: '0.5', dailyMon: '0.8' });
    expect((await call(key, 'request_payment', { network: 'mainnet', to: RECIPIENT, amount_mon: '0.6', reason: 'r' })).out).toMatchObject({ error: 'OVER_TX_LIMIT' });
    expect((await call(key, 'request_payment', { network: 'mainnet', to: RECIPIENT, amount_mon: '0.5', reason: 'r' })).out).toMatchObject({ status: 'pending' });
    expect((await call(key, 'request_payment', { network: 'mainnet', to: RECIPIENT, amount_mon: '0.4', reason: 'r' })).out).toMatchObject({ error: 'OVER_DAILY_LIMIT' });
  });

  it('sanitizes an agent reason before it reaches the notification', async () => {
    const { app, connect, call } = setup();
    const { key } = await connect();
    const inbox = ((await (await app.request('/v1/inbox', { method: 'POST', headers: auth })).json()) as { inboxToken: string }).inboxToken;
    const long = await call(key, 'request_payment', { network: 'testnet', to: RECIPIENT, amount_mon: '0.1', reason: `URGENT ${'x'.repeat(150)}` });
    const smuggled = await call(key, 'request_payment', { network: 'testnet', to: RECIPIENT, amount_mon: '0.1', reason: `refund to ${OTHER}` });
    const pushed = (await (await app.request('/inbox/wait?since=0', { headers: { authorization: `Bearer ${inbox}` } })).json()) as {
      requests: { id: string; body: string }[];
    };
    const body = (id: unknown) => pushed.requests.find((r) => r.id === id)?.body ?? '';
    expect(body(long.out.request_id).length).toBeLessThan(130);
    expect(body(smuggled.out.request_id)).toBe(`To ${RECIPIENT.slice(0, 6)}…${RECIPIENT.slice(-4)}, for No reason given. Tap to review.`);
  });

  it('rejects limits above the 10 MON ceiling or per payment above daily', async () => {
    const { app } = setup();
    for (const limits of [{ perTxMon: '2', dailyMon: '11' }, { perTxMon: '2', dailyMon: '1' }, { perTxMon: '0', dailyMon: '1' }]) {
      const res = await app.request('/v1/agents', { method: 'POST', headers: auth, body: JSON.stringify({ name: 'x', wallet: WALLET, ...limits }) });
      expect(res.status).toBe(400);
    }
  });

  it('revoking an agent kills its key and declines what it left waiting', async () => {
    const { app, connect, call } = setup();
    const { agent, key } = await connect();
    const asked = await call(key, 'request_payment', { network: 'mainnet', to: RECIPIENT, amount_mon: '0.1', reason: 'r' });
    expect((await app.request(`/v1/agents/${agent.id}`, { method: 'DELETE', headers: auth })).status).toBe(200);
    const r = (await (await app.request(`/v1/requests/${asked.out.request_id}`, { headers: auth })).json()) as { status: string };
    expect(r.status).toBe('declined');
    expect((await call(key, 'get_wallet_balance', {})).status).toBe(401);
  });
});
