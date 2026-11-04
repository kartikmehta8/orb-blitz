/**
 * @file Agent tool registry: Anthropic tool definitions
 * generated from each tool's zod input schema, and the `runTool` dispatcher.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { askUser } from './askUser';
import { getTxStatus } from './getTxStatus';
import { getWalletBalance } from './getWalletBalance';
import { inspectAddress } from './inspectAddress';
import { prepareNativeTransfer } from './prepareNativeTransfer';
import { toolError, type Tool, type ToolCtx, type ToolOutput } from './tool';

type Entry = { def: Anthropic.Tool; call: (ctx: ToolCtx, raw: unknown) => Promise<ToolOutput> };

/**
 * Wraps a tool for the dispatcher: validates raw model input, converts any
 * thrown error (RPC failure after retries) into an `RPC_ERROR` result.
 * @param tool Tool definition.
 * @returns Its Anthropic definition and a never-throwing caller.
 */
function entry<S extends z.ZodObject>(tool: Tool<S>): Entry {
  const schema = z.toJSONSchema(tool.input);
  return {
    def: {
      name: tool.name,
      description: tool.description,
      input_schema: { type: 'object', properties: schema.properties ?? {}, required: schema.required ?? [] },
    },
    call: async (ctx, raw) => {
      const parsed = tool.input.safeParse(raw);
      if (!parsed.success) return toolError('BAD_TOOL_INPUT', z.prettifyError(parsed.error).slice(0, 300));
      try {
        return await tool.run(ctx, parsed.data);
      } catch (e) {
        const msg = (e instanceof Error ? e.message : String(e)).split('\n')[0];
        return toolError('RPC_ERROR', `Couldn't reach Monad testnet: ${msg.slice(0, 120)}`);
      }
    },
  };
}

const REGISTRY = new Map(
  [getWalletBalance, inspectAddress, prepareNativeTransfer, getTxStatus, askUser].map((t) => [t.name, entry(t)]),
);

/** Tool definitions sent to the Messages API. */
export const TOOL_DEFS: Anthropic.Tool[] = [...REGISTRY.values()].map((e) => e.def);

/**
 * Runs a tool requested by the model. Never throws.
 * @param name Tool name from the `tool_use` block.
 * @param input Raw, untrusted tool input.
 * @param ctx Per-request tool state.
 * @returns Tool output; unknown tools and invalid input give `BAD_TOOL_INPUT`.
 */
export async function runTool(name: string, input: unknown, ctx: ToolCtx): Promise<ToolOutput> {
  const tool = REGISTRY.get(name);
  return tool ? tool.call(ctx, input) : toolError('BAD_TOOL_INPUT', `Unknown tool "${name.slice(0, 40)}".`);
}
