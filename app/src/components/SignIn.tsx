/**
 * @file Full-screen sign-in shown instead of the tabs while signed out
 * (spec §7.3 item 1). Two clear steps with a step indicator: 1. email,
 * 2. the 6-digit code (Privy email OTP), with a resend countdown and Privy's
 * error reason surfaced.
 */
import { Feather } from '@expo/vector-icons';
import { useLoginWithEmail } from '@privy-io/expo';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, HIT, radius, space, type as typeScale } from '../theme';
import { BrandMark } from './BrandMark';
import { Button, Text, type IconName } from './ui';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_LENGTH = 6;
const RESEND_SECONDS = 30;
const STEPS = 2;
/** Visual size of the back button; `hitSlop` pads it to a 48-pt target. */
const BACK = 40;

const VALUES: { icon: IconName; text: string }[] = [
  { icon: 'message-circle', text: 'Tap the bubble in any app to pay an address on screen' },
  { icon: 'shield', text: 'You approve every payment with your fingerprint or PIN' },
  { icon: 'zap', text: 'Monad testnet only. No real funds.' },
];

/**
 * Appends Privy's reason to a sign-in error, so config problems (wrong client
 * ID, app identifier not allowed) are visible instead of a generic message.
 * @param summary User-facing summary.
 * @param e Whatever the Privy call threw.
 * @returns e.g. "Couldn't send the code. Invalid app client ID".
 */
function withCause(summary: string, e: unknown): string {
  const cause = e instanceof Error ? e.message.replace(/^\[[^\]]*\]\s*[^:]*:\s*/, '').split('\n')[0].slice(0, 140) : '';
  return cause ? `${summary} ${cause}` : summary;
}

/**
 * Inline error line.
 * @param props.text Message.
 * @returns Red caption with an icon, announced politely.
 */
function FieldError({ text }: { text: string }) {
  return (
    <View style={styles.error} accessibilityLiveRegion="polite">
      <Feather name="alert-circle" size={13} color={colors.danger} style={styles.errorIcon} />
      <Text variant="caption" color="danger" style={styles.flex}>
        {text}
      </Text>
    </View>
  );
}

/**
 * "Step N of 2" label over a two-segment bar.
 * @param props.step Current step, 1-based.
 * @returns The indicator, announced as one element.
 */
function StepIndicator({ step }: { step: number }) {
  return (
    <View style={styles.steps} accessible accessibilityLabel={`Step ${step} of ${STEPS}`}>
      <Text variant="overline" color="primary">
        Step {step} of {STEPS}
      </Text>
      <View style={styles.segments}>
        {Array.from({ length: STEPS }, (_, i) => (
          <View key={i} style={[styles.segment, i < step && styles.segmentDone]} />
        ))}
      </View>
    </View>
  );
}

/**
 * Six digit boxes driven by one transparent TextInput laid over them, so
 * paste and SMS/email autofill work like a normal field.
 * @param props.value Digits typed so far.
 * @param props.onChange New digits (non-digits stripped, max 6).
 * @param props.invalid Shows the boxes in the error color.
 * @returns The code field.
 */
function CodeBoxes({ value, onChange, invalid }: { value: string; onChange: (v: string) => void; invalid: boolean }) {
  const [focused, setFocused] = useState(true);
  return (
    <View style={styles.boxes}>
      {Array.from({ length: CODE_LENGTH }, (_, i) => {
        const active = focused && i === Math.min(value.length, CODE_LENGTH - 1);
        return (
          <View
            key={i}
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
            style={[styles.box, active && styles.boxActive, invalid && styles.boxError]}
          >
            <Text variant="title" style={styles.digit}>
              {value[i] ?? ''}
            </Text>
          </View>
        );
      })}
      <TextInput
        value={value}
        onChangeText={(raw) => onChange(raw.replace(/\D/g, '').slice(0, CODE_LENGTH))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={CODE_LENGTH}
        autoFocus
        caretHidden
        accessibilityLabel="6-digit code"
        style={styles.hiddenInput}
      />
    </View>
  );
}

/**
 * Signed-out screen: brand bar, step indicator, then the email or code step.
 * @returns The full-screen sign-in flow.
 */
export function SignIn() {
  const insets = useSafeAreaInsets();
  const { sendCode, loginWithCode, state } = useLoginWithEmail();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const sending = state.status === 'sending-code';
  const verifying = state.status === 'submitting-code';
  const onCodeStep = step === 'code';

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const requestCode = async () => {
    const address = email.trim();
    if (!EMAIL.test(address)) {
      setError('Enter a valid email address.');
      return;
    }
    setError(null);
    try {
      await sendCode({ email: address });
      setStep('code');
      setCode('');
      setCooldown(RESEND_SECONDS);
    } catch (e) {
      setError(withCause("Couldn't send the code.", e));
    }
  };

  const submitCode = async (value: string) => {
    if (value.length !== CODE_LENGTH) return;
    setError(null);
    try {
      await loginWithCode({ code: value, email: email.trim() });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      setCode('');
      setError(withCause("That code didn't work. Check it or send a new one.", e));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const onCodeChange = (digits: string) => {
    setCode(digits);
    if (digits.length > 0) setError(null);
    if (digits.length === CODE_LENGTH) void submitCode(digits);
  };

  const backToEmail = () => {
    setStep('email');
    setCode('');
    setError(null);
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.screen}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xxl }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brand}>
          {onCodeStep ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to email"
              onPress={backToEmail}
              hitSlop={(HIT - BACK) / 2}
              style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
            >
              <Feather name="arrow-left" size={20} color={colors.text} />
            </Pressable>
          ) : null}
          <BrandMark size={28} />
          <Text variant="headline">Bubble Agent</Text>
        </View>

        <View style={styles.form}>
          <StepIndicator step={onCodeStep ? 2 : 1} />
          <View style={styles.head}>
            <Text variant="title" accessibilityRole="header">
              {onCodeStep ? 'Enter the code' : 'Sign in with email'}
            </Text>
            {onCodeStep ? (
              <Text variant="body" color="textSecondary">
                Sent to{' '}
                <Text variant="bodyStrong" color="text">
                  {email.trim()}
                </Text>
              </Text>
            ) : (
              <Text variant="body" color="textSecondary">
                {"We'll send a 6-digit code. Your wallet is created automatically on first sign in."}
              </Text>
            )}
          </View>

          {onCodeStep ? (
            <>
              <CodeBoxes value={code} onChange={onCodeChange} invalid={!!error} />
              {error ? <FieldError text={error} /> : null}
              <Button label="Verify" loading={verifying} disabled={code.length !== CODE_LENGTH} onPress={() => void submitCode(code)} />
              <View style={styles.links}>
                <Button
                  size="sm"
                  variant="ghost"
                  label={cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                  disabled={cooldown > 0 || sending}
                  onPress={() => void requestCode()}
                />
                <Button size="sm" variant="ghost" label="Use a different email" onPress={backToEmail} />
              </View>
            </>
          ) : (
            <>
              <View style={styles.fieldGroup}>
                <Text variant="captionStrong" color="textSecondary">
                  Email
                </Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="send"
                  onSubmitEditing={() => void requestCode()}
                  accessibilityLabel="Email address"
                  style={[styles.field, error ? styles.fieldError : null]}
                />
              </View>
              {error ? <FieldError text={error} /> : null}
              <Button label="Continue" loading={sending} disabled={!email.trim()} onPress={() => void requestCode()} />
            </>
          )}
        </View>

        {onCodeStep ? null : (
          <View style={styles.values}>
            {VALUES.map((v) => (
              <View key={v.icon} style={styles.value}>
                <Feather name={v.icon} size={16} color={colors.primary} />
                <Text variant="caption" color="textSecondary" style={styles.flex}>
                  {v.text}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const BOX_HEIGHT = 56;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { flexGrow: 1, paddingHorizontal: space.xl, gap: space.xxxl },
  flex: { flex: 1 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: HIT },
  back: {
    width: BACK,
    height: BACK,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
    marginRight: space.xs,
  },
  backPressed: { backgroundColor: colors.border },
  form: { gap: space.xl },
  steps: { gap: space.sm },
  segments: { flexDirection: 'row', gap: space.xs },
  segment: { flex: 1, height: 4, borderRadius: radius.pill, backgroundColor: colors.border },
  segmentDone: { backgroundColor: colors.primary },
  head: { gap: space.sm },
  fieldGroup: { gap: space.sm },
  field: {
    ...typeScale.body,
    minHeight: HIT + space.xs,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    color: colors.text,
  },
  fieldError: { borderColor: colors.danger },
  error: { flexDirection: 'row', gap: space.sm },
  errorIcon: { marginTop: space.xxs },
  boxes: { flexDirection: 'row', gap: space.sm },
  box: {
    flex: 1,
    height: BOX_HEIGHT,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxActive: { borderColor: colors.primary, borderWidth: 2 },
  boxError: { borderColor: colors.danger },
  digit: { fontFamily: fonts.monoMedium, fontVariant: ['tabular-nums'] },
  // Covers the boxes so taps, paste and autofill reach the real input; invisible.
  hiddenInput: { ...StyleSheet.absoluteFillObject, opacity: 0, color: 'transparent' },
  links: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: space.sm },
  values: {
    marginTop: 'auto',
    gap: space.md,
    paddingTop: space.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  value: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
