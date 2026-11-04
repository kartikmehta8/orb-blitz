/**
 * @file `ask_user`: records a clarification question with chip options; the agent loop stops after it.
 *
 * Options are sanitized before they are stored. The model is told to pass
 * concrete addresses and amounts, and the sanitizer drops anything else.
 */
import { z } from 'zod';
import { sanitizeClarification } from '../clarification';
import { defineTool } from './tool';

export const askUser = defineTool({
  name: 'ask_user',
  description:
    'Asks the user a question and ends your turn. The tapped option comes back as the next user message, so every option must be a concrete value: the full 0x address copied exactly, or a MON amount like "0.5 MON" within the per-payment cap and the remaining daily limit. Never a name, and never a free-text prompt such as "Enter a different amount". For an address chip you may pass labels, parallel to options: the person\'s name, or null. A label is kept only when that name is written next to the address. In the question, shorten addresses to 0x1234…abcd.',
  input: z.object({
    question: z.string().min(1).max(200).describe('One short question. Shorten any 0x address to 0x1234…abcd.'),
    options: z
      .array(z.string().min(1).max(100))
      .min(1)
      .max(4)
      .describe(
        '1-4 concrete values. Each is the full 0x address copied exactly, or a MON amount like "0.5 MON" within the per-payment and daily caps. No names and no free-text prompts.',
      ),
    labels: z
      .array(z.string().max(100).nullable())
      .max(4)
      .optional()
      .describe(
        'Optional names parallel to options. Used only for an address, and only when that exact name is written next to it. Null for amounts. Never an address.',
      ),
  }),
  run: async (ctx, input) => {
    ctx.clarification = sanitizeClarification({
      question: input.question,
      options: input.options,
      ...(input.labels ? { labels: input.labels } : {}),
      perTxMon: ctx.perTxMon,
      dailyRemainingMon: ctx.dailyRemainingMon,
      contextText: ctx.context?.text ?? null,
      userTexts: ctx.userTexts,
    });
    return { ok: true };
  },
});
