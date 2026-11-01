/**
 * @file Monad testnet chain object: one definition, checked against the public docs.
 */
import { describe, expect, it } from 'vitest';
import { createChainClient, DEFAULT_RPC_URL, txUrl } from '../src/chain';
import { MONAD_TESTNET_EXPLORER_URL, MONAD_TESTNET_RPC_URL, monadTestnetChain } from '../src/intent';

const HASH = `0x${'ab'.repeat(32)}`;

describe('createChainClient', () => {
  it('pins chain 10143, MON (18 decimals), the public RPC and MonadVision', () => {
    const defined = monadTestnetChain(MONAD_TESTNET_RPC_URL, MONAD_TESTNET_EXPLORER_URL);
    expect(defined).toMatchObject({
      id: 10143,
      name: 'Monad Testnet',
      testnet: true,
      nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
      rpcUrls: { default: { http: [MONAD_TESTNET_RPC_URL] } },
      blockExplorers: { default: { name: 'MonadVision', url: MONAD_TESTNET_EXPLORER_URL } },
    });
    expect(DEFAULT_RPC_URL).toBe(MONAD_TESTNET_RPC_URL);
    expect(createChainClient(DEFAULT_RPC_URL).chain).toMatchObject({
      id: defined.id,
      nativeCurrency: defined.nativeCurrency,
      blockExplorers: defined.blockExplorers,
    });
    expect(txUrl(HASH)).toBe(`${MONAD_TESTNET_EXPLORER_URL}/tx/${HASH}`);
  });
});
