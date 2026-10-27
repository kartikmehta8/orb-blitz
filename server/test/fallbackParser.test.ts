/**
 * @file Spec §12.1 fallback parser cases.
 */
import { describe, expect, it } from 'vitest';
import { parseFallback } from '../src/fallbackParser';
import { OTHER, RECIPIENT } from './helpers';

const parse = (contextText: string | null, ...userTexts: string[]) =>
  parseFallback({ contextText, userTexts: userTexts.length ? userTexts : ['pay this'], perTxMon: '1' });

describe('parseFallback', () => {
  it('1 address + 1 amount → candidate', () => {
    expect(parse(`dinner was 2 MON, send to ${RECIPIENT}`)).toEqual({ kind: 'candidate', to: RECIPIENT, amountMon: '2' });
  });

  it('no payment request from the user → never a candidate (screen alone cannot trigger a payment)', () => {
    const r = parse(`dinner was 2 MON, send to ${RECIPIENT}`, "what's my balance?");
    expect(r).toMatchObject({ kind: 'clarify', options: [] });
  });

  it('2 addresses → clarification with both options', () => {
    const r = parse(`2 MON to ${RECIPIENT} or ${OTHER}`);
    expect(r).toEqual({ kind: 'clarify', question: 'I see 2 addresses. Which one?', options: [RECIPIENT, OTHER] });
  });

  it('same address twice in different case counts once', () => {
    expect(parse(`2 MON to ${RECIPIENT} (${RECIPIENT.toLowerCase()})`).kind).toBe('candidate');
  });

  it('amount without "MON" → no amount, asks how much', () => {
    const r = parse(`send 2 to ${RECIPIENT}`);
    expect(r).toMatchObject({ kind: 'clarify', question: 'How much MON should I send?' });
  });

  it('fiat amount → asks for MON', () => {
    expect(parse(`send ₹200 to ${RECIPIENT}`)).toMatchObject({ question: 'I can only send MON on testnet. How much MON?' });
  });

  it.each(['2.5', '0.000000000000000001'])('%s MON is a valid amount', (amount) => {
    expect(parse(`${amount} MON to ${RECIPIENT}`)).toEqual({ kind: 'candidate', to: RECIPIENT, amountMon: amount });
  });

  it('19 decimals → no amount match', () => {
    expect(parse(`0.0000000000000000001 MON to ${RECIPIENT}`).kind).toBe('clarify');
  });

  it('uppercase hex address is matched', () => {
    const upper = `0x${RECIPIENT.slice(2).toUpperCase()}`;
    expect(parse(`1 MON to ${upper}`)).toEqual({ kind: 'candidate', to: upper, amountMon: '1' });
  });

  it('zero-width character inside the address is stripped', () => {
    const split = `${RECIPIENT.slice(0, 20)}​${RECIPIENT.slice(20)}`;
    expect(parse(`1 MON to ${split}`)).toEqual({ kind: 'candidate', to: RECIPIENT, amountMon: '1' });
  });

  it('a tapped chip in the newest user message resolves screen ambiguity', () => {
    const r = parse(`2 MON to ${RECIPIENT} or ${OTHER}`, 'pay this', OTHER);
    expect(r).toEqual({ kind: 'candidate', to: OTHER, amountMon: '2' });
  });

  it('no address → asks for one', () => {
    expect(parse('dinner was 2 MON').kind).toBe('clarify');
  });
});
