/**
 * @file Ask sheet (spec §7.4): opened by the bubble via `bubbleagent://ask?ctx=<id>`
 * over whatever app the user was in (the activity is translucent).
 *
 * On mount it consumes the screen context once, gates on the Privy session and
 * resumes any pending payment. Dismissing (scrim, close, hardware back) aborts
 * the in-flight request, resets the stack to Home and moves the task to back.
 */
import { Feather } from '@expo/vector-icons';
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
  Easing,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BubbleOverlay } from '../modules/bubble-overlay';
import { planTurn, type AgentContext, type ChatTurn, type Clarification } from '../src/agentApi';
import { Banner, PendingBanner } from '../src/components/Banner';
import { ContextChip, type CapturedContext, type ContextState } from '../src/components/ContextChip';
import { IntentCard } from '../src/components/IntentCard';
import { MessageBubble } from '../src/components/MessageBubble';
import { Button, Pill, Text, type IconName } from '../src/components/ui';
import { chipLabel } from '../src/fallbackParser';
import { usePendingTx, useWallet } from '../src/hooks';
import type { Intent } from '../src/intent';
import { getLimitState } from '../src/limits';
import { colors, HIT, radius, shadow, space, type as typeScale } from '../src/theme';

/** Same cap the screen reader applies; clipboard text is held to it too. */
const MAX_CONTEXT_CHARS = 4000;
const MAX_INPUT_CHARS = 500;

const QUICK_ACTIONS: { label: string; icon: IconName }[] = [
  { label: 'Pay this', icon: 'send' },
  { label: 'What is this address?', icon: 'search' },
  { label: 'My balance', icon: 'credit-card' },
];

type Turn =
  | { id: string; kind: 'user'; text: string }
  | { id: string; kind: 'assistant'; text: string; intents: Intent[]; clarification: Clarification | null }
  | { id: string; kind: 'notice'; text: string; tone: 'warning' | 'danger' };

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
 * @returns The §7.5 `context` object.
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
 * Route component. Collapses the stack to this route so no opaque screen sits
 * under the sheet: on a warm start expo-router's linking dispatches a NAVIGATE
 * that pushes `ask` over `index`; on a cold start the state is already `[ask]`.
 * @returns The sheet, remounted per capture so a new tap starts a fresh session.
 */
export default function AskRoute() {
  const { ctx } = useLocalSearchParams<{ ctx?: string }>();
  const navigation = useNavigation<NavigationProp<ParamListBase>>();

  useEffect(() => {
    const state = navigation.getState();
    if (state && state.routes.length > 1) navigation.reset({ ...state, index: 0, routes: [state.routes[state.index]] });
  }, [navigation]);

  const ctxId = typeof ctx === 'string' && ctx ? ctx : undefined;
  return <AskSheet key={ctxId ?? 'none'} ctxId={ctxId} />;
}

/**
 * The bottom sheet.
 * @param props.ctxId Screen-context ID from the deep link.
 * @returns Scrim plus sheet.
 */
function AskSheet({ ctxId }: { ctxId: string | undefined }) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { ready, user, wallet, address } = useWallet();
  const pending = usePendingTx();
  const [context, setContext] = useState<ContextState>(() => consumeContext(ctxId));
  const [excluded, setExcluded] = useState(false);
  const [clipboardError, setClipboardError] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const progress = useRef(new Animated.Value(0)).current;
  const closing = useRef(false);

  useEffect(() => {
    Animated.spring(progress, { toValue: 1, damping: 26, stiffness: 260, overshootClamping: true, useNativeDriver: true }).start();
    return () => abortRef.current?.abort();
  }, [progress]);

  const dismiss = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    abortRef.current?.abort();
    Animated.timing(progress, { toValue: 0, duration: 180, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => {
      router.replace('/');
      tryNative(() => BubbleOverlay?.minimizeApp(), undefined);
    });
  }, [progress]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      dismiss();
      return true;
    });
    return () => sub.remove();
  }, [dismiss]);

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
      if (outcome.notice) added.push({ id: randomUUID(), kind: 'notice', ...outcome.notice });
      const reply = [...new Set([outcome.reply, outcome.clarification?.question ?? ''])].filter(Boolean).join('\n\n');
      if (reply || outcome.intents.length) {
        added.push({ id: randomUUID(), kind: 'assistant', text: reply, intents: outcome.intents, clarification: outcome.clarification });
      }
      setTurns((t) => [...t, ...added]);
    } catch {
      if (!controller.signal.aborted) {
        setTurns((t) => [...t, { id: randomUUID(), kind: 'notice', text: 'Something went wrong. Try again.', tone: 'danger' }]);
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(false);
    }
  };

  const lastTurn = turns[turns.length - 1];
  const canSend = !!input.trim() && !busy;

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
        <View style={styles.gateIcon}>
          <Feather name="lock" size={20} color={colors.primary} />
        </View>
        <Text variant="headline" align="center">
          Sign in to Bubble Agent first.
        </Text>
        <Text variant="callout" color="textSecondary" align="center">
          Sign in once with your email, then tap the bubble from any app.
        </Text>
        <Button label="Open Bubble Agent" icon="arrow-right" onPress={() => router.replace('/')} style={styles.gateButton} />
      </View>
    );
  } else {
    body = (
      <>
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          <PendingBanner status={pending.status} onRecheck={() => void pending.recheck()} />
          <ContextChip
            state={context}
            excluded={excluded}
            onExcludedChange={setExcluded}
            onUseClipboard={() => void readClipboard()}
            clipboardError={clipboardError}
          />
          {turns.map((turn) => {
            if (turn.kind === 'user') return <MessageBubble key={turn.id} role="user" text={turn.text} />;
            if (turn.kind === 'notice') {
              return (
                <Banner
                  key={turn.id}
                  tone={turn.tone}
                  icon={turn.tone === 'danger' ? 'alert-octagon' : 'cloud-off'}
                  title={turn.text}
                />
              );
            }
            const showChips = turn === lastTurn && !busy && !!turn.clarification?.options.length;
            return (
              <View key={turn.id} style={styles.turn}>
                {turn.text ? <MessageBubble role="assistant" text={turn.text} /> : null}
                {turn.intents.map((intent) => (
                  <IntentCard
                    key={`${turn.id}:${intent.id}`}
                    intent={intent}
                    wallet={wallet}
                    address={address}
                    onSettled={() => void pending.recheck()}
                  />
                ))}
                {showChips ? (
                  <View style={styles.chips}>
                    {turn.clarification?.options.map((option) => (
                      <Chip key={option} label={chipLabel(option)} mono={option.startsWith('0x')} onPress={() => void send(option)} />
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })}
          {busy ? <MessageBubble role="assistant" thinking /> : null}
          {turns.length === 0 ? (
            <View style={styles.chips}>
              {QUICK_ACTIONS.map((a) => (
                <Chip key={a.label} label={a.label} icon={a.icon} onPress={() => void send(a.label)} />
              ))}
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.composer}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={'Ask, or say "pay this"'}
            placeholderTextColor={colors.textTertiary}
            maxLength={MAX_INPUT_CHARS}
            returnKeyType="send"
            onSubmitEditing={() => void send(input)}
            accessibilityLabel="Message to Bubble Agent"
            style={styles.input}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send"
            accessibilityState={{ disabled: !canSend }}
            disabled={!canSend}
            onPress={() => void send(input)}
            style={({ pressed }) => [styles.sendButton, pressed && styles.sendPressed, !canSend && styles.inactive]}
          >
            <Feather name="arrow-up" size={20} color={colors.textInverse} />
          </Pressable>
        </View>
      </>
    );
  }

  return (
    <View style={styles.root}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: progress }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} accessibilityRole="button" accessibilityLabel="Close Bubble Agent" />
      </Animated.View>
      <KeyboardAvoidingView behavior="padding" style={styles.kav} pointerEvents="box-none">
        <Animated.View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              paddingBottom: insets.bottom + space.md,
              transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [height, 0] }) }],
            },
          ]}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text variant="headline" accessibilityRole="header">
              Bubble Agent
            </Text>
            <Pill label="Monad Testnet" tone="primary" dot />
            <View style={styles.flex} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={dismiss}
              style={({ pressed }) => [styles.close, pressed && styles.closePressed]}
            >
              <Feather name="x" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>
          {body}
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

/**
 * Tappable suggestion (quick action or clarification option).
 * @param props.label Visible label.
 * @param props.icon Optional leading icon.
 * @param props.mono Render the label in monospace (addresses).
 * @param props.onPress Sends the option.
 * @returns A pill-shaped button.
 */
function Chip({ label, icon, mono, onPress }: { label: string; icon?: IconName; mono?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
    >
      {icon ? <Feather name={icon} size={14} color={colors.primary} /> : null}
      <Text variant={mono ? 'mono' : 'captionStrong'} color="text">
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrim: { backgroundColor: colors.scrim },
  kav: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '75%',
    flexShrink: 1,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: space.sm,
    ...shadow.sheet,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
    marginBottom: space.xs,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingLeft: space.xl, paddingRight: space.sm },
  flex: { flex: 1 },
  close: { width: HIT, height: HIT, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  closePressed: { backgroundColor: colors.surfaceMuted },
  scroll: { flexGrow: 0, flexShrink: 1 },
  scrollContent: { paddingHorizontal: space.xl, paddingTop: space.sm, paddingBottom: space.lg, gap: space.md },
  turn: { gap: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
    minHeight: 40,
    paddingHorizontal: space.md + 2,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  chipPressed: { backgroundColor: colors.surfaceMuted },
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
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    color: colors.text,
  },
  sendButton: {
    width: HIT,
    height: HIT,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendPressed: { backgroundColor: colors.primaryPressed },
  inactive: { opacity: 0.45 },
  gate: { alignItems: 'center', gap: space.md, paddingHorizontal: space.xxl, paddingVertical: space.xxxl },
  gateIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gateButton: { alignSelf: 'stretch', marginTop: space.sm },
});
