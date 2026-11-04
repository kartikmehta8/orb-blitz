/**
 * @file Ask sheet: opened by the orb via `bubbleagent://ask?ctx=<id>`
 * over whatever app the user was in (the activity is translucent), or by an
 * agent-request notification via `bubbleagent://ask?request=<id>`.
 *
 * On mount it consumes the screen context once, gates on the Privy session and
 * resumes any pending payment. Dismissing (scrim, close, hardware back) aborts
 * the in-flight request, resets the stack to the Wallet tab and moves the task to back.
 */
import { Icon } from '../src/components/Icon';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import { randomUUID } from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BubbleOverlay } from '../modules/bubble-overlay';
import { planAgentRequest, planTurn, type AgentContext, type ChatTurn, type Clarification } from '../src/agentApi';
import { answerAgentRequest, getAgentRequest } from '../src/agentsApi';
import { setOrbState } from '../src/orbBridge';
import { PendingBanner } from '../src/components/Banner';
import { BrandMark, OrbGlyph } from '../src/components/BrandMark';
import { ContextChip, type CapturedContext, type ContextState } from '../src/components/ContextChip';
import { IntentCard } from '../src/components/IntentCard';
import { MessageBubble, NoticeRow, TypingIndicator } from '../src/components/MessageBubble';
import { SafetyCard, SIGNAL_COPY } from '../src/components/RiskVerdict';
import { animateSheet, useReduceMotion } from '../src/components/motion';
import { chipContent, isAmountOption, SuggestionChip } from '../src/components/SuggestionChip';
import { Button, Text, type IconName } from '../src/components/ui';
import { usePendingTx, useWallet } from '../src/hooks';
import type { Intent } from '../src/intent';
import type { Assessment } from '../src/risk';
import { getLimitState } from '../src/limits';
import { paymentLevel } from '../src/risk';
import { colors, HIT, radius, shadow, space, type as typeScale } from '../src/theme';
import { getReadAloud, paymentSpeech, speak, stopSpeaking, verdictSpeech } from '../src/voice';

/** Same cap the screen reader applies; clipboard text is held to it too. */
const MAX_CONTEXT_CHARS = 4000;
const MAX_INPUT_CHARS = 500;
/** Visible disc inside the 48pt close control. */
const CLOSE = 36;

/** Ask tab (in-app, no captured screen): pasting stands in for "what's on my screen". */
const PAGE_ACTIONS: { label: string; icon: IconName; paste?: boolean }[] = [
  { label: 'My balance', icon: 'pie-chart' },
  { label: 'Paste from clipboard', icon: 'clipboard', paste: true },
  { label: 'What is this address?', icon: 'search' },
  { label: 'What can you do?', icon: 'help-circle' },
];

const QUICK_ACTIONS: { label: string; icon: IconName; paste?: boolean }[] = [
  { label: 'Is this safe?', icon: 'shield' },
  { label: 'Pay this', icon: 'send' },
  { label: 'What is this address?', icon: 'search' },
  { label: 'My balance', icon: 'pie-chart' },
];

type Turn =
  | { id: string; kind: 'user'; text: string }
  | {
      id: string;
      kind: 'assistant';
      text: string;
      intents: Intent[];
      clarification: Clarification | null;
      assessment: Assessment | null;
      /** Set when this turn is a connected agent's payment request. */
      agentRequestId?: string;
    }
  | { id: string; kind: 'notice'; text: string; tone: 'warning' | 'danger'; icon: IconName };

/**
 * Runs a native call that may be missing (Expo Go, iOS) or throw.
 * @param fn The call.
 * @param fallback Value on failure.
 * @returns The call's result or the fallback.
 */
function tryNative<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/**
 * Consumes the captured screen context. The native store returns it once, then deletes it.
 * @param ctxId `ctx` deep-link param.
 * @returns Chip state.
 */
function consumeContext(ctxId: string | undefined): ContextState {
  if (ctxId) setOrbState('capturing');
  const captured = ctxId ? tryNative(() => BubbleOverlay?.consumeScreenContext(ctxId) ?? null, null) : null;
  if (!captured) {
    return { kind: 'unavailable', accessibilityOn: tryNative(() => BubbleOverlay?.isAccessibilityEnabled() ?? false, false) };
  }
  const appLabel = captured.appLabel || captured.packageName;
  if (!captured.text.trim()) return { kind: 'empty', appLabel };
  return {
    kind: 'captured',
    ctx: {
      source: 'screen',
      appLabel,
      packageName: captured.packageName,
      text: captured.text.slice(0, MAX_CONTEXT_CHARS),
      capturedAt: captured.capturedAt,
      truncated: captured.truncated || captured.text.length > MAX_CONTEXT_CHARS,
    },
  };
}

/**
 * Request-shaped context (drops UI-only fields so a strict server schema accepts it).
 * @param c Captured context.
 * @returns The `context` object of the agent request.
 */
function toAgentContext(c: CapturedContext): AgentContext {
  return {
    source: c.source,
    appLabel: c.appLabel,
    text: c.text,
    capturedAt: c.capturedAt,
    ...(c.packageName ? { packageName: c.packageName } : {}),
  };
}

/**
 * Chat history for the agent: user and assistant text only, no notices.
 * @param turns Sheet turns.
 * @returns Chat turns, oldest first.
 */
function toChat(turns: Turn[]): ChatTurn[] {
  return turns.flatMap((t): ChatTurn[] =>
    t.kind === 'user' ? [{ role: 'user', text: t.text }] : t.kind === 'assistant' && t.text ? [{ role: 'assistant', text: t.text }] : [],
  );
}

/**
 * Label for one chip, or null when that entry is missing, null, or blank.
 * @param labels Parallel labels, when the clarification has any.
 * @param index Option index.
 * @returns The trimmed label, or null.
 */
function chipLabelAt(labels: (string | null)[] | undefined, index: number): string | null {
  const value = labels?.[index];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Route component. Collapses the stack to this route so no opaque screen sits
 * under the sheet: on a warm start expo-router's linking dispatches a NAVIGATE
 * that pushes `ask` over `index`; on a cold start the state is already `[ask]`.
 * @returns The sheet, remounted per capture so a new tap starts a fresh session.
 */
export default function AskRoute() {
  const { ctx, request, from } = useLocalSearchParams<{ ctx?: string; request?: string; from?: string }>();
  const navigation = useNavigation<NavigationProp<ParamListBase>>();

  useEffect(() => {
    const state = navigation.getState();
    if (state && state.routes.length > 1) navigation.reset({ ...state, index: 0, routes: [state.routes[state.index]] });
  }, [navigation]);

  const ctxId = typeof ctx === 'string' && ctx ? ctx : undefined;
  const requestId = typeof request === 'string' && request ? request : undefined;
  return <AskSheet key={requestId ?? ctxId ?? 'none'} ctxId={ctxId} requestId={requestId} inApp={from === 'app'} />;
}

/**
 * What a new assistant turn says aloud when "Read aloud" is on.
 * @param turn The turn just added.
 * @returns Text to speak, or null for nothing.
 */
function turnSpeech(turn: Turn): string | null {
  if (turn.kind !== 'assistant') return null;
  const intent = turn.intents[0];
  const agent = intent?.provenance.source === 'agent' ? intent.provenance.appLabel : undefined;
  if (intent) return paymentSpeech(intent, paymentLevel(intent.warnings, turn.assessment), agent);
  if (turn.assessment) return verdictSpeech(turn.assessment, turn.assessment.signals.map((s) => SIGNAL_COPY[s]));
  return turn.text || null;
}

/**
 * The bottom sheet.
 * @param props.ctxId Screen-context ID from the deep link.
 * @param props.requestId Agent payment request to review, from a notification.
 * @param props.inApp Opened from inside Orb, so closing returns to the app instead of the previous app.
 * @returns Scrim plus sheet.
 */
export function AskSheet({
  ctxId,
  requestId,
  inApp,
  page,
}: {
  ctxId: string | undefined;
  requestId?: string;
  inApp?: boolean;
  /** Full-screen chat for the Ask tab: no scrim, no close, no captured screen. */
  page?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { ready, user, wallet, address } = useWallet();
  const pending = usePendingTx();
  const [context, setContext] = useState<ContextState>(() =>
    requestId || page ? { kind: 'unavailable', accessibilityOn: true } : consumeContext(ctxId),
  );
  const [excluded, setExcluded] = useState(false);
  const [clipboardError, setClipboardError] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const progress = useRef(new Animated.Value(0)).current;
  const closing = useRef(false);
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    if (!page) animateSheet(progress, 1, reduceMotion);
  }, [progress, reduceMotion, page]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const dismiss = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    abortRef.current?.abort();
    stopSpeaking();
    animateSheet(progress, 0, reduceMotion, () => {
      router.replace('/');
      if (!inApp) tryNative(() => BubbleOverlay?.minimizeApp(), undefined);
    });
  }, [progress, reduceMotion, inApp]);

  /** Appends turns and, when "Read aloud" is on, speaks the newest assistant turn. */
  const addTurns = useCallback((added: Turn[]) => {
    setTurns((t) => [...t, ...added]);
    const last = [...added].reverse().find((t) => t.kind === 'assistant');
    const text = last ? turnSpeech(last) : null;
    if (text) void getReadAloud().then((on) => on && speak(text));
  }, []);

  // A notification opened the sheet: load the agent's request and rebuild it into a review card.
  const loadedRequest = useRef(false);
  useEffect(() => {
    if (!requestId || !address || loadedRequest.current) return;
    loadedRequest.current = true;
    setBusy(true);
    void (async () => {
      try {
        const outcome = await planAgentRequest(await getAgentRequest(requestId), address, await getLimitState());
        const added: Turn[] = [];
        if (outcome.notice) added.push({ id: randomUUID(), kind: 'notice', ...outcome.notice, icon: 'cpu' });
        if (outcome.intents.length) {
          added.push({
            id: randomUUID(),
            kind: 'assistant',
            text: outcome.reply,
            intents: outcome.intents,
            clarification: null,
            assessment: null,
            agentRequestId: requestId,
          });
        }
        addTurns(added);
      } catch {
        addTurns([{ id: randomUUID(), kind: 'notice', text: "Couldn't load the agent's request. Try again.", tone: 'danger', icon: 'wifi-off' }]);
      } finally {
        setBusy(false);
      }
    })();
  }, [requestId, address, addTurns]);

  const listen = async () => {
    if (busy) return;
    const said = await tryNative(() => BubbleOverlay?.listen() ?? Promise.resolve(null), Promise.resolve(null)).catch(() => null);
    if (said?.trim()) void send(said);
  };

  useEffect(() => {
    if (page) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      dismiss();
      return true;
    });
    return () => sub.remove();
  }, [dismiss, page]);

  const readClipboard = async () => {
    setClipboardError(null);
    const text = await Clipboard.hasStringAsync()
      .then((has) => (has ? Clipboard.getStringAsync() : ''))
      .catch(() => '');
    if (!text.trim()) {
      setClipboardError('Clipboard is empty.');
      return;
    }
    void Haptics.selectionAsync();
    setExcluded(false);
    setContext({
      kind: 'captured',
      ctx: {
        source: 'clipboard',
        appLabel: 'Clipboard',
        text: text.slice(0, MAX_CONTEXT_CHARS),
        capturedAt: Date.now(),
        truncated: text.length > MAX_CONTEXT_CHARS,
      },
    });
  };

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || busy || !address) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setInput('');
    const history: Turn[] = [...turns, { id: randomUUID(), kind: 'user', text }];
    setTurns(history);
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const outcome = await planTurn({
        history: toChat(history),
        context: context.kind === 'captured' && !excluded ? toAgentContext(context.ctx) : null,
        wallet: address,
        limits: await getLimitState(),
        signal: controller.signal,
      });
      const added: Turn[] = [];
      // planTurn's only danger notice is the auth failure; warnings mean the agent was unreachable.
      if (outcome.notice) {
        added.push({ id: randomUUID(), kind: 'notice', ...outcome.notice, icon: outcome.notice.tone === 'danger' ? 'lock' : 'wifi-off' });
      }
      const reply = [...new Set([outcome.reply, outcome.clarification?.question ?? ''])].filter(Boolean).join('\n\n');
      if (reply || outcome.intents.length || outcome.assessment) {
        added.push({
          id: randomUUID(),
          kind: 'assistant',
          text: reply,
          intents: outcome.intents,
          clarification: outcome.clarification,
          assessment: outcome.assessment,
        });
      }
      addTurns(added);
    } catch {
      if (!controller.signal.aborted) {
        setOrbState('error');
        setTurns((t) => [
          ...t,
          { id: randomUUID(), kind: 'notice', text: 'Something went wrong. Try again.', tone: 'danger', icon: 'alert-circle' },
        ]);
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(false);
    }
  };

  const lastTurn = turns[turns.length - 1];
  const canSend = !!input.trim() && !busy;
  const freeformId =
    !busy && lastTurn?.kind === 'assistant' && lastTurn.clarification && lastTurn.clarification.options.length === 0
      ? lastTurn.id
      : null;

  useEffect(() => {
    if (freeformId) inputRef.current?.focus();
  }, [freeformId]);
  // A review card is tall; give the sheet more room once one is on screen.
  const hasIntent = turns.some((t) => t.kind === 'assistant' && (t.intents.length > 0 || !!t.assessment));

  let body: ReactNode;
  if (!ready || (user && !address)) {
    body = (
      <View style={styles.gate}>
        <ActivityIndicator color={colors.primary} />
        <Text variant="callout" color="textSecondary">
          {ready ? 'Setting up your wallet…' : 'Loading…'}
        </Text>
      </View>
    );
  } else if (!user || !address) {
    body = (
      <View style={styles.gate}>
        <BrandMark size={56} />
        <View style={styles.gateText}>
          <Text variant="title" align="center">
            Sign in to Orb first.
          </Text>
          <Text variant="callout" color="textSecondary" align="center">
            Sign in once with your email, then tap the orb in any app.
          </Text>
        </View>
        <Button label="Open Orb" icon="arrow-right" onPress={() => router.replace('/')} style={styles.gateButton} />
      </View>
    );
  } else {
    const chips = (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={[styles.quickScroll, page && styles.quickScrollPage]}
        contentContainerStyle={styles.quick}
      >
        {(page ? PAGE_ACTIONS : QUICK_ACTIONS).map((a) => (
          <SuggestionChip key={a.label} label={a.label} icon={a.icon} onPress={() => void (a.paste ? readClipboard() : send(a.label))} />
        ))}
      </ScrollView>
    );
    const empty = turns.length === 0 && !requestId;
    body = (
      <>
        <ScrollView
          ref={scrollRef}
          style={page ? styles.scrollPage : styles.scroll}
          contentContainerStyle={[styles.scrollContent, page && empty && styles.pageEmpty]}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          <PendingBanner
            phase={pending.phase}
            status={pending.status}
            error={pending.error}
            onRetry={() => void pending.retry()}
          />
          {requestId || (page && context.kind !== 'captured') ? null : (
            <ContextChip
              state={context}
              excluded={excluded}
              onExcludedChange={setExcluded}
              onUseClipboard={() => void readClipboard()}
              clipboardError={clipboardError}
            />
          )}
          {empty && !page ? chips : null}
          {empty && page ? (
            <View style={styles.greeting}>
              <View style={styles.greetingOrb}>
                <OrbGlyph size={30} color={colors.textInverse} />
              </View>
              <Text variant="title" align="center">
                What can I help with?
              </Text>
              <Text variant="callout" color="textSecondary" align="center">
                Ask about your wallet, check a message, or pay someone on Monad. Nothing moves without your fingerprint.
              </Text>
            </View>
          ) : null}
          {turns.map((turn) => {
            if (turn.kind === 'user') return <MessageBubble key={turn.id} role="user" text={turn.text} />;
            if (turn.kind === 'notice') return <NoticeRow key={turn.id} text={turn.text} tone={turn.tone} icon={turn.icon} />;
            const options = turn.clarification?.options ?? [];
            const showChips = turn === lastTurn && !busy && options.length > 0;
            return (
              <View key={turn.id} style={styles.turn}>
                {turn.text ? <MessageBubble role="assistant" text={turn.text} /> : null}
                {/* With a payment on screen, the verdict lives inside its review card instead. */}
                {turn.assessment && turn.intents.length === 0 ? <SafetyCard assessment={turn.assessment} /> : null}
                {turn.intents.map((intent) => (
                  <IntentCard
                    key={`${turn.id}:${intent.id}`}
                    intent={intent}
                    wallet={wallet}
                    address={address}
                    screen={turn.assessment}
                    onSettled={() => void pending.recheck()}
                    {...(turn.agentRequestId
                      ? {
                          onSent: (hash) => void answerAgentRequest(turn.agentRequestId as string, { status: 'sent', txHash: hash }).catch(() => undefined),
                          onDeclined: () => void answerAgentRequest(turn.agentRequestId as string, { status: 'declined' }).catch(() => undefined),
                        }
                      : {})}
                  />
                ))}
                {showChips ? (
                  <View style={styles.follow}>
                    <View style={styles.chips}>
                      {options.map((option, index) => {
                        const content = chipContent(option, chipLabelAt(turn.clarification?.labels, index));
                        return (
                          <SuggestionChip
                            key={`${index}:${option}`}
                            label={content.label}
                            detail={content.detail}
                            mono={content.mono}
                            accessibilityLabel={content.accessibilityLabel}
                            onPress={() => void send(option)}
                          />
                        );
                      })}
                    </View>
                    {options.some(isAmountOption) ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Enter a different amount"
                        onPress={() => inputRef.current?.focus()}
                        style={({ pressed }) => [styles.amountLink, pressed && styles.amountLinkPressed]}
                      >
                        <Text variant="bodyStrong" color="primaryInk">
                          Enter a different amount
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })}
          {busy ? <TypingIndicator /> : null}
        </ScrollView>

        {empty && page ? chips : null}
        <View
          style={
            page
              ? // A margin, not padding on the KeyboardAvoidingView (it overwrites paddingBottom). Some Android
                // builds report a 0 bottom inset under gesture navigation, so keep a floor above the handle.
                [styles.pageComposer, { marginBottom: Math.max(insets.bottom, space.xxl) + space.md }]
              : styles.composer
          }
        >
          {page ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Paste from clipboard"
              onPress={() => void readClipboard()}
              style={({ pressed }) => [styles.send, styles.micPage, pressed && styles.micPressed]}
            >
              <Icon name="plus" size={22} color={colors.text} />
            </Pressable>
          ) : null}
          <TextInput
            ref={inputRef}
            value={input}
            onChangeText={setInput}
            placeholder={freeformId ? 'Type an amount or address' : page ? 'Ask Orb' : 'Ask or say “pay this”'}
            placeholderTextColor={colors.textTertiary}
            maxLength={MAX_INPUT_CHARS}
            returnKeyType="send"
            onSubmitEditing={() => void send(input)}
            accessibilityLabel="Message to Orb"
            multiline={page}
            style={page ? styles.pageInput : styles.input}
          />
          {!input.trim() && BubbleOverlay ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Speak instead of typing"
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              onPress={() => void listen()}
              style={({ pressed }) => [styles.send, page ? styles.micPage : styles.mic, pressed && styles.micPressed]}
            >
              <Icon name="mic" size={20} color={colors.text} />
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send"
              accessibilityState={{ disabled: !canSend, busy }}
              disabled={!canSend}
              onPress={() => void send(input)}
              style={({ pressed }) => [styles.send, pressed && styles.sendPressed, !canSend && styles.sendDisabled]}
            >
              <Icon name="arrow-up" size={20} color={canSend ? colors.textInverse : colors.textSecondary} />
            </Pressable>
          )}
        </View>
      </>
    );
  }

  if (page) {
    return (
      <KeyboardAvoidingView
        behavior="padding"
        style={[styles.page, { paddingTop: insets.top + space.xs }]}
      >
        <View style={styles.pageHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to wallet"
            onPress={() => router.navigate('/')}
            style={({ pressed }) => [styles.headerButton, pressed && styles.closePressed]}
          >
            <Icon name="chevron-left" size={24} color={colors.text} />
          </Pressable>
          <View style={styles.pageTitle}>
            <BrandMark size={24} />
            <Text variant="headline" accessibilityRole="header">
              Orb
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="New chat"
            disabled={busy || turns.length === 0}
            onPress={() => {
              abortRef.current?.abort();
              stopSpeaking();
              setTurns([]);
              setInput('');
              setContext({ kind: 'unavailable', accessibilityOn: true });
            }}
            style={({ pressed }) => [styles.headerButton, pressed && styles.closePressed, turns.length === 0 && styles.headerButtonIdle]}
          >
            <Icon name="edit" size={22} color={colors.text} />
          </Pressable>
        </View>
        {body}
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={styles.root}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: progress }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} accessibilityRole="button" accessibilityLabel="Close Orb" />
      </Animated.View>
      <KeyboardAvoidingView behavior="padding" style={styles.kav} pointerEvents="box-none">
        <Animated.View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              maxHeight: hasIntent ? '85%' : '75%',
              paddingBottom: insets.bottom + space.md,
              transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [height, 0] }) }],
            },
          ]}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <BrandMark size={28} />
            <Text variant="headline" accessibilityRole="header">
              Orb
            </Text>
            <View style={styles.flex} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={dismiss}
              style={({ pressed }) => [styles.close, pressed && styles.closePressed]}
            >
              <View style={styles.closeDisc}>
                <Icon name="x" size={18} color={colors.textSecondary} />
              </View>
            </Pressable>
          </View>
          {body}
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  page: { flex: 1, backgroundColor: colors.canvas },
  /** Fills the page so the composer sits at the very bottom (the sheet's list shrinks to fit instead). */
  scrollPage: { flexGrow: 1, flexShrink: 1 },
  pageTitle: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  headerButton: { width: HIT, height: HIT, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  headerButtonIdle: { opacity: 0.35 },
  pageEmpty: { flexGrow: 1, justifyContent: 'center' },
  greeting: { alignItems: 'center', gap: space.md, paddingHorizontal: space.lg },
  greetingOrb: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
  quickScrollPage: { marginHorizontal: 0, marginBottom: space.md },
  pageComposer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.sm,
    marginHorizontal: space.md,
    padding: space.xs + 2,
    borderRadius: radius.xxl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    ...Platform.select<ViewStyle>({
      android: { elevation: 3 },
      default: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 2 } },
    }),
  },
  pageInput: { ...typeScale.body, flex: 1, minHeight: 40, maxHeight: 120, paddingVertical: space.sm + 2, color: colors.text },
  micPage: { backgroundColor: 'transparent' },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.sm,
    paddingBottom: space.xs,
  },
  scrim: { backgroundColor: colors.scrim },
  kav: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    flexShrink: 1,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingTop: space.sm,
    ...shadow.sheet,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
    marginBottom: space.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + 2,
    paddingHorizontal: space.xl,
    paddingBottom: space.md,
  },
  flex: { flex: 1 },
  close: { width: HIT, height: HIT, alignItems: 'center', justifyContent: 'center' },
  closeDisc: {
    width: CLOSE,
    height: CLOSE,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closePressed: { backgroundColor: colors.border },
  scroll: { flexGrow: 0, flexShrink: 1 },
  scrollContent: { paddingHorizontal: space.xl, paddingTop: space.xs, paddingBottom: space.lg, gap: space.md },
  quickScroll: { marginHorizontal: -space.xl, flexGrow: 0 },
  quick: { paddingHorizontal: space.xl, gap: space.sm },
  turn: { gap: space.md },
  follow: { gap: space.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  amountLink: { minHeight: HIT, justifyContent: 'center', alignSelf: 'flex-start', paddingHorizontal: space.xs },
  amountLinkPressed: { opacity: 0.6 },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  input: {
    ...typeScale.body,
    flex: 1,
    minHeight: HIT,
    paddingHorizontal: space.xl,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    color: colors.text,
  },
  send: {
    width: HIT,
    height: HIT,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendPressed: { backgroundColor: colors.primaryPressed },
  sendDisabled: { backgroundColor: colors.surfaceMuted },
  mic: { backgroundColor: colors.primarySoft },
  micPressed: { backgroundColor: colors.primarySoftBorder },
  gate: { alignItems: 'center', gap: space.lg, paddingHorizontal: space.xxl, paddingTop: space.xl, paddingBottom: space.xxl },
  gateText: { alignItems: 'center', gap: space.sm },
  gateButton: { alignSelf: 'stretch', marginTop: space.sm },
});
