/**
 * @file Scam Shield: the regex floor and how a reported level merges with it.
 */
import { describe, expect, it } from 'vitest';
import { levelForSignals, mergeAssessment, paymentLevel, scanText, screenAssessment } from '../src/risk';
import { RECIPIENT } from './helpers';

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
