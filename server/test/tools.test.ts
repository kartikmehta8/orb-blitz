/**
 * @file `prepare_native_transfer` validation cases, plus the other tools and the dispatcher.
 * All chain calls go to a stub.
 */
import { zeroAddress } from 'viem';
import { describe, expect, it } from 'vitest';
import type { Intent } from '../src/intent';
import { runTool, TOOL_DEFS } from '../src/tools/index';
import { makeCtx, mockChain, OTHER, RECIPIENT, WALLET } from './helpers';

const transfer = (input: Record<string, unknown>, ctx = makeCtx()) =>
  runTool('prepare_native_transfer', { to: RECIPIENT, amount_mon: '0.2', reason: 'dinner', ...input }, ctx);

/** Flips the case of the first hex letter, breaking the EIP-55 checksum. */
const badChecksum = (a: string) => {
  const i = [...a].findIndex((ch, idx) => idx > 1 && /[a-f]/i.test(ch));
  const ch = a[i] as string;
  return a.slice(0, i) + (ch === ch.toLowerCase() ? ch.toUpperCase() : ch.toLowerCase()) + a.slice(i + 1);
};

describe('prepare_native_transfer', () => {
  it('valid EOA transfer → intent with gasLimit 21000', async () => {
    const ctx = makeCtx();
    const out = await transfer({}, ctx);
    expect(out).toMatchObject({ ok: true, intentId: expect.any(String) });
    expect(ctx.intents).toHaveLength(1);
    const intent = ctx.intents[0] as Intent;
    expect(intent).toMatchObject({
      id: out.intentId,
      chainId: 10143,
      to: RECIPIENT,
      amountWei: '200000000000000000',
      gasLimit: '21000',
      maxFeePerGasWei: '100000000000',
      provenance: { source: 'screen', appLabel: 'WhatsApp' },
      recipientIsContract: false,
      parsedBy: 'agent',
    });
    expect(intent.warnings).toEqual([]);
    expect(intent.expiresAt - intent.createdAt).toBe(5 * 60_000);
  });

  it('all-lowercase address is accepted and checksummed', async () => {
    const ctx = makeCtx();
    await transfer({ to: RECIPIENT.toLowerCase() }, ctx);
    expect(ctx.intents[0]?.to).toBe(RECIPIENT);
  });

  it('mixed-case address with a bad checksum → INVALID_ADDRESS', async () => {
    const bad = badChecksum(RECIPIENT);
    const ctx = makeCtx({ context: { source: 'screen', appLabel: 'X', text: `0.2 MON to ${bad}` } });
    expect(await transfer({ to: bad }, ctx)).toMatchObject({ error: 'INVALID_ADDRESS' });
  });

  it.each(['0x1234', 'bob.mon', `${RECIPIENT}00`])('bad address %s → INVALID_ADDRESS', async (to) => {
    expect(await transfer({ to })).toMatchObject({ error: 'INVALID_ADDRESS' });
  });

  it('zero address → ZERO_ADDRESS', async () => {
    expect(await transfer({ to: zeroAddress })).toMatchObject({ error: 'ZERO_ADDRESS' });
  });

  it('address not in context or messages → ADDRESS_NOT_IN_CONTEXT', async () => {
    const ctx = makeCtx();
    expect(await transfer({ to: OTHER }, ctx)).toMatchObject({ error: 'ADDRESS_NOT_IN_CONTEXT' });
    expect(ctx.intents).toHaveLength(0);
  });

  it('address only in a user message → provenance "user"; in both → "both"', async () => {
    const userOnly = makeCtx({ context: null, userTexts: [`send 0.2 MON to ${OTHER}`] });
    await transfer({ to: OTHER }, userOnly);
    expect(userOnly.intents[0]?.provenance).toEqual({ source: 'user' });

    const both = makeCtx({ userTexts: [RECIPIENT.toLowerCase()] });
    await transfer({}, both);
    expect(both.intents[0]?.provenance).toEqual({ source: 'both', appLabel: 'WhatsApp' });
  });

  it.each(['0', '-1', 'abc', '0.0000000000000000001', '1e3', ''])('amount "%s" → INVALID_AMOUNT', async (amount_mon) => {
    expect(await transfer({ amount_mon })).toMatchObject({ error: 'INVALID_AMOUNT' });
  });

  it('over per-tx cap → OVER_TX_LIMIT', async () => {
    expect(await transfer({ amount_mon: '1.5' })).toMatchObject({ error: 'OVER_TX_LIMIT' });
  });

  it('over daily cap → OVER_DAILY_LIMIT', async () => {
    expect(await transfer({}, makeCtx({ dailyRemainingMon: '0.1' }))).toMatchObject({ error: 'OVER_DAILY_LIMIT' });
  });

  it('insufficient balance including gas → INSUFFICIENT_BALANCE with numbers', async () => {
    const ctx = makeCtx({ chain: mockChain({ balance: 200_000_000_000_000_000n }) });
    const out = await transfer({}, ctx);
    expect(out).toMatchObject({ error: 'INSUFFICIENT_BALANCE' });
    expect(out.message).toContain('balance 0.2 MON');
    expect(out.message).toContain('0.2021 MON');
  });

  it('contract recipient uses the Monad 7.5% gas-limit margin', async () => {
    const chain = mockChain({ code: '0x6080', gas: 30_000n });
    const ctx = makeCtx({ chain });
    await transfer({}, ctx);
    // 30_000 * 10_750 / 10_000 = 32_250. Charged on the limit, so the margin is the fee.
    expect(ctx.intents[0]).toMatchObject({ gasLimit: '32250', recipientIsContract: true });
    expect(ctx.intents[0]?.warnings).toContain('RECIPIENT_IS_CONTRACT');
    expect(chain.estimateGas).toHaveBeenCalledOnce();
  });

  it('gas-limit margin rounds up a fractional gas unit', async () => {
    const chain = mockChain({ code: '0x6080', gas: 10_001n });
    const ctx = makeCtx({ chain });
    await transfer({}, ctx);
    // (10_001 * 10_750 + 9_999) / 10_000 = 10_752, not the truncated 10_751.
    expect(ctx.intents[0]?.gasLimit).toBe('10752');
  });

  it('self transfer → SELF_TRANSFER warning', async () => {
    const ctx = makeCtx({ context: { source: 'screen', appLabel: 'Notes', text: `0.2 MON to ${WALLET}` } });
    await transfer({ to: WALLET }, ctx);
    expect(ctx.intents[0]?.warnings).toContain('SELF_TRANSFER');
  });

  it('amount absent from context → AMOUNT_NOT_IN_CONTEXT (soft)', async () => {
    const ctx = makeCtx();
    await transfer({ amount_mon: '0.3' }, ctx);
    expect(ctx.intents[0]?.warnings).toContain('AMOUNT_NOT_IN_CONTEXT');
  });

  it('4th intent in one request → TOO_MANY_INTENTS', async () => {
    const ctx = makeCtx();
    for (let i = 0; i < 3; i++) expect(await transfer({}, ctx)).toMatchObject({ ok: true });
    expect(await transfer({}, ctx)).toMatchObject({ error: 'TOO_MANY_INTENTS' });
    expect(ctx.intents).toHaveLength(3);
    expect(new Set(ctx.intents.map((i) => i.id)).size).toBe(3);
  });

  it('RPC failure → RPC_ERROR, no intent', async () => {
    const ctx = makeCtx({ chain: mockChain({ fail: true }) });
    expect(await transfer({}, ctx)).toMatchObject({ error: 'RPC_ERROR' });
    expect(ctx.intents).toHaveLength(0);
  });

  it('invalid input shape → BAD_TOOL_INPUT', async () => {
    expect(await runTool('prepare_native_transfer', { to: RECIPIENT }, makeCtx())).toMatchObject({ error: 'BAD_TOOL_INPUT' });
    expect(await runTool('prepare_native_transfer', 'nope', makeCtx())).toMatchObject({ error: 'BAD_TOOL_INPUT' });
  });
});

describe('other tools', () => {
  it('unknown tool → BAD_TOOL_INPUT', async () => {
    expect(await runTool('send_transaction', {}, makeCtx())).toMatchObject({ error: 'BAD_TOOL_INPUT' });
  });

  it('get_wallet_balance always uses the request wallet', async () => {
    const ctx = makeCtx();
    expect(await runTool('get_wallet_balance', { address: OTHER }, ctx)).toEqual({
      address: WALLET,
      balanceMon: '10',
      balanceWei: '10000000000000000000',
    });
    expect(ctx.chain.getBalance).toHaveBeenCalledWith({ address: WALLET });
  });

  it('inspect_address returns details or INVALID_ADDRESS', async () => {
    expect(await runTool('inspect_address', { address: RECIPIENT.toLowerCase() }, makeCtx())).toEqual({
      valid: true,
      checksummed: RECIPIENT,
      isContract: false,
      txCount: 7,
      balanceMon: '10',
    });
    expect(await runTool('inspect_address', { address: badChecksum(RECIPIENT) }, makeCtx())).toMatchObject({
      error: 'INVALID_ADDRESS',
    });
  });

  it('get_tx_status: receipt → success, none → pending, bad hash → BAD_TOOL_INPUT', async () => {
    const done = `0x${'1'.repeat(64)}`;
    const pending = `0x${'0'.repeat(64)}`;
    expect(await runTool('get_tx_status', { hash: done }, makeCtx())).toEqual({
      status: 'success',
      blockNumber: '42',
      explorerUrl: `https://testnet.monadvision.com/tx/${done}`,
    });
    expect(await runTool('get_tx_status', { hash: pending }, makeCtx())).toMatchObject({ status: 'pending' });
    expect(await runTool('get_tx_status', { hash: '0x12' }, makeCtx())).toMatchObject({ error: 'BAD_TOOL_INPUT' });
  });

  it('ask_user records a concrete clarification; >4 options rejected', async () => {
    const ctx = makeCtx();
    expect(await runTool('ask_user', { question: 'Which one?', options: [RECIPIENT, 'Rahul'] }, ctx)).toEqual({ ok: true });
    expect(ctx.clarification).toEqual({ question: 'Which one?', options: [RECIPIENT] });
    const tooMany = await runTool('ask_user', { question: 'q', options: ['1', '2', '3', '4', '5'] }, makeCtx());
    expect(tooMany).toMatchObject({ error: 'BAD_TOOL_INPUT' });
  });

  it('ask_user tells the model that chips are concrete addresses or MON amounts', () => {
    const ask = TOOL_DEFS.find((t) => t.name === 'ask_user');
    expect(ask?.description).toContain('full 0x address');
    expect(ask?.description).toContain('Enter a different amount');
  });

  it('exposes five tool definitions with object schemas', () => {
    expect(TOOL_DEFS.map((t) => t.name).sort()).toEqual([
      'ask_user',
      'get_tx_status',
      'get_wallet_balance',
      'inspect_address',
      'prepare_native_transfer',
    ]);
    const prep = TOOL_DEFS.find((t) => t.name === 'prepare_native_transfer');
    expect(prep?.input_schema).toMatchObject({ type: 'object', required: ['to', 'amount_mon', 'reason'] });
  });
});
