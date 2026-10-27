/**
 * @file Agent client: `POST /v1/agent` (spec §7.5) and turn planning.
 *
 * The server response is untrusted. Only `{id, to, amountWei}` is taken from
 * each proposed intent; the full intent (provenance, caps, gas, fee, warnings)
 * is rebuilt on the device with the same `prepareTransfer` the server uses, so
 * a compromised server cannot inject a recipient, fee or gas limit.
 *
 * Network errors, timeouts, 429 and 5xx fall back to the offline regex parser.
 * 401 does not.
 */
import { randomUUID } from 'expo-crypto';
import { formatEther, type Address } from 'viem';
import { publicClient } from './chain';
import { config } from './config';
import { parseFallback } from './fallbackParser';
import {
  CHAIN_ID,
  isTransferError,
  MAX_INTENTS_PER_REQUEST,
  prepareTransfer,
  type ContextSource,
  type Intent,
  type ScreenContextInput,
} from './intent';
import type { LimitState } from './limits';
import { getRecipients, isRecord, isStringArray, isWeiString } from './storage';
import { withNewRecipient } from './validateIntent';

/** Request timeout. */
const AGENT_TIMEOUT_MS = 30_000;
/** Most chat turns sent per request. */
const MAX_HISTORY = 10;

export type ChatTurn = { role: 'user' | 'assistant'; text: string };

/** Screen or clipboard text as sent to the agent. */
export type AgentContext = {
  source: ContextSource;
  appLabel: string;
  packageName?: string;
  text: string;
  capturedAt: number;
};

type AgentRequest = {
  requestId: string;
  messages: ChatTurn[];
  context: AgentContext | null;
  wallet: { address: Address; chainId: typeof CHAIN_ID };
  limits: { perTxMon: string; dailyRemainingMon: string };
};

export type Clarification = { question: string; options: string[] };

/** The only intent fields the app reads from the server. */
type ProposedIntent = Pick<Intent, 'id' | 'to' | 'amountWei'>;

type AgentResponse = { reply: string; intents: ProposedIntent[]; clarification: Clarification | null };

type AgentErrorKind = 'offline' | 'auth' | 'bad-response';

/** Typed agent failure. `kind` decides fallback vs. error. */
class AgentError extends Error {
  /**
   * @param kind Failure class.
   * @param message Developer detail (never shown verbatim, never contains user text).
   */
  constructor(
    readonly kind: AgentErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'AgentError';
  }
}

const isProposal = (v: unknown): v is ProposedIntent =>
  isRecord(v) && typeof v.id === 'string' && v.id.length > 0 && typeof v.to === 'string' && isWeiString(v.amountWei);

const isClarification = (v: unknown): v is Clarification =>
  isRecord(v) && typeof v.question === 'string' && isStringArray(v.options);

/**
 * Validates the response body against §9.1 (the fields the app uses).
 * @param v Parsed JSON.
 * @param requestId The ID we sent; the server must echo it.
 * @returns The response, or null when the shape is wrong.
 */
function parseResponse(v: unknown, requestId: string): AgentResponse | null {
  if (!isRecord(v) || v.requestId !== requestId || typeof v.reply !== 'string') return null;
  if (!Array.isArray(v.intents) || !v.intents.every(isProposal)) return null;
  const clarification = v.clarification ?? null;
  if (clarification !== null && !isClarification(clarification)) return null;
  return {
    reply: v.reply,
    intents: v.intents.slice(0, MAX_INTENTS_PER_REQUEST),
    clarification: clarification && { question: clarification.question, options: clarification.options.slice(0, 4) },
  };
}

/**
 * Calls the agent server.
 * @param req Request body.
 * @param signal Caller's abort signal (sheet dismissed). Aborting rethrows the abort error as-is.
 * @returns The validated response.
 * @throws AgentError `offline` (network, timeout, 429, 5xx, unconfigured), `auth` (401), `bad-response`.
 */
async function askAgent(req: AgentRequest, signal: AbortSignal): Promise<AgentResponse> {
  if (!config.agentUrl) throw new AgentError('offline', 'EXPO_PUBLIC_AGENT_URL is not set');
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal.addEventListener('abort', onAbort);
  const timer = setTimeout(onAbort, AGENT_TIMEOUT_MS);
  try {
    let res: Response;
    try {
      res = await fetch(`${config.agentUrl}/v1/agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.agentToken}` },
        body: JSON.stringify(req),
        signal: controller.signal,
      });
    } catch (e) {
      if (signal.aborted) throw e;
      throw new AgentError('offline', 'Network error or timeout');
    }
    if (res.status === 401) throw new AgentError('auth', 'HTTP 401');
    if (res.status === 429 || res.status >= 500) throw new AgentError('offline', `HTTP ${res.status}`);
    if (!res.ok) throw new AgentError('bad-response', `HTTP ${res.status}`);
    let body: unknown;
    try {
      body = await res.json();
    } catch (e) {
      if (signal.aborted) throw e;
      throw new AgentError(controller.signal.aborted ? 'offline' : 'bad-response', 'Body read failed');
    }
    const parsed = parseResponse(body, req.requestId);
    if (!parsed) throw new AgentError('bad-response', 'Unexpected response shape');
    return parsed;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
  }
}

/** What one user message produced. */
export type TurnOutcome = {
  /** Shown as a system line above the reply (fallback or auth error). */
  notice: { text: string; tone: 'warning' | 'danger' } | null;
  reply: string;
  intents: Intent[];
  clarification: Clarification | null;
};

export type TurnInput = {
  /** Conversation so far, oldest first, ending with the new user message. */
  history: ChatTurn[];
  /** Context to share, or null when unavailable or excluded. */
  context: AgentContext | null;
  wallet: Address;
  limits: LimitState;
  signal: AbortSignal;
};

/**
 * Plans one turn: asks the agent, rebuilds its intents locally, or falls back
 * to the regex parser when the agent is unreachable.
 * @param input History, context, wallet, caps and abort signal.
 * @returns Reply, locally validated intents and an optional clarification.
 * @throws The abort error when `input.signal` fires.
 */
export async function planTurn(input: TurnInput): Promise<TurnOutcome> {
  const { history, context, wallet, limits, signal } = input;
  const userTexts = history.filter((t) => t.role === 'user').map((t) => t.text);
  const perTxMon = formatEther(limits.perTxWei);
  const dailyRemainingMon = formatEther(limits.remainingWei);
  const contextInput: ScreenContextInput | null = context && {
    source: context.source,
    appLabel: context.appLabel,
    text: context.text,
  };
  const prepare = (id: string, to: string, amountMon: string, parsedBy: Intent['parsedBy']) =>
    prepareTransfer(publicClient, { id, to, amountMon, wallet, perTxMon, dailyRemainingMon, context: contextInput, userTexts, parsedBy });

  let failure: AgentErrorKind;
  try {
    const res = await askAgent(
      {
        requestId: randomUUID(),
        messages: history.slice(-MAX_HISTORY),
        context,
        wallet: { address: wallet, chainId: CHAIN_ID },
        limits: { perTxMon, dailyRemainingMon },
      },
      signal,
    );
    const results = await Promise.all(res.intents.map((p) => prepare(p.id, p.to, formatEther(BigInt(p.amountWei)), 'agent')));
    const errors = [...new Set(results.filter(isTransferError).map((r) => r.message))];
    return {
      notice: null,
      reply: [res.reply, ...errors].filter(Boolean).join('\n\n'),
      intents: await withKnownRecipients(results.filter((r): r is Intent => !isTransferError(r))),
      clarification: res.clarification,
    };
  } catch (e) {
    if (signal.aborted || !(e instanceof AgentError)) throw e;
    failure = e.kind;
  }

  if (failure === 'auth') {
    return { notice: { text: 'Agent auth failed (check token)', tone: 'danger' }, reply: '', intents: [], clarification: null };
  }
  const notice: TurnOutcome['notice'] = {
    text: failure === 'offline' ? 'Agent offline. Using basic parser.' : 'Agent sent a bad response. Using basic parser.',
    tone: 'warning',
  };
  const parsed = parseFallback({ contextText: context?.text ?? null, userTexts, perTxMon });
  if (parsed.kind === 'clarify') {
    return { notice, reply: '', intents: [], clarification: { question: parsed.question, options: parsed.options } };
  }
  const result = await prepare(randomUUID(), parsed.to, parsed.amountMon, 'fallback');
  return isTransferError(result)
    ? { notice, reply: result.message, intents: [], clarification: null }
    : { notice, reply: '', intents: await withKnownRecipients([result]), clarification: null };
}

/**
 * Applies the local `NEW_RECIPIENT` warning.
 * @param intents Locally prepared intents.
 * @returns The intents, annotated.
 */
async function withKnownRecipients(intents: Intent[]): Promise<Intent[]> {
  if (!intents.length) return intents;
  const known = await getRecipients();
  return intents.map((i) => withNewRecipient(i, known));
}
