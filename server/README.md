# Bubble Agent server

Agent backend for the Bubble Agent Android app. It holds the LLM key, runs a Claude tool loop and returns
**proposed** native MON transfers (intents) on Monad testnet (chain 10143). It never holds user keys and
never signs or sends.

## Run

```bash
cp .env.example .env      # set ANTHROPIC_API_KEY and AGENT_TOKEN
npm install
npm run dev               # tsx watch, http://localhost:8787
npm test                  # vitest, no network
npm run build && npm start
cloudflared tunnel --url http://localhost:8787   # expose to the phone
```

Node 20.12+. `.env` in the working directory is loaded on start.

| Env | Default | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | (none) | Without it every request uses the regex fallback parser. |
| `ANTHROPIC_MODEL` | `claude-haiku-5-5` | `claude-sonnet-5-5` if extraction quality is poor. |
| `AGENT_TOKEN` | (required) | Bearer token shared with the app. Refuses to start if unset, or `change-me` with `NODE_ENV=production`. |
| `MONAD_RPC_URL` | `https://testnet-rpc.monad.xyz` | Read-only; reads retry 3× with backoff. |
| `PORT` | `8787` | |

## API

- `GET /health` → `{ ok: true, chainId: 10143, model }` (no auth)
- `POST /v1/agent` with `Authorization: Bearer $AGENT_TOKEN` → `{ requestId, reply, intents, clarification, meta }`

Errors: 401 bad/missing token, 429 over 30 req/min, 413 body over 32 KB, 400 `{ error: 'BAD_REQUEST', message }`
on schema failure, 500 `{ error: 'INTERNAL' }`. Model failure, no API key, or the 25 s deadline fall back to the
regex parser (`meta.fallback: true`); the HTTP status stays 200.

Smoke test:

```bash
curl -s $AGENT_URL/v1/agent -H "Authorization: Bearer $AGENT_TOKEN" -H 'content-type: application/json' -d '{
  "requestId":"t1",
  "messages":[{"role":"user","text":"pay this"}],
  "context":{"source":"screen","appLabel":"WhatsApp","text":"dinner was 0.2 MON, send to 0x<TEAMMATE_ADDRESS>","capturedAt":0},
  "wallet":{"address":"0x<YOUR_ADDRESS>","chainId":10143},
  "limits":{"perTxMon":"1","dailyRemainingMon":"5"}
}' | jq
```

Expected: one intent, `provenance.source = "screen"`, a one- or two-sentence reply.

## MCP (Claude Desktop)

`npm run build`, then add to `claude_desktop_config.json`:

```json
{ "mcpServers": { "bubble-agent": { "command": "node", "args": ["/abs/path/server/dist/mcp.js"],
  "env": { "MONAD_RPC_URL": "https://testnet-rpc.monad.xyz", "MCP_WALLET_ADDRESS": "0x...",
           "MCP_PER_TX_MON": "1", "MCP_DAILY_MON": "5" } } } }
```

Tools: `get_wallet_balance`, `inspect_address`, `get_tx_status`, `prepare_native_transfer` (takes an extra
`context` string: the text containing the recipient, used for the provenance check). It returns intent JSON
only; confirming and signing happen on the phone.

## Security and privacy

- Keys stay on the device. The server can only propose intents, and only via `prepare_native_transfer`,
  which checks address, provenance (the recipient must appear in the screen text or a user message),
  amount, per-tx and daily caps, gas and balance. Model text is never turned into an intent.
- Screen text is wrapped in `<screen>` with `<`, `>`, `&`, `"` escaped and the prompt treats it as untrusted.
- Nothing is stored. Logs are one JSON line per request: request id, latency, tool names, intent count,
  fallback flag, error codes, context length, and addresses as first/last 4 characters only.
- Testnet only; `wallet.chainId` must be 10143.
- Demo-grade: the bearer token is bundled in the APK; the rate limit is in-process memory.
