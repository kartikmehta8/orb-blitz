/**
 * @file Connected agents, their payment requests and each user's phone inbox.
 *
 * An agent key (`orb_ak_…`) and an inbox token are shown once and stored only
 * as SHA-256 hashes. Requests wait for the human: the phone approves with a
 * fingerprint and signs; nothing here can sign or send.
 *
 * ponytail: one JSON file and in-process waiters, so one server process.
 * Move to SQLite plus a pub/sub channel before running more than one instance.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { formatEther, type Address, type Hash } from 'viem';
import { parseMon, type ChainId } from '../intent';

/** Requests the user has not answered expire after ten minutes. */
export const REQUEST_TTL_MS = 10 * 60_000;
/** Spend window for an agent's daily limit (rolling, so it never resets mid-burst). */
const DAY_MS = 24 * 60 * 60_000;
/** Unanswered requests one agent may have open at once. */
export const MAX_PENDING_PER_AGENT = 3;

export type AgentRecord = {
  id: string;
  userId: string;
  wallet: Address;
  name: string;
  keyHash: string;
  perTxMon: string;
  dailyMon: string;
  createdAt: number;
  revokedAt?: number;
};

export type RequestStatus = 'pending' | 'declined' | 'sent' | 'expired';

export type PaymentRequest = {
  id: string;
  agentId: string;
  userId: string;
  /** Monad mainnet or testnet, as the agent stated it. Shown on the notification and the review card. */
  chainId: ChainId;
  /** Recipient as the agent gave it: a 0x address or an ENS name. The phone re-resolves it. */
  to: string;
  /** Address it resolved to when the agent asked. Display and log only. */
  toAddress: Address;
  amountMon: string;
  reason: string;
  memo?: string;
  status: RequestStatus;
  txHash?: Hash;
  createdAt: number;
  expiresAt: number;
};

type State = { agents: AgentRecord[]; requests: PaymentRequest[]; inboxes: Record<string, string> };

/** Lowercase hex SHA-256. Keys are 32 random bytes, so a fast hash is enough. */
export const hashSecret = (secret: string): string => createHash('sha256').update(secret).digest('hex');

/** File-backed store. Pass `null` for a memory-only store (tests). */
export class AgentStore {
  private state: State = { agents: [], requests: [], inboxes: {} };
  private inboxWaiters = new Map<string, Set<() => void>>();
  private statusWaiters = new Map<string, Set<() => void>>();

  /**
   * @param file JSON file path, or null to keep everything in memory.
   * @param now Clock, injectable for tests.
   */
  constructor(
    private readonly file: string | null,
    private readonly now: () => number = Date.now,
  ) {
    if (file && existsSync(file)) this.state = { ...this.state, ...(JSON.parse(readFileSync(file, 'utf8')) as Partial<State>) };
  }

  /**
   * Connects a new agent for a user.
   * @param input Owner, wallet, display name and limits (MON decimals, already validated).
   * @returns The record and the key, which is never stored or shown again.
   */
  createAgent(input: Pick<AgentRecord, 'userId' | 'wallet' | 'name' | 'perTxMon' | 'dailyMon'>): { agent: AgentRecord; key: string } {
    const key = `orb_ak_${randomBytes(32).toString('base64url')}`;
    const agent: AgentRecord = { id: randomUUID(), ...input, keyHash: hashSecret(key), createdAt: this.now() };
    this.state.agents.push(agent);
    this.save();
    return { agent, key };
  }

  /** @returns The live agent for a presented key, or null. */
  agentByKey(key: string): AgentRecord | null {
    const hash = hashSecret(key);
    return this.state.agents.find((a) => a.keyHash === hash && !a.revokedAt) ?? null;
  }

  /** @returns The user's live agents, oldest first. */
  agentsFor(userId: string): AgentRecord[] {
    return this.state.agents.filter((a) => a.userId === userId && !a.revokedAt);
  }

  /**
   * Revokes an agent and declines its open requests.
   * @returns False when the agent is not the user's or already revoked.
   */
  revokeAgent(userId: string, agentId: string): boolean {
    const agent = this.agentsFor(userId).find((a) => a.id === agentId);
    if (!agent) return false;
    agent.revokedAt = this.now();
    for (const r of this.state.requests) if (r.agentId === agentId && this.statusOf(r) === 'pending') this.setStatus(r, 'declined');
    this.save();
    return true;
  }

  /**
   * MON this agent has spent or has waiting in the last 24 hours. Pending requests
   * count, so an agent cannot queue several payments that together pass the limit.
   * @returns Sent plus pending, as a MON decimal.
   */
  committedMon(agentId: string): string {
    const since = this.now() - DAY_MS;
    let wei = 0n;
    for (const r of this.state.requests) {
      const status = this.statusOf(r);
      if (r.agentId === agentId && r.createdAt >= since && (status === 'sent' || status === 'pending')) {
        wei += parseMon(r.amountMon) ?? 0n;
      }
    }
    return formatEther(wei);
  }

  /** @returns How many unanswered requests this agent has. */
  pendingCount(agentId: string): number {
    return this.state.requests.filter((r) => r.agentId === agentId && this.statusOf(r) === 'pending').length;
  }

  /** Stores a new pending request and wakes the user's phone. */
  addRequest(input: Omit<PaymentRequest, 'id' | 'status' | 'createdAt' | 'expiresAt'>): PaymentRequest {
    const t = this.now();
    const request: PaymentRequest = { id: randomUUID(), ...input, status: 'pending', createdAt: t, expiresAt: t + REQUEST_TTL_MS };
    this.state.requests.push(request);
    this.prune();
    this.save();
    this.wake(this.inboxWaiters, input.userId);
    return request;
  }

  /** @returns The request with its live status, or null when it is not this user's (or agent's). */
  request(id: string, owner: { userId?: string; agentId?: string }): PaymentRequest | null {
    const r = this.state.requests.find((x) => x.id === id);
    if (!r || (owner.userId && r.userId !== owner.userId) || (owner.agentId && r.agentId !== owner.agentId)) return null;
    return { ...r, status: this.statusOf(r) };
  }

  /** @returns The user's unanswered requests, newest first. */
  pendingFor(userId: string): PaymentRequest[] {
    return this.state.requests
      .filter((r) => r.userId === userId && this.statusOf(r) === 'pending')
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Records the user's answer. Only a pending request can change, and only once.
   * @returns The updated request, or null when it is not pending or not the user's.
   */
  // ponytail: "sent" trusts the owner's phone for the hash; the agent sees the on-chain status of that hash.
  // Verify sender, recipient and value against the transaction if requests ever come from untrusted devices.
  answer(userId: string, id: string, answer: { status: 'declined' } | { status: 'sent'; txHash: Hash }): PaymentRequest | null {
    const r = this.state.requests.find((x) => x.id === id && x.userId === userId);
    if (!r || this.statusOf(r) !== 'pending') return null;
    if (answer.status === 'sent') r.txHash = answer.txHash;
    this.setStatus(r, answer.status);
    this.save();
    return { ...r };
  }

  /** Issues a new inbox token for the user's phone; the previous one stops working. */
  rotateInbox(userId: string): string {
    const token = `orb_in_${randomBytes(32).toString('base64url')}`;
    this.state.inboxes[userId] = hashSecret(token);
    this.save();
    return token;
  }

  /** @returns The user id for an inbox token, or null. */
  inboxOwner(token: string): string | null {
    const hash = hashSecret(token);
    return Object.entries(this.state.inboxes).find(([, h]) => h === hash)?.[0] ?? null;
  }

  /**
   * Resolves on the user's next new request or after `ms`, whichever is first.
   * @returns Resolves with nothing; the caller reads `pendingFor` afterwards.
   */
  waitForRequest(userId: string, ms: number, signal?: AbortSignal): Promise<void> {
    return this.waitOn(this.inboxWaiters, userId, ms, signal);
  }

  /** Resolves when the request's status changes or after `ms`. */
  waitForStatus(requestId: string, ms: number, signal?: AbortSignal): Promise<void> {
    return this.waitOn(this.statusWaiters, requestId, ms, signal);
  }

  /** Live status: a pending request past its expiry reads as expired. */
  private statusOf(r: PaymentRequest): RequestStatus {
    return r.status === 'pending' && this.now() >= r.expiresAt ? 'expired' : r.status;
  }

  private setStatus(r: PaymentRequest, status: RequestStatus): void {
    r.status = status;
    this.wake(this.statusWaiters, r.id);
  }

  /** Keeps the file small: drops answered requests older than a week. */
  private prune(): void {
    const cutoff = this.now() - 7 * DAY_MS;
    this.state.requests = this.state.requests.filter((r) => r.createdAt >= cutoff);
  }

  private waitOn(map: Map<string, Set<() => void>>, key: string, ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      const set = map.get(key) ?? new Set();
      map.set(key, set);
      const done = () => {
        clearTimeout(timer);
        set.delete(done);
        if (set.size === 0) map.delete(key);
        resolve();
      };
      const timer = setTimeout(done, ms);
      set.add(done);
      signal?.addEventListener('abort', done, { once: true });
    });
  }

  private wake(map: Map<string, Set<() => void>>, key: string): void {
    for (const done of [...(map.get(key) ?? [])]) done();
  }

  /** Atomic write: a crash mid-write leaves the old file, never half a file. */
  private save(): void {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    // Owner-only: the file holds only hashes, but user ids and wallets are still private.
    writeFileSync(`${this.file}.tmp`, JSON.stringify(this.state), { mode: 0o600 });
    renameSync(`${this.file}.tmp`, this.file);
  }
}
