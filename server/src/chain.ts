/**
 * @file Read-only Monad testnet access for the agent tools. The server never
 * signs or sends transactions, so only a public client exists here.
 */
import { createPublicClient, http, type PublicClient } from 'viem';
import { MONAD_TESTNET_EXPLORER_URL, MONAD_TESTNET_RPC_URL, monadTestnetChain, type ChainReader } from './intent';

/** Public Monad testnet RPC, used when `MONAD_RPC_URL` is unset. */
export const DEFAULT_RPC_URL = MONAD_TESTNET_RPC_URL;
/** MonadVision explorer base URL. */
const EXPLORER_URL = MONAD_TESTNET_EXPLORER_URL;
/** Per-request limit. A timed-out read is retried up to 3 times (300 ms, 600 ms, 1200 ms). */
const RPC_TIMEOUT_MS = 10_000;

/** Every chain call the tools make. A viem PublicClient satisfies it; tests pass a stub. */
export type ChainClient = ChainReader &
  Pick<PublicClient, 'chain' | 'getTransactionCount' | 'getTransactionReceipt'>;

/**
 * Creates the read-only client. Reads retry on 429/timeouts with exponential backoff.
 * @param rpcUrl Monad testnet JSON-RPC URL.
 * @returns A viem public client pinned to chain 10143.
 */
export function createChainClient(rpcUrl: string): ChainClient {
  const chain = monadTestnetChain(rpcUrl, EXPLORER_URL);
  return createPublicClient({
    chain,
    transport: http(rpcUrl, { retryCount: 3, retryDelay: 300, timeout: RPC_TIMEOUT_MS }),
  });
}

/**
 * Explorer link for a transaction.
 * @param hash Transaction hash.
 * @returns MonadVision tx URL.
 */
export const txUrl = (hash: string): string => `${EXPLORER_URL}/tx/${hash}`;
