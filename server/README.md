# Orb agent server

Agent backend for the Orb Android app. It holds the LLM key, runs a Claude tool loop and returns
**proposed** native MON transfers (intents) on Monad mainnet (chain 143) or testnet (chain 10143). It never
holds user keys and never signs or sends. It also serves connected agents over MCP (`/mcp`) and the phone's
notification inbox (`/inbox/wait`).

## Run

```bash
cp .env.example .env      # set ANTHROPIC_API_KEY and PRIVY_APP_ID
npm install
npm run dev               # tsx watch, http://localhost:8787
npm test                  # vitest, no network
npm run typecheck
npm run build && npm start
```

Node 22.12+. `.env` in the working directory is loaded on start.

| Env | Default | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | (none) | Without it every request uses the regex fallback parser. |
| `ANTHROPIC_MODEL` | `claude-haiku-5-5` | `claude-sonnet-5-5` if extraction quality is poor. |
| `PRIVY_APP_ID` | (required) | App id. Access tokens are ES256 JWTs checked against `https://auth.privy.io/api/v1/apps/<PRIVY_APP_ID>/jwks.json`, issuer `privy.io`, audience this id, `exp` enforced. Missing in the default mode exits at startup. |
| `AUTH_MODE` | `privy` | Set to `token` only for a local shared-bearer escape hatch. Any other value exits. |
| `AGENT_TOKEN` | (only if `AUTH_MODE=token`) | Shared bearer. Refuses to start if unset in token mode, or `change-me` with `NODE_ENV=production`. Not read by the app. |
| `MONAD_RPC_URL` | `https://testnet-rpc.monad.xyz` | Testnet, read-only; reads retry 3 times with backoff. |
| `MONAD_MAINNET_RPC_URL` | `https://rpc.monad.xyz` | Mainnet, read-only. |
| `ENS_RPC_URL` | `https://ethereum-rpc.publicnode.com` | Ethereum mainnet, for ENS names only. |
| `AGENTS_FILE` | `data/agents.json` | Connected agents, requests and inbox tokens (hashes only, mode 0600). |
| `PORT` | `8787` | |

### Tunnel to the phone

Expose the local server with a stable free ngrok dev domain, then set the app's `EXPO_PUBLIC_AGENT_URL` to it:

```bash
ngrok http --url=<your-domain>.ngrok-free.dev 8787
```

## API

- `GET /health` → `{ ok: true, chainIds: [10143, 143], model }` (no auth)
- `POST /v1/agent` with `Authorization: Bearer <Privy access token>` → `{ requestId, reply, intents, clarification, meta }`

The bearer is the user's Privy access token (`sub` is the rate-limit key, 30 requests per minute). In `AUTH_MODE=token` the bearer is `AGENT_TOKEN` and every caller shares one bucket.

Errors: 401 bad or missing token, 429 over 30 req/min, 413 body over 32 KB, 400 `{ error: 'BAD_REQUEST', message }`
on schema failure, 500 `{ error: 'INTERNAL' }`. Model failure, no API key, or the 25 s deadline fall back to the
regex parser (`meta.fallback: true`); the HTTP status stays 200.

An intent may include `memo` (display-only, at most 80 characters, no address). Example: "send 1 MON to Rahul for dinner" yields `memo: "dinner"`. The memo is not written on-chain and does not change `to` or `amountWei`.

A valid token proves the Privy user. It does not prove `wallet.address` belongs to that user; that needs the Privy app secret, which this server does not hold.

Smoke test:

```bash
curl -s $AGENT_URL/v1/agent -H "Authorization: Bearer $PRIVY_ACCESS_TOKEN" -H 'content-type: application/json' -d '{
  "requestId":"t1",
  "messages":[{"role":"user","text":"pay this"}],
  "context":{"source":"screen","appLabel":"WhatsApp","text":"dinner was 0.2 MON, send to 0x<TEAMMATE_ADDRESS>","capturedAt":0},
  "wallet":{"address":"0x<YOUR_ADDRESS>","chainId":10143},
  "limits":{"perTxMon":"1","dailyRemainingMon":"5"}
}' | jq
```

Expected: one intent, `provenance.source = "screen"`, a one- or two-sentence reply.

## MCP (Claude Code, Codex)

Agents connect over HTTP to `/mcp` with a per-agent key created on the phone (Profile → Agents). See the
"Connect an AI agent" section of the root README. The old stdio server (`dist/mcp.js`) is gone: it could only
propose intents for a fixed wallet, and the HTTP server covers that with real limits and phone approval.

## Security and privacy

- Keys stay on the device. The server can only propose intents, and only via `prepare_native_transfer`,
  which checks address, provenance (the recipient must appear in the screen text or a user message),
  amount, per-tx and daily caps, gas and balance. Model text is never turned into an intent.
- Screen text is wrapped in `<screen>` with `<`, `>`, `&`, `"` escaped and the prompt treats it as untrusted.
- Chat requests are not stored. Connected agents are: `AGENTS_FILE` keeps agent records, their payment
  requests (one week) and inbox tokens, with every key and token stored only as a SHA-256 hash.
- Logs are one JSON line per request (`/v1/*`, `/mcp`, `/inbox/*`): request id, latency, tool names, intent
  count, fallback flag, error codes, context length, agent id, and addresses as first/last 4 characters only.
- A payment's network is never defaulted: it must be named by the user ("mainnet" or "testnet"), checked on
  the server and again on the phone. `wallet.chainId` (10143 or 143) is only the network the wallet screen shows.
- An agent's `reason` goes through the memo sanitizer (80 characters, no addresses, no control characters)
  before it reaches a notification or the review card.
- The rate limit is in-process memory, one window per Privy user id. The access token is not a secret baked into the APK; the wallet-binding gap above is the remaining auth limitation.
