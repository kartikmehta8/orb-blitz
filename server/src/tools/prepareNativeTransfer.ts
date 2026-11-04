/**
 * @file `prepare_native_transfer`: the only way an intent is created. A thin
 * wrapper over the shared `prepareTransfer` plus the per-request cap.
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { isTransferError, MAX_INTENTS_PER_REQUEST, NETWORKS, networkMentioned, prepareTransfer, shortAddress } from '../intent';
import { defineTool, toolError } from './tool';

export const prepareNativeTransfer = defineTool({
  name: 'prepare_native_transfer',
  description:
    'Prepares (does not send) a native MON transfer for the user to confirm on their phone. ' +
    'The network is whatever the user said: mainnet (real MON) or testnet. If they have not said, call ask_user with options ["Mainnet", "Testnet"] first. ' +
    'Only call when the user asks to pay. The recipient (0x address or .eth name) must appear on screen or in the user message. ENS names are resolved on Ethereum mainnet.',
  input: z.object({
    to: z.string().max(255).describe('Recipient 0x address or ENS name such as "kartik.eth", copied exactly.'),
    amount_mon: z.string().max(40).describe('Amount in MON as a decimal string, e.g. "2" or "0.5".'),
    reason: z.string().max(200).describe('Short note on why, e.g. "dinner split".'),
    memo: z
      .string()
      .max(500)
      .optional()
      .describe('Display-only purpose, e.g. "dinner". No addresses. Omit if unknown. Does not change the amount or recipient.'),
  }),
  run: async (ctx, input) => {
    if (ctx.intents.length >= MAX_INTENTS_PER_REQUEST) {
      return toolError('TOO_MANY_INTENTS', `At most ${MAX_INTENTS_PER_REQUEST} payments per request.`);
    }
    // The network comes from the user's own words only, never from the model.
    const chainId = networkMentioned(ctx.userTexts);
    if (!chainId) {
      return toolError('NETWORK_UNCLEAR', 'Ask the user: Monad mainnet (real MON) or testnet? Use ask_user with options ["Mainnet", "Testnet"].');
    }
    const result = await prepareTransfer(ctx.chains[chainId], {
      id: randomUUID(),
      chainId,
      to: input.to,
      amountMon: input.amount_mon,
      wallet: ctx.wallet,
      perTxMon: ctx.perTxMon,
      dailyRemainingMon: ctx.dailyRemainingMon,
      context: ctx.context,
      userTexts: ctx.userTexts,
      parsedBy: 'agent',
      memo: input.memo,
    }, ctx.ens);
    if (isTransferError(result)) return result;
    ctx.intents.push(result);
    return {
      ok: true,
      intentId: result.id,
      network: NETWORKS[chainId].name,
      summary: `Send ${result.amountDisplay} on ${NETWORKS[chainId].name} to ${result.ensName ? `${result.ensName} (${shortAddress(result.to)})` : shortAddress(result.to)}, fee about ${result.estFeeDisplay}. Ready for the user to confirm.`,
      warnings: result.warnings,
    };
  },
});
