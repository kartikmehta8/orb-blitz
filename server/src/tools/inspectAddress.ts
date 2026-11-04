/**
 * @file `inspect_address`: validity, contract check, tx count and balance of any address.
 */
import { formatEther } from 'viem';
import { z } from 'zod';
import { toChecksumAddress } from '../intent';
import { defineTool, toolError } from './tool';

export const inspectAddress = defineTool({
  name: 'inspect_address',
  description:
    'Checks a 0x address on Monad testnet: whether it is valid, its checksummed form, whether it is a contract, its transaction count and its MON balance.',
  input: z.object({ address: z.string().max(100).describe('The 0x address exactly as it appears.') }),
  run: async (ctx, { address }) => {
    const checksummed = toChecksumAddress(address);
    if (!checksummed) return toolError('INVALID_ADDRESS', 'That is not a valid 0x address.');
    const [code, txCount, balance] = await Promise.all([
      ctx.chain.getCode({ address: checksummed }),
      ctx.chain.getTransactionCount({ address: checksummed }),
      ctx.chain.getBalance({ address: checksummed }),
    ]);
    return { valid: true, checksummed, isContract: !!code && code !== '0x', txCount, balanceMon: formatEther(balance) };
  },
});
