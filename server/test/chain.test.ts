/**
 * @file Monad chain objects: testnet and mainnet, checked against the public docs,
 * and the rule that a payment's network comes only from the user's words.
 */
import { describe, expect, it } from 'vitest';
import { createChainClient, txUrl } from '../src/chain';
import { MAINNET_CHAIN_ID, monadChain, NETWORKS, networkMentioned, TESTNET_CHAIN_ID } from '../src/intent';

const HASH = `0x${'ab'.repeat(32)}`;

describe('Monad networks', () => {
  it('pins testnet 10143 and mainnet 143, MON (18 decimals), public RPCs and MonadVision', () => {
    expect(monadChain(TESTNET_CHAIN_ID)).toMatchObject({
      id: 10143,
      name: 'Monad Testnet',
      testnet: true,
      nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
      rpcUrls: { default: { http: ['https://testnet-rpc.monad.xyz'] } },
      blockExplorers: { default: { url: 'https://testnet.monadvision.com' } },
    });
    expect(monadChain(MAINNET_CHAIN_ID)).toMatchObject({
      id: 143,
      name: 'Monad Mainnet',
      testnet: false,
      rpcUrls: { default: { http: ['https://rpc.monad.xyz'] } },
      blockExplorers: { default: { url: 'https://monadvision.com' } },
    });
    expect(createChainClient(MAINNET_CHAIN_ID).chain?.id).toBe(143);
    expect(txUrl(HASH, MAINNET_CHAIN_ID)).toBe(`${NETWORKS[143].explorerUrl}/tx/${HASH}`);
  });

  it('reads the network from the newest message that names exactly one', () => {
    expect(networkMentioned(['pay 1 MON to kartik.eth'])).toBeNull();
    expect(networkMentioned(['pay this', 'Mainnet'])).toBe(MAINNET_CHAIN_ID);
    expect(networkMentioned(['send on main-net', 'actually testnet'])).toBe(TESTNET_CHAIN_ID);
    expect(networkMentioned(['mainnet or testnet?'])).toBeNull();
  });
});
