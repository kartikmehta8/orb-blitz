/**
 * @file Read-only Monad testnet access for the agent tools. The server never
 * signs or sends transactions, so only a public client exists here.
 */
import { createPublicClient, defineChain, http, type PublicClient } from 'viem';
import { monadTestnet } from 'viem/chains';
import { CHAIN_ID, type ChainReader } from './intent';

/** Public Monad testnet RPC, used when `MONAD_RPC_URL` is unset. */
export const DEFAULT_RPC_URL = 'https://testnet-rpc.monad.xyz';
/** MonadVision explorer base URL. */
const EXPLORER_URL = 'https://testnet.monadvision.com';

/** Every chain call the tools make. A viem PublicClient satisfies it; tests pass a stub. */
export type ChainClient = ChainReader & Pick<PublicClient, 'getTransactionCount' | 'getTransactionReceipt'>;

/**
 * Creates the read-only client. Reads retry on 429/timeouts with exponential backoff.
 * @param rpcUrl Monad testnet JSON-RPC URL.
 * @returns A viem public client pinned to chain 10143.
 */
export function createChainClient(rpcUrl: string): ChainClient {
  const chain = defineChain({ ...monadTestnet, id: CHAIN_ID, rpcUrls: { default: { http: [rpcUrl] } } });
  // ponytail: viem's built-in exponential backoff (300, 600, 1200 ms) is enough for 3 read retries.
  return createPublicClient({ chain, transport: http(rpcUrl, { retryCount: 3, retryDelay: 300 }) });
}

/**
 * Explorer link for a transaction.
 * @param hash Transaction hash.
 * @returns MonadVision tx URL.
 */
export const txUrl = (hash: string): string => `${EXPLORER_URL}/tx/${hash}`;
