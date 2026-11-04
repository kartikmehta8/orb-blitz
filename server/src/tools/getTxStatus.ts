/**
 * @file `get_tx_status`: receipt lookup for a transaction on mainnet or testnet.
 */
import { TransactionReceiptNotFoundError } from 'viem';
import { z } from 'zod';
import { txUrl } from '../chain';
import { MAINNET_CHAIN_ID, TESTNET_CHAIN_ID } from '../intent';
import { defineTool } from './tool';

export const getTxStatus = defineTool({
  name: 'get_tx_status',
  description: 'Looks up a Monad transaction by hash on mainnet or testnet: success, reverted, or pending.',
  input: z.object({
    hash: z.templateLiteral(['0x', z.string().regex(/^[0-9a-fA-F]{64}$/)]).describe('32-byte tx hash.'),
    network: z.enum(['mainnet', 'testnet']).describe('Network the transaction was sent on.'),
  }),
  run: async (ctx, { hash, network }) => {
    const chainId = network === 'mainnet' ? MAINNET_CHAIN_ID : TESTNET_CHAIN_ID;
    try {
      const receipt = await ctx.chains[chainId].getTransactionReceipt({ hash });
      return { status: receipt.status, blockNumber: receipt.blockNumber.toString(), explorerUrl: txUrl(hash, chainId) };
    } catch (e) {
      if (e instanceof TransactionReceiptNotFoundError) return { status: 'pending', explorerUrl: txUrl(hash, chainId) };
      throw e;
    }
  },
});
