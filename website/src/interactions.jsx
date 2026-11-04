import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import TiltedCard from "./react-bits/TiltedCard.jsx";
import "./site.css";
import release from "../release.json";

const Icon = ({ name, ...props }) => (
  <svg className="icon" aria-hidden="true" {...props}>
    <use href={`/assets/icons.svg#${name}`} />
  </svg>
);
const Mark = () => (
  <span className="brand-mark" aria-hidden="true">
    <img src="/assets/orb-glyph.svg" alt="" />
  </span>
);
let inputMode = "pointer";
const media = window.matchMedia("(prefers-reduced-motion: reduce)");
function useMotion() {
  const [off, setOff] = useState(
    media.matches || document.documentElement.dataset.motion === "off",
  );
  useEffect(() => {
    const update = () =>
      setOff(
        media.matches || document.documentElement.dataset.motion === "off",
      );
    media.addEventListener("change", update);
    window.addEventListener("orb-motion", update);
    return () => {
      media.removeEventListener("change", update);
      window.removeEventListener("orb-motion", update);
    };
  }, []);
  return !off;
}
function useReveal(ref, key, motion) {
  useEffect(() => {
    if (!ref.current || !motion || inputMode === "keyboard") return;
    const animation = ref.current.animate(
      [
        { opacity: 0.6, transform: "translateY(5px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: 180, easing: "cubic-bezier(.22,1,.36,1)" },
    );
    return () => animation.cancel();
  }, [key, motion]);
}
const APPS = [
  {
    name: "WhatsApp",
    icon: "brand-whatsapp",
    person: "Priya",
    initial: "P",
    context: "Coffee crew",
    message:
      "Coffee was a good call. Your half is 0.2 MON. Send it to kartik.eth on testnet?",
    reply: "On it. Let me ask Orb.",
    amount: "0.2",
    memo: "Coffee, covered.",
  },
  {
    name: "Email",
    icon: "mail",
    person: "Arjun",
    initial: "A",
    context: "Design review",
    message:
      "Thanks for the design review! Please send 0.8 MON to kartik.eth on testnet for the session.",
    reply: "One less tab to open.",
    amount: "0.8",
    memo: "Design review, settled.",
  },
  {
    name: "Telegram",
    icon: "brand-telegram",
    person: "Maya",
    initial: "M",
    context: "Weekend plans",
    message:
      "You found the spot! Sending a little thank-you: 0.1 MON to kartik.eth on testnet.",
    reply: "A little thanks, right here.",
    amount: "0.1",
    memo: "A little thank-you.",
  },
];
function Playground() {
  const [app, setApp] = useState(0),
    [phase, setPhase] = useState("screen"),
    [step, setStep] = useState(0),
    [keyboard, setKeyboard] = useState(false),
    [spin, setSpin] = useState(false),
    [tour, setTour] = useState(false);
  const motion = useMotion(),
    phone = useRef(null),
    timer = useRef(null),
    sheet = useRef(null),
    a = APPS[app];
  useReveal(sheet, phase, motion);
  const clear = () => {
    clearTimeout(timer.current);
    timer.current = null;
  };
  const reset = (index = app) => {
    clear();
    setApp(index);
    setPhase("screen");
    setStep(0);
    setSpin(false);
    setTour(false);
  };
  useEffect(() => () => clear(), []);
  useEffect(() => {
    if (!motion || keyboard) setSpin(false);
  }, [motion, keyboard]);
  useEffect(() => {
    const key = (e) => {
      if (!["Shift", "Control", "Alt", "Meta"].includes(e.key)) {
        setKeyboard(true);
        setSpin(false);
      }
      if (e.key === "Escape") reset();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [app]);
  useEffect(() => {
    const el = phone.current;
    if (!spin || !el) return;
    const anim = el.animate(
      [{ transform: "rotateY(0deg)" }, { transform: "rotateY(360deg)" }],
      { duration: 900, easing: "cubic-bezier(.22,1,.36,1)" },
    );
    anim.onfinish = () => setSpin(false);
    return () => anim.cancel();
  }, [spin]);
  const scan = (guided = false) => {
    clear();
    setPhase("scanning");
    setStep(1);
    setTour(guided);
    timer.current = setTimeout(() => {
      setPhase("review");
      setStep(2);
      if (guided) timer.current = setTimeout(() => pay(), 1800);
    }, 650);
  };
  const pay = () => {
    clear();
    setTour(false);
    setPhase("processing");
    timer.current = setTimeout(() => {
      setPhase("success");
      if (
        motion &&
        !keyboard &&
        window.matchMedia("(max-width:767px)").matches &&
        !document.hidden
      )
        setSpin(true);
    }, 700);
  };
  const tryStep = (index) => {
    setStep(index);
    if (index === 0) reset();
    if (index === 1) scan();
    if (index === 2) {
      clear();
      setPhase("review");
    }
  };
  return (
    <div className="playground" onPointerDown={() => setKeyboard(false)}>
      <div className="playground-top">
        <span>
          <span className="status-dot" /> Your apps. One Orb.
        </span>
        <span className="demo-label">Interactive demo · no funds sent</span>
      </div>
      <div className="playground-grid">
        <div className="screen-context">
          <div className="app-picker" role="group" aria-label="Sample app">
            {APPS.map((item, i) => (
              <button
                key={item.name}
                aria-label={item.name}
                aria-pressed={app === i}
                onClick={() => reset(i)}
              >
                <Icon name={item.icon} />
                <span>{item.name}</span>
              </button>
            ))}
          </div>
          <div className="chat-desktop" aria-hidden="true">
            <div className="chat-title">
              <span className="avatar">{a.initial}</span>
              <div>
                <b>{a.person}</b>
                <small>{a.context}</small>
              </div>
              <Icon name={a.icon} />
            </div>
            <div className="chat-message">
              {a.message}
              <small>9:40</small>
            </div>
            <div className="chat-reply">
              {a.reply}
              <Icon name="checks" />
            </div>
            <p>Payment details are already here.</p>
            <span className="screen-doodle">
              <Icon name="corner-right-down" /> So is your wallet.
            </span>
          </div>
          <div className="screen-note">
            <Icon name="info-circle" />
            <p>
              Sample screens, not app integrations. Orb reads accessible text
              when you tap, or uses copied text.
            </p>
          </div>
        </div>
        <div className="phone-stage">
          <TiltedCard
            containerHeight="640px"
            containerWidth="310px"
            imageHeight="640px"
            imageWidth="310px"
            radius={38}
            rotateAmplitude={motion && !keyboard && !spin ? 5 : 0}
            scaleOnHover={motion && !keyboard && !spin ? 1.008 : 1}
            glare={0}
            shadow={0}
            gyroscope={false}
            floating={motion && !keyboard && !spin}
            intro={false}
            flipOnClick={false}
            className="demo-depth"
          >
            <div className="phone-rotation" ref={phone} data-celebrating={spin}>
              <div className="phone-back" aria-hidden="true">
                <Mark />
                <span>Back to what matters.</span>
              </div>
              <div className="phone">
                <div className="phone-status">
                  <b>9:41</b>
                  <span className="camera" />
                  <span>
                    <Icon name="antenna-bars-5" />
                    <Icon name="wifi" />
                    <Icon name="battery-3" />
                  </span>
                </div>
                <div className="phone-app">
                  <div className="phone-app-header">
                    <Icon name="chevron-left" />
                    <span className="avatar">{a.initial}</span>
                    <div>
                      <b>{a.person}</b>
                      <small>
                        {a.name === "Email" ? "arjun@example.test" : "online"}
                      </small>
                    </div>
                    <Icon name={a.icon} />
                  </div>
                  <div className="phone-chat">
                    <small>Today</small>
                    <div className="chat-message">
                      {a.message}
                      <small>9:40</small>
                    </div>
                    <div className="chat-reply">{a.reply}</div>
                    <div className="composer">
                      <span>
                        {a.name === "Email" ? "Write a reply…" : "Message…"}
                      </span>
                      <Icon name="microphone" />
                    </div>
                  </div>
                </div>
                {phase === "screen" ? (
                  <button
                    className="floating-orb"
                    onClick={() => scan()}
                    aria-label="Tap Orb to scan sample screen"
                  >
                    <Mark />
                  </button>
                ) : (
                  <div className="payment-sheet" ref={sheet} key={phase}>
                    <div className="sheet-handle" />
                    <div className="sheet-header">
                      <span>
                        <Mark />
                        <b>Orb</b>
                        <span className="testnet">Testnet</span>
                      </span>
                      <button
                        className="icon-button"
                        aria-label="Close sample payment"
                        onClick={() => reset()}
                      >
                        <Icon name="x" />
                      </button>
                    </div>
                    {phase === "scanning" || phase === "processing" ? (
                      <div className="phone-loading" role="status">
                        <Icon
                          name={phase === "scanning" ? "scan" : "loader-2"}
                        />
                        <h3>
                          {phase === "scanning"
                            ? "Reading the sample…"
                            : "Simulating approval…"}
                        </h3>
                        <p>
                          {phase === "scanning"
                            ? "Finding the amount, recipient and network."
                            : "This demo never sends a transaction."}
                        </p>
                      </div>
                    ) : phase === "success" ? (
                      <div className="phone-success" role="status">
                        <span className="success-check">
                          <Icon name="check" />
                        </span>
                        <h3>All set.</h3>
                        <p>{a.amount} MON to kartik.eth</p>
                        <div className="receipt">
                          <b>{a.memo}</b>
                          <small>Payment simulated · Monad testnet</small>
                        </div>
                        <button
                          className="button"
                          onClick={async (e) => {
                            const btn = e.currentTarget;
                            try {
                              await navigator.clipboard.writeText(
                                `Orb demo receipt — ${a.amount} MON to kartik.eth on Monad testnet. SIMULATED. No funds sent.`,
                              );
                              btn.textContent = "Sample receipt copied";
                            } catch {
                              btn.textContent = "Clipboard unavailable";
                            }
                          }}
                        >
                          Copy sample receipt <Icon name="copy" />
                        </button>
                        <button className="text-button" onClick={() => reset()}>
                          Try it again <Icon name="refresh" />
                        </button>
                        <small>Demo receipt only. Nothing was sent.</small>
                      </div>
                    ) : (
                      <div className="phone-review">
                        <p className="review-caption">Review payment</p>
                        <h3>
                          {a.amount} <span>MON</span>
                        </h3>
                        <p>
                          to <strong>kartik.eth</strong>
                        </p>
                        <span className="mono">0x7a…9B2e · sample address</span>
                        <div className="risk-label safe">
                          <Icon name="shield-check" />
                          <b>Looks safe</b>
                        </div>
                        <dl>
                          <div>
                            <dt>Network</dt>
                            <dd>Monad testnet</dd>
                          </div>
                          <div>
                            <dt>For</dt>
                            <dd>{a.memo}</dd>
                          </div>
                        </dl>
                        <button className="button" onClick={pay}>
                          <Icon name="fingerprint" /> Simulate payment
                        </button>
                        <button className="text-button" onClick={() => reset()}>
                          Cancel
                        </button>
                        <small>Illustrative review. No wallet connected.</small>
                      </div>
                    )}
                  </div>
                )}
                <div className="home-indicator" />
              </div>
            </div>
          </TiltedCard>
          <div className="phone-caption">
            <span className="status-dot" />
            {phase === "screen"
              ? "Tap the floating Orb to try it."
              : phase === "success"
                ? "That’s the flow. You stay in control."
                : "A sample payment. Your next move."}
          </div>
        </div>
        <aside className="playground-rail">
          <div>
            <Icon name="scan" />
            <h3>
              See it.
              <br />
              Pay it.
            </h3>
            <p>From a message to a review, without the app shuffle.</p>
          </div>
          <div className="rail-safety">
            <span className="risk-label safe">
              <Icon name="shield-check" /> Looks safe
            </span>
            <p>Risk signals travel with the payment.</p>
            <a href="#scam-shield" className="text-link">
              Meet Scam Shield <Icon name="arrow-up-right" />
            </a>
          </div>
          <div className="rail-agent">
            <span className="agent-mini">
              <Icon name="terminal-2" /> Agent request
            </span>
            <p>“Pay 0.1 MON for API credits.”</p>
            <span>Waiting for your approval</span>
          </div>
        </aside>
      </div>
      <div className="demo-bottom">
        <div className="demo-steps" aria-label="Demo stages">
          {["Screen", "Read", "Review"].map((label, i) => (
            <button
              key={label}
              aria-pressed={step === i}
              onClick={() => tryStep(i)}
            >
              <span>{i + 1}</span>
              {label}
            </button>
          ))}
        </div>
        <button
          className="text-button"
          onClick={() => (tour ? reset() : scan(true))}
        >
          <Icon name={tour ? "player-stop" : "player-play"} />
          {tour ? "Stop walkthrough" : "Play walkthrough"}
        </button>
      </div>
    </div>
  );
}
const SAFETY = [
  {
    label: "Coffee split",
    status: "Looks safe",
    kind: "safe",
    icon: "shield-check",
    message:
      "Your half is 0.2 MON. Send it to kartik.eth on testnet for coffee?",
    signals: [
      "No common warning signs in this sample.",
      "Still check the recipient, amount and network.",
    ],
  },
  {
    label: "Urgent message",
    status: "Be careful",
    kind: "warning",
    icon: "alert-triangle",
    message:
      "Support here. Act now or your wallet will be blocked. Open this short link immediately.",
    signals: [
      "Urgency pressures you to act quickly.",
      "The sender claims to be support.",
      "A shortened link hides the destination.",
    ],
  },
  {
    label: "Refund trap",
    status: "Likely scam",
    kind: "danger",
    icon: "shield-x",
    message:
      "To receive your refund, install AnyDesk and pay a 10 MON processing fee. Share your recovery phrase to verify.",
    signals: [
      "Asks for a secret recovery phrase.",
      "Requests remote-access software.",
      "Asks you to pay to receive money.",
    ],
  },
];
function Shield() {
  const [active, setActive] = useState(1),
    s = SAFETY[active],
    ref = useRef(null),
    motion = useMotion();
  useReveal(ref, active, motion);
  return (
    <div className="shield-lab">
      <div className="shield-message">
        <div className="chips" role="group" aria-label="Safety examples">
          {SAFETY.map((x, i) => (
            <button
              key={x.label}
              aria-pressed={i === active}
              onClick={() => setActive(i)}
            >
              {x.label}
            </button>
          ))}
        </div>
        <Icon name="message-circle" />
        <blockquote>“{s.message}”</blockquote>
        <p className="fine">Sample message · not a live scan</p>
      </div>
      <div
        className={`shield-verdict ${s.kind}`}
        key={s.kind}
        ref={ref}
        aria-live="polite"
      >
        <span className="verdict-symbol">
          <Icon name={s.icon} />
        </span>
        <h3>{s.status}</h3>
        <ul>
          {s.signals.map((x) => (
            <li key={x}>
              <Icon name="arrow-up-right" />
              {x}
            </li>
          ))}
        </ul>
        <p>
          {s.kind === "danger"
            ? "Orb makes “Don’t pay” the primary choice. You can still override it."
            : "Orb explains the signals. The decision stays yours."}
        </p>
      </div>
    </div>
  );
}
const CLIENTS = ["Claude Code", "Codex", "Other MCP"];
function Agents() {
  const [client, setClient] = useState(0),
    [state, setState] = useState("idle"),
    [copy, setCopy] = useState(false);
  const snippet =
    client === 0
      ? 'claude mcp add-json orb \'{"type":"http","url":"https://your-orb-server.example/mcp","headers":{"Authorization":"Bearer <your-agent-key>"}}\''
      : client === 1
        ? `export ORB_AGENT_KEY='<your-agent-key>'\ncodex mcp add orb --url https://your-orb-server.example/mcp --bearer-token-env-var ORB_AGENT_KEY`
        : '{"url":"https://your-orb-server.example/mcp","headers":{"Authorization":"Bearer <your-agent-key>"}}';
  return (
    <div className="agent-workspace">
      <div className="agent-terminal">
        <div className="terminal-top">
          <span>
            <i />
            <i />
            <i />
          </span>
          <span>Connect your client</span>
        </div>
        <div className="agent-picker" role="group" aria-label="MCP client">
          {CLIENTS.map((x, i) => (
            <button
              key={x}
              aria-pressed={client === i}
              onClick={() => {
                setClient(i);
                setCopy(false);
              }}
            >
              {x}
            </button>
          ))}
        </div>
        <pre>
          <code>{snippet}</code>
        </pre>
        <button
          className="terminal-copy"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(snippet);
              setCopy(true);
            } catch {
              setCopy(false);
            }
          }}
        >
          <Icon name={copy ? "check" : "copy"} />
          {copy ? "Copied" : "Copy template"}
        </button>
        <p>
          Connect in Profile → Agents. Use your reachable server URL and the key
          shown once on your phone. These templates contain placeholders.
        </p>
        <div className="agent-limit">
          <span>Per-payment limit</span>
          <b>0.5 MON</b>
          <span>Rolling 24h limit</span>
          <b>1 MON</b>
        </div>
        <small>Example configuration · preview limits need hardening</small>
      </div>
      <div className="agent-approval">
        <div className="agent-path">
          <Icon name="terminal-2" />
          <span />
          <Mark />
          <span />
          <Icon name="device-mobile" />
        </div>
        <span className="agent-mini">
          {state === "idle"
            ? "Ready to ask"
            : state === "pending"
              ? "Request on your phone"
              : state === "declined"
                ? "Request declined"
                : "Sample approved"}
        </span>
        <h3>
          {state === "idle"
            ? "A request, not a blank cheque."
            : state === "pending"
              ? "API credits. 0.1 MON."
              : "Your decision makes the difference."}
        </h3>
        <p>
          {state === "idle"
            ? "Try a local example of an agent requesting payment. No key or wallet required."
            : state === "pending"
              ? "Claude asks to pay kartik.eth on Monad testnet. On your phone, you would review the recipient and risk signals before approving."
              : state === "declined"
                ? "The agent sees a declined request. Nothing was sent."
                : "The agent would receive a transaction status. This example sends no funds."}
        </p>
        {state === "pending" ? (
          <div className="actions">
            <button className="button" onClick={() => setState("approved")}>
              Simulate approval <Icon name="check" />
            </button>
            <button
              className="text-button"
              onClick={() => setState("declined")}
            >
              Decline
            </button>
          </div>
        ) : (
          <button
            className="button secondary"
            onClick={() => setState(state === "idle" ? "pending" : "idle")}
          >
            {state === "idle" ? "Try an agent request" : "Reset example"}
            <Icon name="arrow-up-right" />
          </button>
        )}
        <small>Illustrative MCP flow. No live agent connected.</small>
      </div>
    </div>
  );
}
const STEPS = [
  {
    title: "Bring the details into view.",
    body: "Open a message, email or another screen with an amount and recipient. If an app hides its text from accessibility, copy the details instead.",
    icon: "message-circle",
    preview: "“Send 0.2 MON to kartik.eth on testnet.”",
  },
  {
    title: "Tap the little Orb.",
    body: "Orb reads accessible visible text on demand. Ask “pay this” or “is this safe?” You can inspect and exclude the captured text.",
    icon: "scan",
    preview: "Amount  0.2 MON\nRecipient  kartik.eth\nNetwork  Monad testnet",
  },
  {
    title: "Review before you approve.",
    body: "Check the network, recipient, amount and Scam Shield signals. The phone rebuilds the proposal and asks for your explicit approval.",
    icon: "fingerprint",
    preview:
      "Review payment\n0.2 MON → kartik.eth\nLooks safe · Check every detail",
  },
  {
    title: "Get back to the conversation.",
    body: "Orb signs on your device and shows the transaction status. Confirmation time depends on the network; this website only simulates it.",
    icon: "check",
    preview: "All set.\nPayment simulated\nNo funds sent.",
  },
];
function How() {
  const [index, setIndex] = useState(0),
    s = STEPS[index];
  const start = useRef(null);
  return (
    <div
      className="how-demo"
      onTouchStart={(e) => {
        start.current =
          e.touches.length === 1
            ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
            : null;
      }}
      onTouchEnd={(e) => {
        if (!start.current || e.changedTouches.length !== 1) return;
        const dx = e.changedTouches[0].clientX - start.current.x,
          dy = e.changedTouches[0].clientY - start.current.y;
        start.current = null;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5)
          setIndex((n) => Math.max(0, Math.min(3, n + (dx < 0 ? 1 : -1))));
      }}
    >
      <div className="how-tabs" role="tablist" aria-label="How Orb works">
        {STEPS.map((x, i) => (
          <button
            key={x.title}
            role="tab"
            id={`step-${i}`}
            aria-controls="how-panel"
            aria-selected={index === i}
            tabIndex={index === i ? 0 : -1}
            onClick={() => setIndex(i)}
            onKeyDown={(e) => {
              let n;
              if (e.key === "ArrowRight") n = (i + 1) % 4;
              if (e.key === "ArrowLeft") n = (i + 3) % 4;
              if (e.key === "Home") n = 0;
              if (e.key === "End") n = 3;
              if (n !== undefined) {
                e.preventDefault();
                setIndex(n);
                document.getElementById(`step-${n}`).focus();
              }
            }}
          >
            <span>{i + 1}</span>
            {["Open", "Tap", "Review", "Return"][i]}
          </button>
        ))}
      </div>
      <div
        className="how-panel"
        id="how-panel"
        role="tabpanel"
        aria-labelledby={`step-${index}`}
      >
        <div className="how-preview" key={index}>
          <Icon name={s.icon} />
          <pre>{s.preview}</pre>
          <span>Illustrative flow</span>
        </div>
        <div className="how-copy">
          <h3>{s.title}</h3>
          <p>{s.body}</p>
          <div className="how-controls">
            <button
              className="icon-button"
              aria-label="Previous step"
              disabled={index === 0}
              onClick={() => setIndex(index - 1)}
            >
              <Icon name="arrow-left" />
            </button>
            <span>{index + 1} / 4</span>
            <button
              className="icon-button"
              aria-label="Next step"
              disabled={index === 3}
              onClick={() => setIndex(index + 1)}
            >
              <Icon name="arrow-right" />
            </button>
            <a href="#playground" className="text-link">
              Try it above <Icon name="arrow-up-right" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

const APK = {
  name: release.filename,
  size: release.size,
  sha: release.sha256,
  parts: release.parts,
};
function Download() {
  const [state, setState] = useState("idle"),
    [progress, setProgress] = useState(0),
    [url, setUrl] = useState(""),
    [error, setError] = useState("");
  const controller = useRef(null),
    currentUrl = useRef("");
  useEffect(
    () => () => {
      controller.current?.abort();
      if (currentUrl.current) URL.revokeObjectURL(currentUrl.current);
    },
    [],
  );
  const prepare = async () => {
    setState("loading");
    setError("");
    setProgress(0);
    const control = new AbortController();
    controller.current = control;
    try {
      const chunks = [];
      let received = 0;
      for (const part of APK.parts) {
        const response = await fetch(part, { signal: control.signal });
        if (!response.ok)
          throw new Error(
            "The release file could not be fetched. Please retry.",
          );
        const reader = response.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (controller.current !== control || control.signal.aborted) return;
          chunks.push(value);
          received += value.length;
          setProgress(Math.min(received / APK.size, 1));
        }
      }
      if (received !== APK.size)
        throw new Error("File size did not match the release. Please retry.");
      const blob = new Blob(chunks, {
        type: "application/vnd.android.package-archive",
      });
      if (!crypto.subtle)
        throw new Error(
          "File verification requires a secure browser. Open this page over HTTPS.",
        );
      setState("verifying");
      const digest = await crypto.subtle.digest(
        "SHA-256",
        await blob.arrayBuffer(),
      );
      if (control.signal.aborted) return;
      const hash = [...new Uint8Array(digest)]
        .map((x) => x.toString(16).padStart(2, "0"))
        .join("");
      if (hash !== APK.sha)
        throw new Error(
          "Checksum mismatch. The file was not offered for download. Please retry.",
        );
      if (currentUrl.current) URL.revokeObjectURL(currentUrl.current);
      const next = URL.createObjectURL(blob);
      currentUrl.current = next;
      setUrl(next);
      setState("ready");
    } catch (e) {
      if (controller.current !== control) return;
      if (e.name === "AbortError") {
        setState("idle");
        setProgress(0);
      } else {
        setError(e.message || "Download failed. Please retry.");
        setState("error");
      }
    }
  };
  return (
    <div className="apk-download">
      {state === "ready" ? (
        <>
          <a className="button download-button" href={url} download={APK.name}>
            Save verified APK <Icon name="download" />
          </a>
          <p className="download-status" role="status">
            <Icon name="circle-check" /> SHA-256 matches the published release.
          </p>
          <p className="fine">
            Tap Save, then open the APK from Downloads on your Android phone.
          </p>
        </>
      ) : (
        <>
          <button
            className="button download-button"
            disabled={state === "loading" || state === "verifying"}
            onClick={prepare}
          >
            {state === "loading"
              ? `Downloading… ${Math.round(progress * 100)}%`
              : state === "verifying"
                ? "Verifying checksum…"
                : state === "error"
                  ? "Retry APK download"
                  : "Prepare APK download"}
            <Icon name="download" />
          </button>
          {(state === "loading" || state === "verifying") && (
            <>
              <progress
                value={progress}
                max="1"
                aria-label="APK download progress"
              />
              <div className="download-progress">
                <span role="status">
                  {((progress * APK.size) / 1e6).toFixed(1)} / 37.6 MB
                </span>
                <button
                  className="text-button"
                  onClick={() => {
                    controller.current?.abort();
                    controller.current = null;
                    setState("idle");
                    setProgress(0);
                  }}
                >
                  Cancel
                </button>
              </div>
            </>
          )}
          {state === "idle" && (
            <p className="download-status">
              We’ll download the file and check its SHA-256. Then tap Save.
            </p>
          )}
          {error && (
            <p className="download-error" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}

[
  ["playground-mount", Playground],
  ["shield-mount", Shield],
  ["agents-mount", Agents],
  ["how-mount", How],
  ["download-mount", Download],
].forEach(([id, Component]) => {
  const el = document.getElementById(id);
  if (el) createRoot(el).render(<Component />);
});
const motionButton = document.getElementById("motion-toggle");
let manuallyPaused = false;
const updateMotion = () => {
  const off = manuallyPaused || media.matches;
  document.documentElement.dataset.motion = off ? "off" : "on";
  motionButton.setAttribute("aria-pressed", String(off));
  motionButton.setAttribute(
    "aria-label",
    off ? "Resume motion" : "Pause motion",
  );
  motionButton.querySelector("span").textContent = off
    ? "Resume motion"
    : "Pause motion";
  motionButton
    .querySelector("use")
    .setAttribute("href", `/assets/icons.svg#player-${off ? "play" : "pause"}`);
  window.dispatchEvent(new Event("orb-motion"));
};
motionButton.addEventListener("click", () => {
  manuallyPaused = !manuallyPaused;
  updateMotion();
});
media.addEventListener("change", updateMotion);
updateMotion();
window.addEventListener("keydown", (e) => {
  if (!["Shift", "Control", "Alt", "Meta"].includes(e.key))
    inputMode = "keyboard";
});
window.addEventListener("pointerdown", () => (inputMode = "pointer"));
const voice = document.querySelector(".voice-sample");
voice?.addEventListener("click", () => {
  document.getElementById("voice-note").textContent =
    "Example transcript: “Pay 0.2 MON to kartik.eth on testnet.” This website did not record audio.";
  if (
    inputMode !== "keyboard" &&
    !media.matches &&
    document.documentElement.dataset.motion !== "off"
  )
    document
      .querySelector(".wave")
      .animate(
        [
          { transform: "scaleY(.6)" },
          { transform: "scaleY(1)" },
          { transform: "scaleY(.6)" },
        ],
        { duration: 240 },
      );
});
const search = document.getElementById("faq-search");
if (search) {
  let topic = "All";
  const rows = [...document.querySelectorAll(".faq-list details")],
    expand = document.getElementById("faq-expand");
  const visible = () => rows.filter((x) => !x.hidden);
  const filter = () => {
    const q = search.value.trim().toLowerCase();
    for (const row of rows)
      row.hidden = !(
        (topic === "All" || row.dataset.topic === topic) &&
        row.textContent.toLowerCase().includes(q)
      );
    const count = visible().length;
    document.getElementById("faq-count").textContent =
      `${count} ${count === 1 ? "answer" : "answers"}`;
    document.getElementById("faq-empty").hidden = count > 0;
    expand.hidden = count === 0;
    expand.textContent = visible().every((x) => x.open)
      ? "Collapse all"
      : "Expand all";
  };
  search.addEventListener("input", filter);
  document.querySelectorAll("#faq-topics button").forEach((btn) =>
    btn.addEventListener("click", () => {
      topic = btn.dataset.topic;
      document
        .querySelectorAll("#faq-topics button")
        .forEach((x) => x.setAttribute("aria-pressed", String(x === btn)));
      filter();
    }),
  );
  expand.addEventListener("click", () => {
    const open = !visible().every((x) => x.open);
    visible().forEach((x) => (x.open = open));
    expand.textContent = open ? "Collapse all" : "Expand all";
  });
  document.getElementById("faq-reset").addEventListener("click", () => {
    search.value = "";
    topic = "All";
    document
      .querySelectorAll("#faq-topics button")
      .forEach((x) =>
        x.setAttribute("aria-pressed", String(x.dataset.topic === "All")),
      );
    filter();
    search.focus();
  });
  rows.forEach((row) => {
    row.addEventListener("toggle", () => {
      expand.textContent = visible().every((x) => x.open)
        ? "Collapse all"
        : "Expand all";
      if (
        row.open &&
        inputMode !== "keyboard" &&
        !media.matches &&
        document.documentElement.dataset.motion !== "off"
      )
        row.querySelector(".faq-answer").animate(
          [
            { opacity: 0.4, transform: "translateY(-4px)" },
            { opacity: 1, transform: "translateY(0)" },
          ],
          { duration: 180, easing: "cubic-bezier(.22,1,.36,1)" },
        );
    });
  });
}
const checklist = [...document.querySelectorAll("[data-step]")];
if (checklist.length) {
  let saved = [];
  try {
    saved = JSON.parse(localStorage.getItem("orb-install-steps-v1") || "[]");
    if (!Array.isArray(saved)) saved = [];
  } catch {}
  const update = () => {
    document.getElementById("setup-progress").textContent =
      `${checklist.filter((x) => x.checked).length} of 5 steps checked`;
    try {
      localStorage.setItem(
        "orb-install-steps-v1",
        JSON.stringify(checklist.map((x) => x.checked)),
      );
    } catch {}
  };
  checklist.forEach((el, i) => {
    el.checked = saved[i] === true;
    el.addEventListener("change", update);
  });
  update();
  document
    .getElementById("copy-checksum")
    .addEventListener("click", async (e) => {
      try {
        await navigator.clipboard.writeText(APK.sha);
        e.target.textContent = "Checksum copied";
      } catch {
        e.target.textContent = "Select the checksum above to copy";
      }
    });
}
