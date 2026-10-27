/**
 * @file Runtime configuration from `EXPO_PUBLIC_*` env vars plus chain constants.
 *
 * `EXPO_PUBLIC_*` values are inlined into the JS bundle at build time, so they
 * are public. `agentToken` is demo-grade auth only (see README).
 */
import { defineChain } from 'viem';
import { monadTestnet as viemMonadTestnet } from 'viem/chains';
import { CHAIN_ID } from './intent';

const env = process.env;

export const config = {
  privyAppId: env.EXPO_PUBLIC_PRIVY_APP_ID ?? '',
  privyClientId: env.EXPO_PUBLIC_PRIVY_CLIENT_ID ?? '',
  /** Agent server base URL, no trailing slash. */
  agentUrl: (env.EXPO_PUBLIC_AGENT_URL ?? '').replace(/\/+$/, ''),
  agentToken: env.EXPO_PUBLIC_AGENT_TOKEN ?? '',
  rpcUrl: env.EXPO_PUBLIC_MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz',
  explorerUrl: (env.EXPO_PUBLIC_EXPLORER_URL || 'https://testnet.monadvision.com').replace(/\/+$/, ''),
  faucetUrl: 'https://faucet.monad.xyz',
} as const;

/** Monad testnet with this app's RPC and explorer. */
export const monadTestnet = defineChain({
  ...viemMonadTestnet,
  id: CHAIN_ID,
  rpcUrls: { default: { http: [config.rpcUrl] } },
  blockExplorers: { default: { name: 'MonadVision', url: config.explorerUrl } },
});

/** Default and hard-maximum spend caps, in MON. */
export const LIMIT_DEFAULTS = { perTxMon: '1', dailyMon: '5', hardMaxMon: '10' } as const;

/**
 * Explorer URL for a transaction.
 * @param hash Transaction hash.
 * @returns MonadVision tx page.
 */
export const txUrl = (hash: string): string => `${config.explorerUrl}/tx/${hash}`;

/**
 * Explorer URL for an address.
 * @param address Account address.
 * @returns MonadVision address page.
 */
export const addressUrl = (address: string): string => `${config.explorerUrl}/address/${address}`;
