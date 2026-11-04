/**
 * @file `inspect_address`: validity, ENS names, contract check, tx count and balance of an address or `.eth` name.
 */
import { formatEther, getAddress } from 'viem';
import { z } from 'zod';
import { CHAIN_IDS, isEnsName, NETWORKS, normalizeEnsName, toChecksumAddress } from '../intent';
import { defineTool, toolError } from './tool';

export const inspectAddress = defineTool({
  name: 'inspect_address',
  description:
    'Checks a 0x address or ENS name (.eth). Names resolve on Ethereum mainnet. Returns the address, its verified primary ENS name, ' +
    'whether the name is the primary name of its address, and on Monad mainnet and testnet whether it is a contract, its transaction count and its MON balance.',
  input: z.object({ address: z.string().max(255).describe('The 0x address or .eth name exactly as it appears.') }),
  run: async (ctx, { address }) => {
    const name = isEnsName(address) ? normalizeEnsName(address) : null;
    if (isEnsName(address) && !name) return toolError('INVALID_ADDRESS', 'That is not a valid ENS name.');
    const resolved = name ? await ctx.ens.getEnsAddress({ name }) : toChecksumAddress(address);
    if (!resolved) {
      return name ? toolError('ENS_NOT_FOUND', `${name} has no address set.`) : toolError('INVALID_ADDRESS', 'That is not a valid 0x address or ENS name.');
    }
    const checksummed = getAddress(resolved);
    const onChain = (id: (typeof CHAIN_IDS)[number]) =>
      Promise.all([
        ctx.chains[id].getCode({ address: checksummed }),
        ctx.chains[id].getTransactionCount({ address: checksummed }),
        ctx.chains[id].getBalance({ address: checksummed }),
      ]).then(([code, txCount, balance]) => ({ isContract: !!code && code !== '0x', txCount, balanceMon: formatEther(balance) }));
    const [primaryName, ...networks] = await Promise.all([
      ctx.ens.getEnsName({ address: checksummed }).catch(() => null),
      ...CHAIN_IDS.map(onChain),
    ]);
    return {
      valid: true,
      checksummed,
      ...(name ? { ensName: name, nameIsPrimary: primaryName === name } : {}),
      primaryName: primaryName ?? null,
      ...Object.fromEntries(CHAIN_IDS.map((id, i) => [NETWORKS[id].key, networks[i]])),
    };
  },
});
