/**
 * @file Test doubles: a stubbed chain client and scripted Anthropic responses. No network.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { getAddress, parseEther, TransactionReceiptNotFoundError, type Hex } from 'viem';
import { vi } from 'vitest';
import type { ChainClient, ChainClients } from '../src/chain';
import type { CreateMessage } from '../src/agent';
import type { EnsReader } from '../src/intent';
import type { AgentRequest } from '../src/schemas';
import type { ToolCtx } from '../src/tools/tool';

export const WALLET = getAddress('0x1111111111111111111111111111111111111111');
export const RECIPIENT = getAddress('0xabcdefabcdefabcdefabcdefabcdefabcdef1234');
export const OTHER = getAddress('0x9876543210987654321098765432109876543210');
const MAX_FEE = 100_000_000_000n; // 100 gwei

type ChainOpts = { code?: Hex; balance?: bigint; gas?: bigint; fail?: boolean };

/**
 * Chain stub with sane defaults: recipient is an EOA, wallet holds 10 MON.
 * @param opts Overrides.
 * @returns A ChainClient whose methods are vi.fn spies.
 */
export function mockChain(opts: ChainOpts = {}) {
  const fail = () => Promise.reject(new Error('rpc down'));
  return {
    getCode: vi.fn(() => (opts.fail ? fail() : Promise.resolve(opts.code))),
    getBalance: vi.fn(() => Promise.resolve(opts.balance ?? parseEther('10'))),
    estimateGas: vi.fn(() => Promise.resolve(opts.gas ?? 30_000n)),
    estimateFeesPerGas: vi.fn(() => Promise.resolve({ maxFeePerGas: MAX_FEE, maxPriorityFeePerGas: 1n })),
    getTransactionCount: vi.fn(() => Promise.resolve(7)),
    getTransactionReceipt: vi.fn(({ hash }: { hash: Hex }) =>
      hash.endsWith('0')
        ? Promise.reject(new TransactionReceiptNotFoundError({ hash }))
        : Promise.resolve({ status: 'success', blockNumber: 42n }),
    ),
  } as unknown as ChainClient & Record<string, ReturnType<typeof vi.fn>>;
}

export const ENS_NAME = 'kartik.eth';

/**
 * ENS stub: `kartik.eth` resolves to RECIPIENT and is its primary name; every other name is unset.
 * @param names Name to address overrides.
 * @param primary Address (lowercase) to primary name overrides.
 * @returns An EnsReader whose methods are vi.fn spies.
 */
export function mockEns(names: Record<string, string> = { [ENS_NAME]: RECIPIENT }, primary: Record<string, string> = { [RECIPIENT.toLowerCase()]: ENS_NAME }) {
  return {
    getEnsAddress: vi.fn(({ name }: { name: string }) => Promise.resolve(names[name] ?? null)),
    getEnsName: vi.fn(({ address }: { address: string }) => Promise.resolve(primary[address.toLowerCase()] ?? null)),
  } as unknown as EnsReader & Record<string, ReturnType<typeof vi.fn>>;
}

/**
 * Both Monad networks backed by the same stub settings.
 * @param opts Overrides, applied to both.
 * @returns Testnet and mainnet stubs.
 */
export function mockChains(opts: ChainOpts = {}) {
  return { 10143: mockChain(opts), 143: mockChain(opts) } as unknown as ChainClients & Record<number, ChainClient & Record<string, ReturnType<typeof vi.fn>>>;
}

/**
 * Tool context for direct tool tests.
 * @param over Field overrides.
 * @returns A fresh ToolCtx.
 */
export function makeCtx(over: Partial<ToolCtx> = {}): ToolCtx {
  return {
    chains: mockChains(),
    ens: mockEns(),
    wallet: WALLET,
    perTxMon: '1',
    dailyRemainingMon: '5',
    context: { source: 'screen', appLabel: 'WhatsApp', text: `dinner was 0.2 MON, send to ${RECIPIENT}` },
    userTexts: ['pay this on testnet'],
    intents: [],
    clarification: null,
    assessment: null,
    ...over,
  };
}

/**
 * A valid agent request (parsed form).
 * @param over Field overrides.
 * @returns AgentRequest.
 */
export function makeRequest(over: Partial<AgentRequest> = {}): AgentRequest {
  return {
    requestId: 't1',
    messages: [{ role: 'user', text: 'pay this on testnet' }],
    context: { source: 'screen', appLabel: 'WhatsApp', text: `dinner was 0.2 MON, send to ${RECIPIENT}`, capturedAt: 0 },
    wallet: { address: WALLET, chainId: 10143 },
    limits: { perTxMon: '1', dailyRemainingMon: '5' },
    ...over,
  };
}

type Block = { type: 'text'; text: string } | { type: 'tool_use'; name: string; input: unknown };

/**
 * Builds a Messages API response.
 * @param blocks Text and tool_use blocks.
 * @returns A Message; stop_reason is tool_use when any tool_use block is present.
 */
export function msg(...blocks: Block[]): Anthropic.Message {
  const content = blocks.map((b, i) => (b.type === 'tool_use' ? { ...b, id: `toolu_${i}` } : b));
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'test-model',
    content,
    stop_reason: blocks.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  } as unknown as Anthropic.Message;
}

/**
 * A CreateMessage that replays scripted responses in order (repeating the last).
 * @param script Responses, or an Error to throw.
 * @returns Spy function.
 */
export function scripted(...script: (Anthropic.Message | Error)[]) {
  let i = 0;
  return vi.fn<CreateMessage>(async () => {
    const next = script[Math.min(i++, script.length - 1)];
    if (next instanceof Error) throw next;
    return next as Anthropic.Message;
  });
}
