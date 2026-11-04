/**
 * @file Stdio MCP server exposing the same tool functions the phone
 * agent uses. It only proposes intents; nothing here can sign or send.
 *
 * Env: `MCP_WALLET_ADDRESS` (required), `MCP_PER_TX_MON` (default 1),
 * `MCP_DAILY_MON` (default 5), `MONAD_RPC_URL`. stdout carries the protocol,
 * so diagnostics go to stderr.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createChainClient, DEFAULT_RPC_URL } from './chain';
import { parseMon, toChecksumAddress } from './intent';
import { getTxStatus } from './tools/getTxStatus';
import { getWalletBalance } from './tools/getWalletBalance';
import { inspectAddress } from './tools/inspectAddress';
import { prepareNativeTransfer } from './tools/prepareNativeTransfer';
import { errorCode, type ToolCtx, type ToolOutput } from './tools/tool';

const env = process.env;
const wallet = toChecksumAddress(env.MCP_WALLET_ADDRESS ?? '');
const perTxMon = env.MCP_PER_TX_MON || '1';
const dailyMon = env.MCP_DAILY_MON || '5';
if (!wallet || parseMon(perTxMon) === null || parseMon(dailyMon) === null) {
  console.error('Set MCP_WALLET_ADDRESS to a 0x address; MCP_PER_TX_MON / MCP_DAILY_MON must be MON decimals.');
  process.exit(1);
}
const chain = createChainClient(env.MONAD_RPC_URL || DEFAULT_RPC_URL);

// ponytail: the daily cap is the static MCP_DAILY_MON with no spend tracking; the phone re-checks real daily spend before signing.
/**
 * Fresh tool state per call.
 * @param contextText Text the user pasted into the MCP client, used for provenance.
 * @returns Tool context bound to the configured wallet and caps.
 */
const makeCtx = (contextText: string | null): ToolCtx => ({
  chain,
  wallet,
  perTxMon,
  dailyRemainingMon: dailyMon,
  context: contextText === null ? null : { source: 'clipboard', appLabel: 'MCP client', text: contextText },
  userTexts: [],
  intents: [],
  clarification: null,
});

/**
 * Formats a tool output as an MCP tool result.
 * @param out Tool output.
 * @returns JSON text content, flagged as an error when the tool failed.
 */
const toResult = (out: ToolOutput) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(out) }],
  isError: errorCode(out) !== null,
});

const server = new McpServer({ name: 'orb', version: '1.0.0' });

for (const tool of [getWalletBalance, inspectAddress, getTxStatus]) {
  server.registerTool(
    tool.name,
    { description: tool.description, inputSchema: tool.input },
    // Each tool's run accepts its own parsed input; the SDK validated it against the same schema.
    async (input: Parameters<typeof tool.run>[1]) => toResult(await tool.run(makeCtx(null), input)),
  );
}

const transferInput = prepareNativeTransfer.input.extend({
  context: z.string().max(8000).describe('The text the user pasted that contains the recipient address.'),
});
server.registerTool(
  prepareNativeTransfer.name,
  {
    description: `${prepareNativeTransfer.description} Returns intent JSON for the Orb phone app to confirm; it never signs.`,
    inputSchema: transferInput,
  },
  async ({ context, ...input }) => {
    const ctx = makeCtx(context);
    const out = await prepareNativeTransfer.run(ctx, input);
    return toResult(errorCode(out) ? out : { ...out, intent: ctx.intents[0] });
  },
);

await server.connect(new StdioServerTransport());
console.error(`Orb MCP ready (wallet ${wallet.slice(0, 4)}…${wallet.slice(-4)})`);
