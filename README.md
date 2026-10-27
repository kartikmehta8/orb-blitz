# Orb

**Pay anyone you see on your screen.** A floating orb sits over every Android app. Tap it in WhatsApp, X or Telegram, say "pay this", confirm with your fingerprint, and the MON settles on Monad testnet in about a second. You never leave the app you were in.

```
┌──────────────────────────── Android phone ─────────────────────────────┐
│  Any app (WhatsApp, X…)          BubbleService (foreground service)    │
│        ▲                         └─ overlay window: draggable orb      │
│        │ reads visible text            │ tap                           │
│  ScreenReaderService ◄─captureNow()────┘                               │
│        │ ScreenContextStore (120 s)     │ bubbleagent://ask?ctx=<id>   │
│        └──────────────► Expo app (translucent) ─ / Home   ─ /ask sheet │
│                               │  Privy embedded wallet (signs locally) │
└───────────────────────────────┼────────────────────────────────────────┘
                                │ HTTPS (bearer token)
                   Agent server (Node, Hono) → Claude tool loop
                   tools: balance · inspect_address · prepare_native_transfer
                          · get_tx_status · ask_user   (read-only RPC)
```

| Path | What |
|---|---|
| `app/` | Expo SDK 53 app: `app/` routes, `src/` logic and components, `modules/bubble-overlay/` Kotlin module, `plugins/` config plugin |
| `server/` | Agent server and MCP server, with vitest tests |
| `PLAN.md` | Full spec |
| `NOTES.md` | Deviations from the spec |

## 1. Prerequisites

- Node 20.12+, pnpm (app), npm (server)
- Android Studio with the Android SDK and JDK 17, and a physical Android 10+ phone with USB debugging (`adb devices` lists it)
- A Privy app ([dashboard.privy.io](https://dashboard.privy.io)):
  - Turn on email login.
  - Set "create embedded wallets on login" to EVM.
  - Add `com.bubbleagent.app` as an allowed Android app identifier.
- An Anthropic API key. Optional: without one, the server uses the basic parser.
- `ngrok` (free account), to reach your laptop from the phone. Your free dev domain is under ngrok dashboard → Domains, and it stays the same across restarts, so the URL baked into the app never goes stale.

## 2. Run the agent server

```bash
cd server
npm install
cp .env.example .env        # set ANTHROPIC_API_KEY and a long random AGENT_TOKEN
npm test                    # 79 tests
npm run dev                 # http://localhost:8787
ngrok http --url=<your-domain>.ngrok-free.dev 8787   # in a second terminal
```

Smoke test: `curl -s localhost:8787/health`. The full curl request is in [server/README.md](server/README.md).

## 3. Run the app on your phone

```bash
cd app
pnpm install
cp .env.example .env        # Privy IDs, https://<your-domain>.ngrok-free.dev as EXPO_PUBLIC_AGENT_URL, same AGENT_TOKEN
pnpm android                # expo run:android: prebuilds android/ and installs a dev build
```

Release APK for the demo (no Metro needed):

```bash
pnpm android:release
# or: cd android && ./gradlew assembleRelease && adb install -r app/build/outputs/apk/release/app-release.apk
```

`android/` is generated (Continuous Native Generation). Never edit it by hand. Native changes go in `modules/bubble-overlay` and `plugins/`.

## 4. Test it end to end

1. **Home → sign in** with your email and the 6-digit code. The wallet address and balance appear. Tap **Get testnet MON** to fund it.
2. **Permissions:** tap each **Fix** button:
   - Display over other apps (required)
   - Accessibility → "Orb screen reader"
   - Notifications
   - Battery
3. **Orb tab → turn the orb on.** Leave the app; the orb appears on the right edge.
4. In WhatsApp, Keep or any notes app, show the text `dinner was 0.2 MON, send to 0x<teammate address>`. Tap the orb.
5. The sheet opens with the app still visible behind it and **Reading: WhatsApp · N chars**. Tap **Pay this**, check the card, tap **Confirm**, and pass the biometric prompt. The card shows **Confirmed in N ms** with an explorer link.
6. Close the sheet. You're back in the app and the orb reappears.

More checks:
- "My balance", or "What is this address?" with an address on screen.
- Two addresses on screen gives chips to choose from.
- Stop the server and repeat "pay this": "Agent offline. Using basic parser." still produces a card.
- Long-press the orb to stop it.

The full device checklist is in `PLAN.md` §12.3.

## Permissions and why

| Permission | Why |
|---|---|
| Display over other apps | Draws the orb. Required. |
| Accessibility ("Orb screen reader") | Reads visible text **only at the moment you tap the orb**. Without it, use the clipboard. |
| Notifications (Android 13+) | The foreground-service notification that keeps the orb alive. |
| Battery optimisation exemption | Stops the OS from killing the orb. |

- **Restricted settings (Android 13+):** if you sideloaded the APK from a browser or file manager, enable accessibility via App info → ⋮ → **Allow restricted settings**. `adb install` and `expo run:android` aren't affected.
- **Xiaomi / Redmi / POCO / Realme / Oppo / Vivo:** enable **Autostart** and **Display pop-up windows while running in background** in App info → Other permissions.

## Security and privacy

- Keys stay on the device in the Privy embedded wallet. The server can only *propose* intents, and the app rebuilds every proposed intent locally before showing it.
- Every payment needs an explicit Confirm plus a biometric check (or a 1.5 s hold when no biometric or PIN is enrolled). Per-transaction and daily caps (defaults 1 / 5 MON, hard max 10) are enforced on both the server and the device.
- Recipients must appear on screen or in your message (provenance check). The model can't introduce addresses. Screen text is wrapped as untrusted data, and prompt-injection is covered by tests.
- The screen is read only at the moment of a tap, never in the background. You can see and exclude the captured text before sending. Captures live in memory for at most 120 s.
- Screen text goes to the agent server and the LLM provider. Nothing is stored server-side, and logs contain lengths and masked addresses only.
- Testnet only: chain 10143 is enforced by the server, by local validation, and by a wallet chain check before signing.
- **Demo-grade limitations:** `EXPO_PUBLIC_AGENT_TOKEN` is bundled into the APK, and the default RPC is the public one.

## Known limitations

- Android only, Monad testnet only, native MON only. No fiat amounts and no ENS names.
- Light theme only.
- See `NOTES.md` for every deviation from the spec.

## MCP (optional)

The same tools are available to Claude Desktop through `server/dist/mcp.js`. Setup is in [server/README.md](server/README.md).

## Team

_Add team members here._
