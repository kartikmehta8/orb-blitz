# NOTES: deviations from PLAN.md

One line each, with the reason.

## Product
- **Light mode only** (`userInterfaceStyle: light`), replacing edge case 41: the owner asked for a single, polished light theme.
- **Phase 8 (`BubbleReceipts` contract) not built**: it's optional, and deploying it needs a funded deployer key and Foundry on the day.
- **Live-model injection check (§12.1) not run yet**: no Anthropic key was available while building. The mocked-model test passes. Run it once with a real key and record the result here.

## Shared code
- **More logic in `intent.ts`**: it holds the whole `prepare_native_transfer` validation (`prepareTransfer`), so the server tool, the MCP server and the app's offline path run one implementation. The §7.6 device checks live in `app/src/validateIntent.ts`, since they need device state.
- **Byte-identical copies**: `intent.ts` and `fallbackParser.ts` are copied into both packages, and `server/test/shared.test.ts` fails if they drift.
- **Fallback parser looks at all user messages, newest first**, not just the last one. That way a tapped chip ("0.5 MON", or a full address) settles screen ambiguity across turns.
- **Fallback parser only proposes a payment when a user message asks to pay** (pay/send/transfer/tip/split/settle/give/refund). Spec rule 3 ("only propose a payment when the user asks") applies offline too.
- **All-uppercase hex addresses count as unchecksummed** (like all-lowercase). Only mixed case must carry a valid EIP-55 checksum.
- **`CLOSE_TO_DAILY_LIMIT` fires when the amount is at least 80% of today's remaining allowance.**

## Server
- **Build is `tsc --noEmit` + esbuild bundle**: the shared files use extensionless imports, which Metro needs and plain Node ESM output can't load.
- **`src/tools/tool.ts` added**: it holds the shared tool types, to break an import cycle between the registry and the tools.
- **`max_tokens` 1024 with `effort: 'low'`**: Haiku 5.5 thinks adaptively, and thinking counts toward `max_tokens`.
- **Model failure → 200 with `meta.fallback: true`**, not 5xx. Intents already created by tools are returned as-is (edge 38).
- **Read retries use viem's exponential backoff (300/600/1200 ms)** instead of 300/900/2000. Sends go through Privy and are never retried.
- **Rate limit is one fixed 60 s window**, since there's a single shared token.
- **Server refuses to start without `AGENT_TOKEN`**, in any environment.
- **MCP `MCP_DAILY_MON` is a static cap** with no spend tracking. MCP `context` is treated as source `clipboard`.

## Native
- **Translucent theme items go on the splash theme too**: the manifest theme decides window translucency. Cost: Android 12+ skips the system splash on cold start.
- **Bubble service starts hidden**: the AppState listener shows it when the app goes to background, so it never flashes over Home.
- **Stopping from the bubble or notification keeps the "enabled" preference**: the next app open restarts the bubble, which matches the toast copy. Only Home's Stop turns it off.
- **Bubble margins use fixed dp, not WindowInsets** (marked with a `ponytail:` comment).
- **Accessibility nodes aren't `recycle()`d**: it's a no-op on API 33+, and below that it only loses pooling.

## App
- **Ask sheet animates itself** (scrim fade + spring) with screen `animation: 'none'`: `slide_from_bottom` would also slide the scrim.
- **Warm-start deep link**: `ask.tsx` resets the stack to `[ask]` instead of `router.replace`, so no opaque Home sits under the sheet.
- **Server intents are rebuilt on device**: only `{id, to, amountWei}` comes from the server. Everything else is recomputed with `prepareTransfer`.
- **Intent marked executed right before `sendTransaction`**: it can never be sent twice. A failed send means asking again.
- **Single pending slot** storing `{hash, intentId, to, amountWei, sentAt}`. Confirm is blocked while a payment is pending.
- **429 counts as offline; other 4xx or a malformed body means "bad response"**, and both use the basic parser. 401 shows the auth error.
- **A device PIN counts as enrolled** for the system prompt. Hold-to-confirm (1.5 s) is used only when nothing is enrolled.
- **Privy confirmation UI**: headless `@privy-io/expo` shows none, so biometric/hold is the only prompt. Verify on a device.
