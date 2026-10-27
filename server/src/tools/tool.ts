/**
 * @file Types and helpers shared by every agent tool. Kept apart from
 * `tools/index.ts` so tool modules don't import the registry that imports them.
 */
import type { z } from 'zod';
import type { ChainClient } from '../chain';
import type { Intent, ScreenContextInput, TransferErrorCode } from '../intent';
import type { Clarification } from '../schemas';

/** Per-request state the tools read and write. The model can only reach it through tool inputs. */
export type ToolCtx = {
  chain: ChainClient;
  /** The user's own wallet (checksummed); the model cannot substitute another. */
  wallet: `0x${string}`;
  perTxMon: string;
  dailyRemainingMon: string;
  context: ScreenContextInput | null;
  /** All user-authored messages, used for provenance. */
  userTexts: string[];
  /** Intents created so far; only `prepare_native_transfer` appends. */
  intents: Intent[];
  /** Set by `ask_user`; ends the loop. */
  clarification: Clarification | null;
};

export type ToolErrorCode = TransferErrorCode | 'BAD_TOOL_INPUT' | 'TOO_MANY_INTENTS';
/** JSON object returned to the model. Errors carry `{ error, message }`. */
export type ToolOutput = Record<string, unknown>;

/** A tool: a zod input schema plus an implementation that receives parsed input. */
export type Tool<S extends z.ZodObject> = {
  name: string;
  description: string;
  input: S;
  run: (ctx: ToolCtx, input: z.infer<S>) => Promise<ToolOutput>;
};

/**
 * Identity helper so each tool file gets its input type inferred from its schema.
 * @param tool Tool definition.
 * @returns The same tool.
 */
export const defineTool = <S extends z.ZodObject>(tool: Tool<S>): Tool<S> => tool;

/**
 * Builds a tool error result.
 * @param error Machine-readable code.
 * @param message One plain sentence the model can relay.
 * @returns `{ error, message }`.
 */
export const toolError = (error: ToolErrorCode, message: string): ToolOutput => ({ error, message });

/**
 * Whether a tool output is an error.
 * @param out Tool output.
 * @returns The error code, or null on success.
 */
export const errorCode = (out: ToolOutput): string | null => (typeof out.error === 'string' ? out.error : null);
