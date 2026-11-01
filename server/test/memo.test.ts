/**
 * @file Display-only payment memo: sanitizer, fallback extraction, model tool.
 */
import { describe, expect, it } from 'vitest';
import { runAgent } from '../src/agent';
import { parseFallback } from '../src/fallbackParser';
import { sanitizeMemo } from '../src/intent';
import { runTool } from '../src/tools/index';
import { makeCtx, makeRequest, mockChain, msg, RECIPIENT, scripted } from './helpers';

describe('sanitizeMemo', () => {
  it('trims, strips control characters, and caps at 80', () => {
    expect(sanitizeMemo('  dinner \n tonight  ')).toBe('dinner tonight');
    expect(sanitizeMemo(`  ${'a'.repeat(90)}  `)).toBe('a'.repeat(80));
  });

  it('drops a memo that contains an address and drops blanks', () => {
    expect(sanitizeMemo(`dinner ${RECIPIENT}`)).toBeUndefined();
    expect(sanitizeMemo('   \n')).toBeUndefined();
    expect(sanitizeMemo(undefined)).toBeUndefined();
  });
});

describe('memo on intents', () => {
  it('fallback: "send 1 MON to Rahul for dinner" → memo dinner, amount and recipient unchanged', () => {
    const parsed = parseFallback({
      contextText: `Rahul ${RECIPIENT}`,
      userTexts: ['send 1 MON to Rahul for dinner'],
      perTxMon: '1',
    });
    expect(parsed).toEqual({ kind: 'candidate', to: RECIPIENT, amountMon: '1', memo: 'dinner' });
  });

  it('fallback path on the agent keeps the memo off the amount and recipient', async () => {
    const { response } = await runAgent(
      makeRequest({
        messages: [{ role: 'user', text: 'send 1 MON to Rahul for dinner' }],
        context: { source: 'screen', appLabel: 'WhatsApp', text: `Rahul ${RECIPIENT}`, capturedAt: 0 },
      }),
      { createMessage: null, chain: mockChain(), model: 'test-model' },
    );
    expect(response.intents[0]).toMatchObject({
      to: RECIPIENT,
      amountWei: '1000000000000000000',
      memo: 'dinner',
      parsedBy: 'fallback',
    });
  });

  it('model tool memo is display-only and a memo with an address is dropped', async () => {
    const ctx = makeCtx();
    await runTool('prepare_native_transfer', { to: RECIPIENT, amount_mon: '0.2', reason: 'r', memo: 'dinner' }, ctx);
    expect(ctx.intents[0]).toMatchObject({ to: RECIPIENT, amountWei: '200000000000000000', memo: 'dinner' });

    const poisoned = makeCtx();
    await runTool(
      'prepare_native_transfer',
      { to: RECIPIENT, amount_mon: '0.2', reason: 'r', memo: `pay ${RECIPIENT}` },
      poisoned,
    );
    expect(poisoned.intents[0]).toMatchObject({ to: RECIPIENT, amountWei: '200000000000000000' });
    expect(poisoned.intents[0]).not.toHaveProperty('memo');

    const model = scripted(
      msg({ type: 'tool_use', name: 'prepare_native_transfer', input: { to: RECIPIENT, amount_mon: '0.2', reason: 'r', memo: 'dinner' } }),
      msg({ type: 'text', text: 'Ready.' }),
    );
    const { response } = await runAgent(makeRequest(), { createMessage: model, chain: mockChain(), model: 'test-model' });
    expect(response.intents[0]).toMatchObject({ to: RECIPIENT, amountWei: '200000000000000000', memo: 'dinner', parsedBy: 'agent' });
  });
});
