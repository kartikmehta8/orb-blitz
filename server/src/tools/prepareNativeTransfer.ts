/**
 * @file `prepare_native_transfer`: the only way an intent is created. A thin
 * wrapper over the shared `prepareTransfer` plus the per-request cap.
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { isTransferError, MAX_INTENTS_PER_REQUEST, prepareTransfer, shortAddress } from '../intent';
import { defineTool, toolError } from './tool';

export const prepareNativeTransfer = defineTool({
  name: 'prepare_native_transfer',
  description:
    'Prepares (does not send) a native MON transfer on Monad testnet for the user to confirm on their phone. ' +
    'Only call when the user asks to pay. The recipient must appear on screen or in the user message.',
  input: z.object({
    to: z.string().max(100).describe('Recipient 0x address, copied exactly.'),
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
    const result = await prepareTransfer(ctx.chain, {
      id: randomUUID(),
      to: input.to,
      amountMon: input.amount_mon,
      wallet: ctx.wallet,
      perTxMon: ctx.perTxMon,
      dailyRemainingMon: ctx.dailyRemainingMon,
      context: ctx.context,
      userTexts: ctx.userTexts,
      parsedBy: 'agent',
      memo: input.memo,
    });
    if (isTransferError(result)) return result;
    ctx.intents.push(result);
    return {
      ok: true,
      intentId: result.id,
      summary: `Send ${result.amountDisplay} to ${shortAddress(result.to)}, fee about ${result.estFeeDisplay}. Ready for the user to confirm.`,
      warnings: result.warnings,
    };
  },
});
