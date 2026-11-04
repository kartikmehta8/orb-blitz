/**
 * @file `get_wallet_balance`: the MON balance of the user's own wallet.
 */
import { formatEther } from 'viem';
import { z } from 'zod';
import { defineTool } from './tool';

export const getWalletBalance = defineTool({
  name: 'get_wallet_balance',
  description: "Returns the MON balance of the user's own wallet. Takes no input.",
  input: z.object({}),
  run: async (ctx) => {
    const wei = await ctx.chain.getBalance({ address: ctx.wallet });
    return { address: ctx.wallet, balanceMon: formatEther(wei), balanceWei: wei.toString() };
  },
});
