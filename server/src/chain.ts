/**
 * @file Read-only access to Monad testnet and mainnet for the agent tools, and
 * to Ethereum mainnet for ENS. The server never signs or sends transactions,
 * so only public clients exist here.
 */
import { createPublicClient, http, type PublicClient } from 'viem';
import { mainnet } from 'viem/chains';
import {
  ENS_RPC_URL,
  MAINNET_CHAIN_ID,
  monadChain,
  NETWORKS,
  TESTNET_CHAIN_ID,
  type ChainId,
  type ChainReader,
  type EnsReader,
} from './intent';

/** Per-request limit. A timed-out read is retried up to 3 times (300 ms, 600 ms, 1200 ms). */
const RPC_TIMEOUT_MS = 10_000;

/** Every chain call the tools make. A viem PublicClient satisfies it; tests pass a stub. */
export type ChainClient = ChainReader & Pick<PublicClient, 'chain' | 'getTransactionCount' | 'getTransactionReceipt'>;

/** One client per Monad network. */
export type ChainClients = Record<ChainId, ChainClient>;

/**
 * Creates one read-only client. Reads retry on 429/timeouts with exponential backoff.
 * @param chainId Testnet or mainnet.
 * @param rpcUrl JSON-RPC URL (default: the public one).
 * @returns A viem public client pinned to that chain.
 */
export function createChainClient(chainId: ChainId, rpcUrl = NETWORKS[chainId].rpcUrl): ChainClient {
  return createPublicClient({
    chain: monadChain(chainId, rpcUrl),
    transport: http(rpcUrl, { retryCount: 3, retryDelay: 300, timeout: RPC_TIMEOUT_MS }),
  });
}

/**
 * Clients for both networks.
 * @param env `MONAD_RPC_URL` (testnet) and `MONAD_MAINNET_RPC_URL` override the public RPCs.
 * @returns Testnet and mainnet clients.
 */
export function createChainClients(env: Record<string, string | undefined>): ChainClients {
  return {
    [TESTNET_CHAIN_ID]: createChainClient(TESTNET_CHAIN_ID, env.MONAD_RPC_URL || undefined),
    [MAINNET_CHAIN_ID]: createChainClient(MAINNET_CHAIN_ID, env.MONAD_MAINNET_RPC_URL || undefined),
  };
}

/** Public mainnet RPC for ENS reads, used when `ENS_RPC_URL` is unset. */
export const DEFAULT_ENS_RPC_URL = ENS_RPC_URL;

/**
 * Read-only Ethereum mainnet client for ENS (names live on L1; payments stay on Monad).
 * @param rpcUrl Mainnet JSON-RPC URL.
 * @returns A client that resolves names and primary names.
 */
export function createEnsClient(rpcUrl: string): EnsReader {
  return createPublicClient({ chain: mainnet, transport: http(rpcUrl, { retryCount: 2, retryDelay: 300, timeout: RPC_TIMEOUT_MS }) });
}

/**
 * Explorer link for a transaction.
 * @param hash Transaction hash.
 * @param chainId Network it was sent on.
 * @returns MonadVision tx URL.
 */
export const txUrl = (hash: string, chainId: ChainId): string => `${NETWORKS[chainId].explorerUrl}/tx/${hash}`;
