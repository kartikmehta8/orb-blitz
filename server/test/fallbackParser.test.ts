/**
 * @file Offline fallback parser cases.
 */
import { describe, expect, it } from 'vitest';
import { LABEL_RADIUS, parseFallback } from '../src/fallbackParser';
import { OTHER, RECIPIENT } from './helpers';

const parse = (contextText: string | null, ...userTexts: string[]) =>
  parseFallback({ contextText, userTexts: userTexts.length ? userTexts : ['pay this on testnet'], perTxMon: '1' });

describe('parseFallback', () => {
  it('asks for the network when the user has not named one', () => {
    expect(parse(`dinner was 2 MON, send to ${RECIPIENT}`, 'pay this')).toEqual({
      kind: 'clarify',
      question: 'Monad mainnet (real MON) or testnet?',
      options: ['Mainnet', 'Testnet'],
    });
    expect(parse(`2 MON to ${RECIPIENT}`, 'pay this', 'Mainnet')).toMatchObject({ kind: 'candidate', chainId: 143 });
  });

  it('1 address + 1 amount → candidate', () => {
    expect(parse(`dinner was 2 MON, send to ${RECIPIENT}`)).toEqual({ kind: 'candidate', chainId: 10143, to: RECIPIENT, amountMon: '2' });
  });

  it('no payment request from the user → never a candidate (screen alone cannot trigger a payment)', () => {
    const r = parse(`dinner was 2 MON, send to ${RECIPIENT}`, "what's my balance?");
    expect(r).toMatchObject({ kind: 'clarify', options: [] });
  });

  it('2 addresses → clarification with both options', () => {
    const r = parse(`2 MON to ${RECIPIENT} or ${OTHER}`);
    expect(r).toEqual({ kind: 'clarify', question: 'I see 2 recipients. Which one?', options: [RECIPIENT, OTHER] });
  });

  it('labels an address with the name on the same line', () => {
    const r = parse(`Rahul ${RECIPIENT}\nPriya ${OTHER}`);
    expect(r).toEqual({
      kind: 'clarify',
      question: 'I see 2 recipients. Which one?',
      options: [RECIPIENT, OTHER],
      labels: ['Rahul', 'Priya'],
    });
  });

  it('label is null when the name is not next to that address', () => {
    const r = parse(`Rahul\n${RECIPIENT}\n${OTHER}`);
    expect(r).toEqual({
      kind: 'clarify',
      question: 'I see 2 recipients. Which one?',
      options: [RECIPIENT, OTHER],
    });
    expect(r).not.toHaveProperty('labels');
  });

  it('ignores a name farther than the adjacency window on the same line', () => {
    // The name ends just outside the same-line window checked beside the address.
    const r = parse(`Rahul${' '.repeat(LABEL_RADIUS)}${RECIPIENT} Priya ${OTHER}`);
    expect(r).toMatchObject({ options: [RECIPIENT, OTHER], labels: [null, 'Priya'] });
  });

  it('rejects a name longer than the label cap and a label that contains an address', () => {
    const huge = `A${'a'.repeat(40)}`;
    const r = parse(`${huge} ${RECIPIENT}\nPriya ${OTHER}`);
    expect(r).toMatchObject({ options: [RECIPIENT, OTHER], labels: [null, 'Priya'] });
  });

  it('amount chips carry no labels', () => {
    const r = parse(`Rahul ${RECIPIENT}`);
    expect(r).toMatchObject({ kind: 'clarify', question: 'How much MON should I send?', options: ['0.1 MON', '0.5 MON', '1 MON'] });
    expect(r).not.toHaveProperty('labels');
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
    expect(parse(`${amount} MON to ${RECIPIENT}`)).toEqual({ kind: 'candidate', chainId: 10143, to: RECIPIENT, amountMon: amount });
  });

  it('19 decimals → no amount match', () => {
    expect(parse(`0.0000000000000000001 MON to ${RECIPIENT}`).kind).toBe('clarify');
  });

  it('uppercase hex address is matched', () => {
    const upper = `0x${RECIPIENT.slice(2).toUpperCase()}`;
    expect(parse(`1 MON to ${upper}`)).toEqual({ kind: 'candidate', chainId: 10143, to: upper, amountMon: '1' });
  });

  it('zero-width character inside the address is stripped', () => {
    const split = `${RECIPIENT.slice(0, 20)}​${RECIPIENT.slice(20)}`;
    expect(parse(`1 MON to ${split}`)).toEqual({ kind: 'candidate', chainId: 10143, to: RECIPIENT, amountMon: '1' });
  });

  it('a tapped chip in the newest user message resolves screen ambiguity', () => {
    const r = parse(`2 MON to ${RECIPIENT} or ${OTHER}`, 'pay this on testnet', OTHER);
    expect(r).toEqual({ kind: 'candidate', chainId: 10143, to: OTHER, amountMon: '2' });
  });

  it('no address → asks for one', () => {
    expect(parse('dinner was 2 MON').kind).toBe('clarify');
  });

  it('default amount chips stay within the per-tx cap', () => {
    const r = parseFallback({ contextText: `send to ${RECIPIENT}`, userTexts: ['pay this'], perTxMon: '0.5' });
    expect(r).toEqual({ kind: 'clarify', question: 'How much MON should I send?', options: ['0.1 MON', '0.5 MON'] });
  });
});
