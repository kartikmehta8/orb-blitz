/**
 * @file Signed-out onboarding (spec §7.3 item 1): brand intro, three feature
 * rows, then Privy email OTP sign-in (email → 6-digit code, with resend
 * countdown and Privy's error reason surfaced).
 */
import { Feather } from '@expo/vector-icons';
import { useLoginWithEmail } from '@privy-io/expo';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { colors, fonts, HIT, radius, space, type as typeScale } from '../theme';
import { BrandMark } from './BrandMark';
import { Button, Card, IconTile, Text, type IconName } from './ui';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_LENGTH = 6;
const RESEND_SECONDS = 30;
const HALO = 168;

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  { icon: 'message-circle', title: 'Tap the bubble in any app', body: 'It reads the address on screen when you ask.' },
  { icon: 'zap', title: 'Settles on Monad in ~1s', body: 'Testnet MON, straight from your own wallet.' },
  { icon: 'shield', title: 'You confirm every payment', body: 'Limits you set are enforced on this phone.' },
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
 * Brand mark on a soft lavender halo.
 * @returns The halo illustration.
 */
function BrandHalo() {
  return (
    <View style={styles.halo}>
      <Svg width={HALO} height={HALO} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="halo" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={colors.primarySoftBorder} stopOpacity={1} />
            <Stop offset="0.55" stopColor={colors.primarySoft} stopOpacity={0.9} />
            <Stop offset="1" stopColor={colors.canvas} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={HALO} height={HALO} fill="url(#halo)" />
      </Svg>
      <BrandMark size={64} />
    </View>
  );
}

/**
 * Signed-out screen: intro plus the email OTP card.
 * @returns The onboarding content.
 */
export function SignIn() {
  const { sendCode, loginWithCode, state } = useLoginWithEmail();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const sending = state.status === 'sending-code';
  const verifying = state.status === 'submitting-code';

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

  return (
    <View style={styles.root}>
      <View style={styles.intro}>
        <BrandHalo />
        <Text variant="title" align="center" accessibilityRole="header" style={styles.headline}>
          Pay anyone on your screen
        </Text>
        <Text variant="body" color="textSecondary" align="center">
          A floating assistant that turns what you’re looking at into a Monad payment you approve.
        </Text>
      </View>

      <View style={styles.features}>
        {FEATURES.map((f) => (
          <View key={f.icon} style={styles.feature} accessible accessibilityLabel={`${f.title}. ${f.body}`}>
            <IconTile icon={f.icon} tone="primary" size={40} />
            <View style={styles.flex}>
              <Text variant="bodyStrong">{f.title}</Text>
              <Text variant="caption" color="textSecondary">
                {f.body}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <Card style={styles.card}>
        {step === 'email' ? (
          <>
            <View style={styles.cardHead}>
              <Text variant="headline">Sign in with email</Text>
              <Text variant="callout" color="textSecondary">
                {"We'll email you a 6-digit code. A Monad testnet wallet is created for you on first sign-in."}
              </Text>
            </View>
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
            {error ? <FieldError text={error} /> : null}
            <Button label="Continue" loading={sending} disabled={!email.trim()} onPress={() => void requestCode()} />
          </>
        ) : (
          <>
            <View style={styles.cardHead}>
              <Text variant="headline">Check your email</Text>
              <Text variant="callout" color="textSecondary">
                Enter the 6-digit code sent to{' '}
                <Text variant="callout" color="text">
                  {email.trim()}
                </Text>
              </Text>
            </View>
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
              <Button
                size="sm"
                variant="ghost"
                label="Use a different email"
                onPress={() => {
                  setStep('email');
                  setCode('');
                  setError(null);
                }}
              />
            </View>
          </>
        )}
      </Card>
    </View>
  );
}

const BOX_HEIGHT = 56;

const styles = StyleSheet.create({
  root: { gap: space.xxl },
  flex: { flex: 1 },
  intro: { alignItems: 'center', gap: space.sm, paddingHorizontal: space.sm },
  halo: { width: HALO, height: HALO, alignItems: 'center', justifyContent: 'center', marginBottom: -space.lg },
  headline: { marginTop: space.xs },
  features: { gap: space.lg, paddingHorizontal: space.xs },
  feature: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  card: { gap: space.lg, padding: space.xl },
  cardHead: { gap: space.xs },
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
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxActive: { borderColor: colors.primary, borderWidth: 2, backgroundColor: colors.surface },
  boxError: { borderColor: colors.danger },
  digit: { fontFamily: fonts.monoMedium, fontVariant: ['tabular-nums'] },
  // Covers the boxes so taps, paste and autofill reach the real input; invisible.
  hiddenInput: { ...StyleSheet.absoluteFillObject, opacity: 0, color: 'transparent' },
  links: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: space.sm },
});
