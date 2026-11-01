/**
 * @file Read-only viem client for Monad testnet.
 *
 * Reads retry with exponential backoff (3 tries from 300 ms) for RPC 429s and
 * timeouts. Sends never go through this client and are never retried.
 */
import { createPublicClient, http } from 'viem';
import { config, monadTestnet } from './config';

/** Shared public client for balances, receipts and transfer preparation. */
export const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(config.rpcUrl, { retryCount: 3, retryDelay: 300, timeout: 10_000 }),
});
