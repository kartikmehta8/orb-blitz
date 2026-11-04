/**
 * @file Runtime configuration from `EXPO_PUBLIC_*` env vars plus chain constants.
 *
 * `EXPO_PUBLIC_*` values are inlined into the JS bundle at build time, so they
 * are public. The agent call uses the Privy access token from the SDK, which
 * is not an env var and is not stored here.
 */
import { ENS_RPC_URL, MAINNET_CHAIN_ID, monadChain, NETWORKS, TESTNET_CHAIN_ID, type ChainId } from './intent';

const env = process.env;

export const config = {
  privyAppId: env.EXPO_PUBLIC_PRIVY_APP_ID ?? '',
  privyClientId: env.EXPO_PUBLIC_PRIVY_CLIENT_ID ?? '',
  /** Agent server base URL, no trailing slash. */
  agentUrl: (env.EXPO_PUBLIC_AGENT_URL ?? '').replace(/\/+$/, ''),
  /** Per-network RPC; env overrides the public endpoints. */
  rpcUrl: {
    [TESTNET_CHAIN_ID]: env.EXPO_PUBLIC_MONAD_RPC_URL || NETWORKS[TESTNET_CHAIN_ID].rpcUrl,
    [MAINNET_CHAIN_ID]: env.EXPO_PUBLIC_MONAD_MAINNET_RPC_URL || NETWORKS[MAINNET_CHAIN_ID].rpcUrl,
  } as Record<ChainId, string>,
  /** Ethereum mainnet RPC for ENS lookups. Names live on L1; payments stay on Monad. */
  ensRpcUrl: env.EXPO_PUBLIC_ENS_RPC_URL || ENS_RPC_URL,
  /** Testnet only: mainnet MON is real and has no faucet. */
  faucetUrl: 'https://faucet.monad.xyz',
} as const;

/** viem chain definitions with this app's RPCs. */
export const monadChains: Record<ChainId, ReturnType<typeof monadChain>> = {
  [TESTNET_CHAIN_ID]: monadChain(TESTNET_CHAIN_ID, config.rpcUrl[TESTNET_CHAIN_ID]),
  [MAINNET_CHAIN_ID]: monadChain(MAINNET_CHAIN_ID, config.rpcUrl[MAINNET_CHAIN_ID]),
};

/** Default and hard-maximum spend caps, in MON. They apply to both networks combined. */
export const LIMIT_DEFAULTS = { perTxMon: '1', dailyMon: '5', hardMaxMon: '10' } as const;

/**
 * Explorer URL for a transaction.
 * @param hash Transaction hash.
 * @param chainId Network it was sent on (default testnet, for records saved before mainnet existed).
 * @returns MonadVision tx page.
 */
export const txUrl = (hash: string, chainId: ChainId = TESTNET_CHAIN_ID): string => `${NETWORKS[chainId].explorerUrl}/tx/${hash}`;

/**
 * Explorer URL for an address.
 * @param address Account address.
 * @param chainId Network to show.
 * @returns MonadVision address page.
 */
export const addressUrl = (address: string, chainId: ChainId = TESTNET_CHAIN_ID): string => `${NETWORKS[chainId].explorerUrl}/address/${address}`;

/** Testnet chain object for screens that have not picked a network yet. */
export const monadTestnet = monadChains[TESTNET_CHAIN_ID];
