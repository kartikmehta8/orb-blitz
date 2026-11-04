/**
 * @file Device-only recipient warnings: address poisoning lookalikes and ENS names that changed address.
 */
import { describe, expect, it } from 'vitest';
import type { Intent } from '../src/intent';
import { isLookalike, withRecipientChecks } from '../src/validateIntent';

const PAID = '0xabcd111111111111111111111111111111115678';
const POISON = '0xAbCd999999999999999999999999999999995678';
const WALLET = '0x2222222222222222222222222222222222222222';

const intent = (to: string, extra: Partial<Intent> = {}) => ({ to, warnings: [], ...extra }) as unknown as Intent;
const history = { known: new Set([PAID]), wallet: WALLET, ensBook: { 'kartik.eth': PAID } };

describe('recipient checks', () => {
  it('flags an address with the same ends but a different middle', () => {
    expect(isLookalike(POISON, PAID)).toBe(true);
    expect(isLookalike(PAID.toUpperCase().replace('0X', '0x'), PAID)).toBe(false);
    expect(withRecipientChecks(intent(POISON), history).warnings).toEqual(['LOOKALIKE_RECIPIENT', 'NEW_RECIPIENT']);
  });

  it('flags a lookalike of your own wallet', () => {
    expect(withRecipientChecks(intent('0x2222000000000000000000000000000000002222'), history).warnings).toContain('LOOKALIKE_RECIPIENT');
  });

  it('flags an ENS name that now resolves somewhere else, and stays quiet for a known one', () => {
    const moved = '0x9999999999999999999999999999999999999999';
    expect(withRecipientChecks(intent(moved, { ensName: 'kartik.eth' }), history).warnings).toEqual([
      'ENS_ADDRESS_CHANGED',
      'NEW_RECIPIENT',
    ]);
    expect(withRecipientChecks(intent(PAID, { ensName: 'kartik.eth' }), history).warnings).toEqual([]);
  });
});
