/**
 * @file Scam Shield and ENS: the regex floor, level merging, ENS payments and the tools that expose them.
 */
import { describe, expect, it } from 'vitest';
import { runAgent } from '../src/agent';
import { sanitizeClarification } from '../src/clarification';
import { parseFallback } from '../src/fallbackParser';
import type { Intent } from '../src/intent';
import { levelForSignals, mergeAssessment, paymentLevel, scanText, screenAssessment } from '../src/risk';
import { runTool } from '../src/tools/index';
import { ENS_NAME, makeCtx, makeRequest, mockChains, mockEns, msg, OTHER, RECIPIENT, scripted } from './helpers';

const screen = (text: string) => ({ source: 'screen' as const, appLabel: 'WhatsApp', text });

describe('scanText floor', () => {
  it('flags requests for secrets, not bank SMS that warn about them', () => {
    expect(scanText('Please share the OTP you received to verify your account')).toContain('CREDENTIAL_REQUEST');
    expect(scanText('Your OTP is 482113 for txn of Rs 500. Do not share it with anyone.')).toEqual([]);
    expect(scanText('Never share your seed phrase')).toEqual([]);
  });

  it('flags the classic fake-support script as a likely scam', () => {
    const text =
      'Dear customer, your account will be blocked today. Our customer care team will help. Install AnyDesk and pay Rs 10 processing fee to receive your refund.';
    const signals = scanText(text);
    expect(signals).toEqual(['REMOTE_ACCESS', 'PAY_TO_RECEIVE', 'URGENCY', 'IMPERSONATION']);
    expect(levelForSignals(signals)).toBe('scam');
  });

  it('leaves an ordinary payment chat alone', () => {
    expect(scanText(`dinner was 0.2 MON, send to ${RECIPIENT}`)).toEqual([]);
  });
});

describe('level merging', () => {
  it('lets a model raise the level but never lower it below the floor', () => {
    expect(mergeAssessment(['REMOTE_ACCESS', 'URGENCY'], { level: 'safe', signals: [] })).toEqual({
      level: 'scam',
      signals: ['REMOTE_ACCESS', 'URGENCY'],
    });
    expect(mergeAssessment([], { level: 'scam', signals: [] }).level).toBe('scam');
  });

  it('only shows a verdict when asked, paying, assessed or something looks wrong', () => {
    const base = { contextText: 'lunch tomorrow?', reported: null, hasIntents: false };
    expect(screenAssessment({ ...base, lastUserText: 'my balance' })).toBeNull();
    expect(screenAssessment({ ...base, lastUserText: 'is this safe?' })).toEqual({ level: 'safe', signals: [] });
    expect(screenAssessment({ ...base, contextText: 'You have won a lottery! Act now', lastUserText: 'my balance' })?.level).toBe(
      'caution',
    );
  });

  it('labels payments: lookalike is a scam, contract is caution, new recipient alone is safe', () => {
    expect(paymentLevel(['LOOKALIKE_RECIPIENT'], null)).toBe('scam');
    expect(paymentLevel(['RECIPIENT_IS_CONTRACT'], null)).toBe('caution');
    expect(paymentLevel(['NEW_RECIPIENT', 'ENS_NOT_PRIMARY'], null)).toBe('safe');
    expect(paymentLevel(['NEW_RECIPIENT'], { level: 'scam', signals: ['PAY_TO_RECEIVE'] })).toBe('scam');
  });
});

describe('ENS payments', () => {
  const pay = (to: string, text: string, ens = mockEns()) => {
    const ctx = makeCtx({ ens, context: screen(text) });
    return runTool('prepare_native_transfer', { to, amount_mon: '0.2', reason: 'r' }, ctx).then((out) => ({ out, ctx }));
  };

  it('resolves a name on screen and pays its address', async () => {
    const { out, ctx } = await pay('Kartik.ETH', `0.2 MON to ${ENS_NAME} for dinner`);
    expect(out).toMatchObject({ ok: true });
    expect(ctx.intents[0]).toMatchObject({ to: RECIPIENT, ensName: ENS_NAME, primaryName: ENS_NAME });
    expect((ctx.intents[0] as Intent).warnings).toEqual([]);
  });

  it('warns when the name is not the primary name of its address', async () => {
    const { ctx } = await pay(ENS_NAME, `pay ${ENS_NAME}`, mockEns(undefined, {}));
    expect((ctx.intents[0] as Intent).warnings).toContain('ENS_NOT_PRIMARY');
  });

  it('refuses names that are not on screen, are part of a longer name, or have no address', async () => {
    expect((await pay(ENS_NAME, 'nothing here')).out).toMatchObject({ error: 'ADDRESS_NOT_IN_CONTEXT' });
    expect((await pay(ENS_NAME, 'pay.kartik.eth please')).out).toMatchObject({ error: 'ADDRESS_NOT_IN_CONTEXT' });
    expect((await pay('ghost.eth', 'send to ghost.eth')).out).toMatchObject({ error: 'ENS_NOT_FOUND' });
  });

  it('inspect_address resolves names and says whether they are primary', async () => {
    expect(await runTool('inspect_address', { address: ENS_NAME }, makeCtx())).toMatchObject({
      checksummed: RECIPIENT,
      ensName: ENS_NAME,
      nameIsPrimary: true,
    });
  });

  it('offline parser and clarification chips accept names that appear on screen', () => {
    expect(parseFallback({ contextText: `0.2 MON to ${ENS_NAME}`, userTexts: ['pay this on testnet'], perTxMon: '1' })).toMatchObject({
      kind: 'candidate',
      to: ENS_NAME,
    });
    const c = sanitizeClarification({
      question: 'Which one?',
      options: [ENS_NAME, 'invented.eth', OTHER],
      perTxMon: '1',
      dailyRemainingMon: '5',
      contextText: `${ENS_NAME} or ${OTHER}`,
      userTexts: [],
    });
    expect(c.options).toEqual([ENS_NAME, OTHER]);
  });
});

describe('assess_screen in the agent loop', () => {
  it('returns the merged verdict; a model "safe" cannot hide a scam script', async () => {
    const model = scripted(
      msg({ type: 'tool_use', name: 'assess_screen', input: { verdict: 'safe', signals: [] } }),
      msg({ type: 'text', text: 'This looks like a scam.' }),
    );
    const req = makeRequest({
      messages: [{ role: 'user', text: 'is this safe?' }],
      context: { ...screen('Share the OTP you received and install AnyDesk now'), capturedAt: 0 },
    });
    const { response } = await runAgent(req, { createMessage: model, chains: mockChains(), ens: mockEns(), model: 'm' });
    expect(response.assessment).toEqual({ level: 'scam', signals: ['CREDENTIAL_REQUEST', 'REMOTE_ACCESS'] });
  });

  it('fallback still assesses the screen when asked', async () => {
    const req = makeRequest({
      messages: [{ role: 'user', text: 'is this legit?' }],
      context: { ...screen('Congratulations, you have won a lottery! Pay the release fee to claim your prize.'), capturedAt: 0 },
    });
    const { response } = await runAgent(req, { createMessage: null, chains: mockChains(), ens: mockEns(), model: 'm' });
    expect(response.assessment?.level).toBe('scam');
  });
});
