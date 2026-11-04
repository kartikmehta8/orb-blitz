/**
 * @file Agent client: `POST /v1/agent` and turn planning.
 *
 * The server response is untrusted. Only `{id, to, ensName, amountWei}` is
 * taken from each proposed intent; the full intent (provenance, ENS
 * resolution, caps, gas, fee, warnings) is rebuilt on the device with the same
 * `prepareTransfer` the server uses, so a compromised server cannot inject a
 * recipient, fee or gas limit. Its screen verdict can only raise the risk
 * level above what the device's own scan finds.
 *
 * Network errors, timeouts, 429 and 5xx fall back to the offline regex parser.
 * 401, and a missing Privy access token, do not.
 */
import { randomUUID } from 'expo-crypto';
import { formatEther, type Address } from 'viem';
import { currentAccessToken } from './accessToken';
import { clientFor, ensClient } from './chain';
import { config } from './config';
import { parseFallback } from './fallbackParser';
import {
  isChainId,
  isTransferError,
  MAX_INTENTS_PER_REQUEST,
  networkMentioned,
  type ChainId,
  prepareTransfer,
  type ContextSource,
  type Intent,
  type ScreenContextInput,
} from './intent';
import type { AgentPaymentRequest } from './agentsApi';
import type { LimitState } from './limits';
import { getViewNetwork } from './network';
import { setOrbState } from './orbBridge';
import { RISK_LEVELS, RISK_SIGNALS, screenAssessment, type Assessment } from './risk';
import { getEnsBook, getRecipients, isRecord, isStringArray, isWeiString } from './storage';
import { withRecipientChecks } from './validateIntent';

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
  wallet: { address: Address; chainId: ChainId };
  limits: { perTxMon: string; dailyRemainingMon: string };
};

export type Clarification = {
  question: string;
  options: string[];
  /**
   * Parallel to `options`. Each entry is a name or null.
   * Omitted when every entry would be null, and ignored when the length does not match.
   */
  labels?: (string | null)[];
};

/**
 * The only intent fields the app reads from the server.
 * `memo` is display-only and optional; anything else on the object is ignored.
 */
type ProposedIntent = Pick<Intent, 'id' | 'to' | 'amountWei' | 'chainId'> & { memo?: string; ensName?: string };

type AgentResponse = {
  reply: string;
  intents: ProposedIntent[];
  clarification: Clarification | null;
  assessment: Assessment | null;
};

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
  isRecord(v) &&
  typeof v.id === 'string' &&
  v.id.length > 0 &&
  typeof v.to === 'string' &&
  isWeiString(v.amountWei) &&
  isChainId(v.chainId);

const isAssessment = (v: unknown): v is Assessment =>
  isRecord(v) &&
  (RISK_LEVELS as readonly unknown[]).includes(v.level) &&
  Array.isArray(v.signals) &&
  v.signals.every((s) => (RISK_SIGNALS as readonly unknown[]).includes(s));

const isClarification = (v: unknown): v is Clarification =>
  isRecord(v) && typeof v.question === 'string' && isStringArray(v.options);

/**
 * Keeps `labels` only when it lines up 1:1 with `options` and is not all null.
 * A bad label list is dropped; the options still stand.
 * @param raw The `labels` field from the response, unchecked.
 * @param optionCount Length of the uncut options array.
 * @returns Labels, or undefined.
 */
function clarificationLabels(raw: unknown, optionCount: number): (string | null)[] | undefined {
  if (!Array.isArray(raw) || raw.length !== optionCount) return undefined;
  const labels: (string | null)[] = [];
  for (const entry of raw) {
    if (entry === null) labels.push(null);
    else if (typeof entry === 'string') labels.push(entry);
    else return undefined;
  }
  return labels.some((label) => label !== null) ? labels : undefined;
}

/**
 * Validates the response body (only the fields the app uses).
 * @param v Parsed JSON.
 * @param requestId The ID we sent; the server must echo it.
 * @returns The response, or null when the shape is wrong.
 */
function parseResponse(v: unknown, requestId: string): AgentResponse | null {
  if (!isRecord(v) || v.requestId !== requestId || typeof v.reply !== 'string') return null;
  if (!Array.isArray(v.intents) || !v.intents.every(isProposal)) return null;
  const clarification = v.clarification ?? null;
  if (clarification !== null && !isClarification(clarification)) return null;
  // An unknown shape (older server, new signal) is dropped, not fatal: the device scan still runs.
  const assessment = isAssessment(v.assessment) ? v.assessment : null;
  const options = clarification ? clarification.options.slice(0, 4) : [];
  const labels = clarification
    ? clarificationLabels(clarification.labels, clarification.options.length)?.slice(0, options.length)
    : undefined;
  return {
    reply: v.reply,
    intents: v.intents.slice(0, MAX_INTENTS_PER_REQUEST),
    clarification: clarification
      ? { question: clarification.question, options, ...(labels?.some((label) => label !== null) ? { labels } : {}) }
      : null,
    assessment,
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
    const token = await currentAccessToken();
    if (!token) throw new AgentError('auth', 'No Privy access token');
    let res: Response;
    try {
      res = await fetch(`${config.agentUrl}/v1/agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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
type TurnOutcome = {
  /** Shown as a system line above the reply (fallback or auth error). */
  notice: { text: string; tone: 'warning' | 'danger' } | null;
  reply: string;
  intents: Intent[];
  clarification: Clarification | null;
  /** Scam Shield verdict on the screen, or null when nobody asked and nothing looked wrong. */
  assessment: Assessment | null;
};

type TurnInput = {
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
  const prepare = (chainId: ChainId, id: string, to: string, amountMon: string, parsedBy: Intent['parsedBy'], memo?: string) =>
    prepareTransfer(clientFor(chainId), {
      id,
      chainId,
      to,
      amountMon,
      wallet,
      perTxMon,
      dailyRemainingMon,
      context: contextInput,
      userTexts,
      parsedBy,
      ...(typeof memo === 'string' ? { memo } : {}),
    }, ensClient);
  const assess = (reported: Assessment | null, hasIntents: boolean) =>
    screenAssessment({ contextText: context?.text ?? null, lastUserText: userTexts[userTexts.length - 1] ?? '', reported, hasIntents });

  setOrbState('thinking');
  let failure: AgentErrorKind;
  try {
    const res = await askAgent(
      {
        requestId: randomUUID(),
        messages: history.slice(-MAX_HISTORY),
        context,
        wallet: { address: wallet, chainId: await getViewNetwork() },
        limits: { perTxMon, dailyRemainingMon },
      },
      signal,
    );
    // The network must be the one the user said. A proposal on any other network is dropped.
    const said = networkMentioned(userTexts);
    const results = await Promise.all(
      // A name is re-resolved here; the server's address for it is ignored.
      res.intents.map((p) =>
        p.chainId !== said
          ? Promise.resolve({ error: 'RPC_ERROR' as const, message: 'Say "mainnet" or "testnet" so Orb knows where to pay.' })
          : prepare(p.chainId, p.id, typeof p.ensName === 'string' && p.ensName ? p.ensName : p.to, formatEther(BigInt(p.amountWei)), 'agent', p.memo),
      ),
    );
    const errors = [...new Set(results.filter(isTransferError).map((r) => r.message))];
    const intents = await withKnownRecipients(results.filter((r): r is Intent => !isTransferError(r)), wallet);
    setOrbState('success');
    return {
      notice: null,
      reply: [res.reply, ...errors].filter(Boolean).join('\n\n'),
      intents,
      clarification: res.clarification,
      assessment: assess(res.assessment, intents.length > 0),
    };
  } catch (e) {
    if (signal.aborted) {
      setOrbState('idle');
      throw e;
    }
    if (!(e instanceof AgentError)) {
      setOrbState('error');
      throw e;
    }
    failure = e.kind;
  }

  if (failure === 'auth') {
    setOrbState('error');
    return {
      notice: { text: 'Sign in again to use the agent.', tone: 'danger' },
      reply: '',
      intents: [],
      clarification: null,
      assessment: null,
    };
  }
  const notice: TurnOutcome['notice'] = {
    text: failure === 'offline' ? 'Agent offline. Using basic parser.' : 'Agent sent a bad response. Using basic parser.',
    tone: 'warning',
  };
  const parsed = parseFallback({ contextText: context?.text ?? null, userTexts, perTxMon });
  // Offline, a safety question is answered by the device scan alone.
  const offlineVerdict = assess(null, false);
  if (parsed.kind === 'clarify') {
    const labels = parsed.labels?.some((label) => label !== null) ? parsed.labels : undefined;
    setOrbState('success');
    // A verdict replaces only the chip-less "say pay this" prompt, never real chips.
    const prompt = offlineVerdict && parsed.options.length === 0;
    return {
      notice,
      reply: '',
      intents: [],
      clarification: prompt ? null : { question: parsed.question, options: parsed.options, ...(labels ? { labels } : {}) },
      assessment: offlineVerdict,
    };
  }
  const result = await prepare(parsed.chainId, randomUUID(), parsed.to, parsed.amountMon, 'fallback', parsed.memo);
  setOrbState('success');
  if (isTransferError(result)) return { notice, reply: result.message, intents: [], clarification: null, assessment: offlineVerdict };
  return { notice, reply: '', intents: await withKnownRecipients([result], wallet), clarification: null, assessment: assess(null, true) };
}

/**
 * Turns a connected agent's payment request into a review card. The request is
 * untrusted: the payment is rebuilt here with the same checks as any other
 * (recipient, ENS, device limits, balance) and gets the same Scam Shield label.
 * @param req The request from the server.
 * @param wallet The user's wallet.
 * @param limits Device spend limits.
 * @returns The outcome: one intent, or a notice explaining why there is none.
 */
export async function planAgentRequest(req: AgentPaymentRequest, wallet: Address, limits: LimitState): Promise<TurnOutcome> {
  const empty = { reply: '', intents: [], clarification: null, assessment: null };
  if (req.status !== 'pending') {
    const why = { sent: 'already paid', declined: 'declined', expired: 'expired' }[req.status];
    return { ...empty, notice: { text: `This request from ${req.agentName} was ${why}.`, tone: 'warning' } };
  }
  if (!isChainId(req.chainId)) return { ...empty, notice: { text: 'This request is for an unknown network.', tone: 'danger' } };
  const result = await prepareTransfer(
    clientFor(req.chainId),
    {
      id: req.id,
      chainId: req.chainId,
      to: req.to,
      amountMon: req.amountMon,
      wallet,
      perTxMon: formatEther(limits.perTxWei),
      dailyRemainingMon: formatEther(limits.remainingWei),
      context: { source: 'agent', appLabel: req.agentName, text: req.to },
      userTexts: [],
      parsedBy: 'agent',
      memo: req.reason,
    },
    ensClient,
  );
  if (isTransferError(result)) return { ...empty, notice: { text: result.message, tone: 'danger' } };
  const intents = await withKnownRecipients([result], wallet);
  return { ...empty, notice: null, reply: `${req.agentName} wants to pay ${req.amountMon} MON.`, intents };
}

/**
 * Applies the device-only warnings: new recipient, lookalike address, changed ENS name.
 * @param intents Locally prepared intents.
 * @param wallet The user's own address; a lookalike of it is flagged too.
 * @returns The intents, annotated.
 */
async function withKnownRecipients(intents: Intent[], wallet: Address): Promise<Intent[]> {
  if (!intents.length) return intents;
  const [known, ensBook] = await Promise.all([getRecipients(), getEnsBook()]);
  return intents.map((i) => withRecipientChecks(i, { known, wallet, ensBook }));
}
