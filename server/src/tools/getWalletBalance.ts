/**
 * @file `get_wallet_balance`: the user's MON on Monad mainnet and testnet.
 */
import { formatEther } from 'viem';
import { z } from 'zod';
import { CHAIN_IDS, NETWORKS } from '../intent';
import { defineTool } from './tool';

export const getWalletBalance = defineTool({
  name: 'get_wallet_balance',
  description: "Returns the MON balance of the user's own wallet on Monad mainnet (real MON) and testnet. Takes no input.",
  input: z.object({}),
  run: async (ctx) => {
    const balances = await Promise.all(CHAIN_IDS.map((id) => ctx.chains[id].getBalance({ address: ctx.wallet })));
    return {
      address: ctx.wallet,
      ...Object.fromEntries(CHAIN_IDS.map((id, i) => [NETWORKS[id].key, { balanceMon: formatEther(balances[i] as bigint) }])),
    };
  },
});
