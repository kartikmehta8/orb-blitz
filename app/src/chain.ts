/**
 * @file Read-only viem clients: Monad testnet and mainnet for payments, Ethereum mainnet for ENS.
 *
 * Reads retry with exponential backoff (3 tries from 300 ms) for RPC 429s and
 * timeouts. Sends never go through these clients and are never retried.
 */
import { createPublicClient, http, type PublicClient } from 'viem';
import { mainnet } from 'viem/chains';
import { config, monadChains } from './config';
import { MAINNET_CHAIN_ID, TESTNET_CHAIN_ID, type ChainId, type EnsReader } from './intent';

const monadClient = (chainId: ChainId): PublicClient =>
  createPublicClient({
    chain: monadChains[chainId],
    transport: http(config.rpcUrl[chainId], { retryCount: 3, retryDelay: 300, timeout: 10_000 }),
  });

const clients: Record<ChainId, PublicClient> = {
  [TESTNET_CHAIN_ID]: monadClient(TESTNET_CHAIN_ID),
  [MAINNET_CHAIN_ID]: monadClient(MAINNET_CHAIN_ID),
};

/**
 * Shared public client for one network.
 * @param chainId Testnet or mainnet.
 * @returns Its client.
 */
export const clientFor = (chainId: ChainId): PublicClient => clients[chainId];

/** Mainnet client for ENS names and primary names. Never used to send. */
export const ensClient: EnsReader = createPublicClient({
  chain: mainnet,
  transport: http(config.ensRpcUrl, { retryCount: 2, retryDelay: 300, timeout: 10_000 }),
});
