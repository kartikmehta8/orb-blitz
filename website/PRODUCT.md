# Orb

Verified source: kartikmehta8/orb at b39038210af099a56b72d1e7dcd19b9ab3afe0bf, pulled 4 November 2026. Release v1.0.0 matches that revision. Public website audience and latest-app redesign are explicitly authorized.

## Product and audience
Orb is an Android wallet with an on-demand floating overlay. A person can inspect accessible visible screen text, ask questions, prepare a native MON payment, or check common scam signals while using another app. The app has Wallet, Ask, Orb and Profile tabs, plus activity and connected-agent screens. The website introduces this to public visitors and offers the actual Android preview APK.

## Current features
- Native MON on Monad mainnet 143 and testnet 10143. Network must be named in a payment request; the wallet display toggle alone does not authorize a network.
- ENS names resolve on Ethereum and are re-resolved by the phone; MON is sent on the explicitly selected Monad network.
- Scam Shield combines deterministic signals, model assessment and recipient history checks. Labels are Looks safe, Be careful and Likely scam. A label is not a safety guarantee; the user can override warnings.
- Explicit device-side approval. Fingerprint/PIN where supported and enrolled; hold-to-confirm fallback for unavailable, unenrolled or capability-error states. Voice never approves a payment.
- Android system speech input, Hindi/English according to system settings, and optional TTS card read-aloud.
- MCP clients can request payments and inspect status. Requests wait for phone review and explicit approval. Notifications depend on the orb service running. Requests expire after ten minutes.
- Device rebuilds and checks proposed payments, then signs through the Privy embedded wallet. The agent server does not sign transactions.

## Boundaries and limitations
Accessible text is not image OCR and is not exposed by every app. Clipboard is the fallback. Native context handoff expires at 120 seconds, but included text can remain in an Ask session and is sent to the backend/model for online requests. Offline fallback means local/basic parsing without the agent server; chain checks, ENS, sign-in and payment broadcasting still require connectivity.

Current source has an agent-limit concurrency race, unfinished server wallet ownership binding, pending bookkeeping durability concerns and incomplete account-scoped local cleanup. Do not promise production-hardened agent caps, guaranteed safety, universal fingerprint enforcement or one-second settlement. Details and test evidence are in the local source audit, not the public marketing bundle.

## Website behavior
All payment, risk and agent interactions are fixtures. No wallet connects, real user message analysis, signing, RPC or payment calls occur in the website. WhatsApp, Email and Telegram are sample screen layouts, not partnerships or API integrations. Installation checklist persists locally. No analytics were added.

## Release download
v1.0.0, com.bubbleagent.app, version code 1, ARM64-only, 37,557,960 bytes. Official release recommends Android 10+; APK manifest min SDK is 24 and target SDK 35. Signature verified as Android Debug. SHA-256: 3d947eb1d5bfa4d7a86dba6b6b4b7be7914fb5b12a7638c304a4f969ecc64cd8. Online features rely on the build's configured reachable backend, not a production service commitment.

Private GitHub release cannot serve anonymous visitors. The website hosts two bounded static file parts, assembles the exact APK in the browser, verifies size and SHA-256, and offers a user-initiated Save action. Cancellation and errors do not offer a partial file. A fresh install on physical Android remains unverified.

## Brand authority
The latest app uses white #FFFFFF, ink #121314, cool surfaces #F3F4F6, blue links #3D5AFE and green/amber/red risk states. Inter UI and Roboto Mono for addresses/hashes. Preserve the original Orb glyph. This replaces the older purple chrome as explicitly requested. Continue the existing code-led website workflow, with real interactions, mobile motion controls and keyboard access.
