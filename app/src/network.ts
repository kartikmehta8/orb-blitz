/**
 * @file Which Monad network the Wallet screen shows: balance, faucet and address links.
 *
 * Display only. A payment's network always comes from what the user said
 * ("mainnet" or "testnet"); this preference never picks it.
 */
import { useEffect, useState } from 'react';
import { MAINNET_CHAIN_ID, TESTNET_CHAIN_ID, isChainId, type ChainId } from './intent';
import { readJson, writeJson } from './storage';

const KEY = 'viewNetwork:v1';

let cached: ChainId | null = null;
const listeners = new Set<(id: ChainId) => void>();

/** @returns The saved network, testnet until the user switches. */
export async function getViewNetwork(): Promise<ChainId> {
  if (cached === null) cached = (await readJson(KEY, isChainId).catch(() => null)) ?? TESTNET_CHAIN_ID;
  return cached;
}

/**
 * The network the Wallet screen shows, kept in sync across screens.
 * @returns The chain id and a toggle between mainnet and testnet.
 */
export function useViewNetwork(): [ChainId, () => void] {
  const [chainId, setChainId] = useState<ChainId>(cached ?? TESTNET_CHAIN_ID);
  useEffect(() => {
    void getViewNetwork().then(setChainId);
    listeners.add(setChainId);
    return () => void listeners.delete(setChainId);
  }, []);
  const toggle = () => {
    const next = chainId === MAINNET_CHAIN_ID ? TESTNET_CHAIN_ID : MAINNET_CHAIN_ID;
    cached = next;
    listeners.forEach((l) => l(next));
    void writeJson(KEY, next);
  };
  return [chainId, toggle];
}
