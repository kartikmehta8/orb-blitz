/**
 * @file Boundary schemas for the `POST /v1/agent` request and response.
 * Everything that enters the server is parsed here first.
 */
import { z } from 'zod';
import { MAX_LABEL_CHARS } from './fallbackParser';
import { MAINNET_CHAIN_ID, TESTNET_CHAIN_ID, toChecksumAddress, type Intent } from './intent';

const ChainIdSchema = z.union([z.literal(TESTNET_CHAIN_ID), z.literal(MAINNET_CHAIN_ID)]);
import { RISK_LEVELS, RISK_SIGNALS } from './risk';

/** Max characters of captured screen/clipboard text (the app truncates at 4000). */
const MAX_CONTEXT_CHARS = 4000;
/** Max characters per chat message. */
const MAX_MESSAGE_CHARS = 2000;
/** Max chat turns per request. */
const MAX_MESSAGES = 10;

/** A MON amount as a plain decimal string ("1", "0.25"), at most 18 decimals. */
const MonDecimal = z.string().regex(/^\d{1,9}(\.\d{1,18})?$/, 'must be a MON decimal string like "1" or "0.5"');

const WalletAddress = z.string().transform((value, ctx) => {
  const address = toChecksumAddress(value);
  if (!address) {
    ctx.addIssue({ code: 'custom', message: 'invalid address' });
    return z.NEVER;
  }
  return address;
});

/** Request body sent by the app. */
export const AgentRequestSchema = z.object({
  requestId: z.string().min(1).max(100),
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().min(1).max(MAX_MESSAGE_CHARS) }))
    .min(1)
    .max(MAX_MESSAGES)
    .refine((m) => m[m.length - 1]?.role === 'user', 'last message must be from the user'),
  context: z
    .object({
      source: z.enum(['screen', 'clipboard']),
      appLabel: z.string().max(100),
      packageName: z.string().max(200).optional(),
      text: z.string().max(MAX_CONTEXT_CHARS),
      capturedAt: z.number(),
    })
    .nullable(),
  /** `chainId` is the network the wallet screen shows. It never picks a payment's network. */
  wallet: z.object({ address: WalletAddress, chainId: ChainIdSchema }),
  limits: z.object({ perTxMon: MonDecimal, dailyRemainingMon: MonDecimal }),
});

export type AgentRequest = z.infer<typeof AgentRequestSchema>;

const IntentWarningSchema = z.enum([
  'NEW_RECIPIENT',
  'RECIPIENT_IS_CONTRACT',
  'SELF_TRANSFER',
  'AMOUNT_NOT_IN_CONTEXT',
  'PARSED_WITHOUT_AI',
  'CLOSE_TO_DAILY_LIMIT',
  'LOOKALIKE_RECIPIENT',
  'ENS_NOT_PRIMARY',
  'ENS_ADDRESS_CHANGED',
  'ENS_UNUSUAL_CHARACTERS',
]);

/** Mirrors the shared `Intent` type; the annotation fails to compile if they drift. */
const IntentSchema: z.ZodType<Intent> = z.object({
  id: z.string(),
  type: z.literal('native_transfer'),
  chainId: ChainIdSchema,
  to: z.templateLiteral(['0x', z.string()]),
  ensName: z.string().max(255).optional(),
  primaryName: z.string().max(255).optional(),
  amountWei: z.string(),
  amountDisplay: z.string(),
  gasLimit: z.string(),
  maxFeePerGasWei: z.string(),
  estFeeDisplay: z.string(),
  provenance: z.object({
    source: z.enum(['screen', 'clipboard', 'agent', 'user', 'both']),
    appLabel: z.string().optional(),
  }),
  recipientIsContract: z.boolean(),
  warnings: z.array(IntentWarningSchema),
  createdAt: z.number(),
  expiresAt: z.number(),
  parsedBy: z.enum(['agent', 'fallback']),
  /** Display-only. Never an address, never control characters, at most 80 chars. */
  memo: z
    .string()
    .min(1)
    .max(80)
    .refine((s) => !/0x[a-fA-F0-9]{40}/i.test(s) && !/\p{Cc}/u.test(s), 'memo must be display text')
    .optional(),
});

/**
 * One chip's display name. Null for an amount, or for an address whose name
 * is not written next to it. Omitted entirely (not an all-null array) when
 * no option has a name, so older clients still see `{ question, options }`.
 * When present, the array is parallel to `options`.
 */
const ClarificationSchema = z
  .object({
    question: z.string(),
    options: z.array(z.string()),
    labels: z.array(z.string().min(1).max(MAX_LABEL_CHARS).nullable()).optional(),
  })
  .refine((c) => c.labels === undefined || c.labels.length === c.options.length, {
    message: 'labels must be the same length as options',
  });
export type Clarification = z.infer<typeof ClarificationSchema>;

/** Response body returned to the app. */
export const AgentResponseSchema = z.object({
  requestId: z.string(),
  reply: z.string(),
  intents: z.array(IntentSchema),
  clarification: ClarificationSchema.nullable(),
  /** Scam Shield verdict on the screen, or null when nobody asked and nothing looked wrong. */
  assessment: z.object({ level: z.enum(RISK_LEVELS), signals: z.array(z.enum(RISK_SIGNALS)) }).nullable(),
  meta: z.object({ model: z.string(), toolCalls: z.array(z.string()), ms: z.number(), fallback: z.boolean() }),
});

export type AgentResponse = z.infer<typeof AgentResponseSchema>;
