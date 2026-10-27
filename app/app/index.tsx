/**
 * @file Home (spec §7.3): sign-in, wallet, permissions, bubble toggle and
 * spending limits on one scrollable screen. The window is translucent, so the
 * scroll view paints the opaque canvas itself.
 */
import { Feather } from '@expo/vector-icons';
import { useLoginWithEmail, usePrivy, type PrivyEmailAccount, type PrivyUser } from '@privy-io/expo';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Keyboard, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Address } from 'viem';
import { AddressText } from '../src/components/AddressText';
import { PendingBanner } from '../src/components/Banner';
import { BubbleCard } from '../src/components/BubbleCard';
import { PermissionsCard } from '../src/components/PermissionsCard';
import { Button, Card, Pill, StatusDot, Text } from '../src/components/ui';
import { addressUrl, config, LIMIT_DEFAULTS, txUrl } from '../src/config';
import { useBalance, usePendingTx, useWallet } from '../src/hooks';
import { formatMon, shortAddress } from '../src/intent';
import { getLimitState, limitError, saveLimits, type LimitState } from '../src/limits';
import type { PendingStatus } from '../src/pendingTx';
import { getLastTx, type LastTx } from '../src/storage';
import { colors, fonts, HIT, radius, space, type as typeScale } from '../src/theme';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_SECONDS = 30;

/**
 * Coarse relative time for the last payment.
 * @param at Epoch ms.
 * @returns e.g. "just now", "5 min ago", "3 h ago", or a date.
 */
function timeAgo(at: number): string {
  const minutes = Math.floor((Date.now() - at) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} h ago`;
  return new Date(at).toLocaleDateString();
}

/**
 * Home screen.
 * @returns The scrollable settings and wallet screen.
 */
export default function Home() {
  const insets = useSafeAreaInsets();
  const { ready, user, address } = useWallet();
  const { logout } = usePrivy();
  const balance = useBalance(address);
  const pending = usePendingTx();
  const [lastTx, setLastTx] = useState<LastTx | null>(null);
  const [limits, setLimits] = useState<LimitState | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const { refresh: refreshBalance } = balance;
  const { recheck } = pending;

  const reloadLocal = useCallback(async () => {
    const [tx, state] = await Promise.all([getLastTx(), getLimitState()]);
    setLastTx(tx);
    setLimits(state);
  }, []);

  const refresh = useCallback(async () => {
    await Promise.all([recheck(), refreshBalance(), reloadLocal()]);
  }, [recheck, refreshBalance, reloadLocal]);

  useEffect(() => {
    void reloadLocal();
  }, [reloadLocal]);

  // A resumed payment just settled: spend, last payment and balance changed.
  useEffect(() => {
    if (pending.status.kind === 'confirmed' || pending.status.kind === 'failed') {
      void reloadLocal();
      void refreshBalance();
    }
  }, [pending.status, reloadLocal, refreshBalance]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void refresh());
    return () => sub.remove();
  }, [refresh]);

  const onPullRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xxxl }]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        user ? (
          <RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} colors={[colors.primary]} tintColor={colors.primary} />
        ) : undefined
      }
    >
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text variant="title" accessibilityRole="header">
            Bubble Agent
          </Text>
          <Text variant="callout" color="textSecondary">
            Pay from any screen with a tap.
          </Text>
        </View>
        <Pill label="Monad Testnet" tone="primary" dot />
      </View>

      {!ready ? (
        <Card style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </Card>
      ) : user ? (
        <WalletCard
          user={user}
          address={address}
          balance={balance.balance}
          balanceError={balance.error}
          lastTx={lastTx}
          pending={pending.status}
          onRecheck={() => void recheck()}
          onLogout={() => void logout()}
        />
      ) : (
        <SignInCard />
      )}

      <PermissionsCard />
      <BubbleCard />
      {user ? <LimitsCard state={limits} onSaved={() => void reloadLocal()} /> : null}

      <View style={styles.footer}>
        <Feather name="shield" size={14} color={colors.textTertiary} style={styles.footerIcon} />
        <Text variant="caption" color="textTertiary" style={styles.flex}>
          Testnet only. Your keys stay on this phone. The screen is read only when you tap the bubble, and you can see
          and exclude that text before it is sent to the agent.
        </Text>
      </View>
    </ScrollView>
  );
}

/**
 * Email OTP sign-in: email → 6-digit code, with resend and errors.
 * @returns The sign-in card.
 */
function SignInCard() {
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
    } catch {
      setError("Couldn't send the code. Check the address and try again.");
    }
  };

  const submitCode = async (value: string) => {
    if (!/^\d{6}$/.test(value)) return;
    setError(null);
    try {
      await loginWithCode({ code: value, email: email.trim() });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setCode('');
      setError("That code didn't work. Check it or send a new one.");
    }
  };

  const onCodeChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    if (digits.length === 6) void submitCode(digits);
  };

  return (
    <Card style={styles.card}>
      {step === 'email' ? (
        <>
          <View style={styles.cardHead}>
            <Text variant="headline">Sign in</Text>
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
            style={styles.field}
          />
          {error ? <FieldError text={error} /> : null}
          <Button label="Continue" loading={sending} disabled={!email.trim()} onPress={() => void requestCode()} />
        </>
      ) : (
        <>
          <View style={styles.cardHead}>
            <Text variant="headline">Check your email</Text>
            <Text variant="callout" color="textSecondary">
              Enter the 6-digit code sent to {email.trim()}.
            </Text>
          </View>
          <TextInput
            value={code}
            onChangeText={onCodeChange}
            placeholder="000000"
            placeholderTextColor={colors.textTertiary}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
            autoFocus
            accessibilityLabel="6-digit code"
            style={[styles.field, styles.codeField]}
          />
          {error ? <FieldError text={error} /> : null}
          <Button label="Verify" loading={verifying} disabled={code.length !== 6} onPress={() => void submitCode(code)} />
          <View style={styles.linkRow}>
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
              label="Change email"
              onPress={() => {
                setStep('email');
                setError(null);
              }}
            />
          </View>
        </>
      )}
    </Card>
  );
}

type WalletCardProps = {
  user: PrivyUser;
  address: Address | null;
  balance: bigint | null;
  balanceError: boolean;
  lastTx: LastTx | null;
  pending: PendingStatus;
  onRecheck: () => void;
  onLogout: () => void;
};

/**
 * Balance, address, faucet, pending banner and last payment.
 * @param props.user Signed-in Privy user (for the email label).
 * @param props.address Embedded wallet address, null while it is being created.
 * @param props.balance MON balance in wei, null until loaded.
 * @param props.balanceError Last balance fetch failed.
 * @param props.lastTx Last finished payment.
 * @param props.pending Pending-slot status.
 * @param props.onRecheck Re-checks the pending payment.
 * @param props.onLogout Signs out.
 * @returns The wallet card.
 */
function WalletCard({ user, address, balance, balanceError, lastTx, pending, onRecheck, onLogout }: WalletCardProps) {
  const [copied, setCopied] = useState(false);
  const email = user.linked_accounts.find((a): a is PrivyEmailAccount => a.type === 'email')?.address;

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    if (!address) return;
    await Clipboard.setStringAsync(address);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCopied(true);
  };

  return (
    <Card style={styles.card}>
      <View style={styles.rowBetween}>
        <Text variant="overline" color="textTertiary">
          Balance
        </Text>
        <Button size="sm" variant="ghost" icon="log-out" label="Sign out" onPress={onLogout} />
      </View>

      <View style={styles.balanceRow} accessible accessibilityLabel={balance === null ? 'Balance loading' : `Balance ${formatMon(balance)}`}>
        <Text variant="display" style={styles.tabular}>
          {balance === null ? '—' : formatMon(balance).replace(/ MON$/, '')}
        </Text>
        <Text variant="title" color="textSecondary">
          MON
        </Text>
      </View>
      {balanceError ? <FieldError text="Couldn't load your balance. Pull down to retry." /> : null}

      {address ? (
        <View style={styles.addressBox}>
          <View style={styles.flex}>
            <Text variant="caption" color="textTertiary">
              {email ?? 'Your wallet'}
            </Text>
            <AddressText address={address} />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copied ? 'Address copied' : 'Copy wallet address'}
            onPress={() => void copy()}
            style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
          >
            <Feather name={copied ? 'check' : 'copy'} size={18} color={copied ? colors.success : colors.textSecondary} />
          </Pressable>
        </View>
      ) : (
        <View style={styles.inline}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text variant="callout" color="textSecondary">
            Creating your wallet…
          </Text>
        </View>
      )}

      <PendingBanner status={pending} onRecheck={onRecheck} />

      {address ? (
        <View style={styles.inline}>
          <Button
            size="sm"
            variant="secondary"
            icon="droplet"
            label="Get testnet MON"
            onPress={() => void Linking.openURL(config.faucetUrl)}
          />
          <Button
            size="sm"
            variant="ghost"
            icon="external-link"
            label="Explorer"
            onPress={() => void Linking.openURL(addressUrl(address))}
          />
        </View>
      ) : null}

      <View style={styles.divider} />
      <Text variant="overline" color="textTertiary">
        Last payment
      </Text>
      {lastTx ? (
        <View style={styles.rowBetween}>
          <StatusDot tone={lastTx.status === 'confirmed' ? 'success' : 'danger'} />
          <View style={styles.flex}>
            <Text variant="bodyStrong" style={styles.tabular}>
              {lastTx.status === 'confirmed' ? 'Sent' : 'Failed'} {formatMon(BigInt(lastTx.amountWei), 18)}
            </Text>
            <Text variant="caption" color="textSecondary">
              To {shortAddress(lastTx.to)} · {timeAgo(lastTx.at)}
            </Text>
          </View>
          <Button
            size="sm"
            variant="ghost"
            icon="external-link"
            label="View"
            accessibilityLabel="View last payment on explorer"
            onPress={() => void Linking.openURL(txUrl(lastTx.hash))}
          />
        </View>
      ) : (
        <Text variant="callout" color="textSecondary">
          No payments yet. Tap the bubble on any screen to pay.
        </Text>
      )}
    </Card>
  );
}

/**
 * Editable per-payment and daily caps, plus today's spend.
 * @param props.state Current caps and spend; null while loading.
 * @param props.onSaved Called after caps are stored.
 * @returns The limits card.
 */
function LimitsCard({ state, onSaved }: { state: LimitState | null; onSaved: () => void }) {
  const [perTx, setPerTx] = useState('');
  const [daily, setDaily] = useState('');
  const [saving, setSaving] = useState(false);
  const savedPerTx = state?.limits.perTxMon;
  const savedDaily = state?.limits.dailyMon;

  useEffect(() => {
    if (savedPerTx !== undefined && savedDaily !== undefined) {
      setPerTx(savedPerTx);
      setDaily(savedDaily);
    }
  }, [savedPerTx, savedDaily]);

  if (!state) {
    return (
      <Card style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </Card>
    );
  }

  const dirty = perTx !== state.limits.perTxMon || daily !== state.limits.dailyMon;
  const perTxError = dirty ? limitError(perTx) : null;
  const dailyError = dirty ? limitError(daily) : null;
  const usedPct = state.dailyWei > 0n ? Math.min(100, Number((state.spentWei * 100n) / state.dailyWei)) : 0;

  const save = async () => {
    setSaving(true);
    await saveLimits({ perTxMon: perTx, dailyMon: daily });
    setSaving(false);
    Keyboard.dismiss();
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSaved();
  };

  return (
    <Card style={styles.card}>
      <View style={styles.cardHead}>
        <Text variant="headline">Spending limits</Text>
        <Text variant="callout" color="textSecondary">
          Payments above these are blocked, whatever the agent proposes. Hard maximum {LIMIT_DEFAULTS.hardMaxMon} MON.
        </Text>
      </View>

      <LimitField label="Per payment" value={perTx} onChange={setPerTx} error={perTxError} />
      <LimitField label="Per day" value={daily} onChange={setDaily} error={dailyError} />

      <View style={styles.spend}>
        <View style={styles.rowBetween}>
          <Text variant="caption" color="textSecondary" style={styles.tabular}>
            Spent today {formatMon(state.spentWei)}
          </Text>
          <Text variant="captionStrong" color={usedPct >= 80 ? 'warning' : 'text'} style={styles.tabular}>
            {formatMon(state.remainingWei)} left
          </Text>
        </View>
        <View
          style={styles.track}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Daily limit used"
          accessibilityValue={{ min: 0, max: 100, now: usedPct }}
        >
          <View style={[styles.fill, { width: `${usedPct}%`, backgroundColor: usedPct >= 80 ? colors.warning : colors.primary }]} />
        </View>
      </View>

      {dirty ? <Button label="Save limits" loading={saving} disabled={!!perTxError || !!dailyError} onPress={() => void save()} /> : null}
    </Card>
  );
}

/**
 * One cap input with a MON suffix and inline error.
 * @param props.label Row label.
 * @param props.value Current text.
 * @param props.onChange Text change handler (commas become dots).
 * @param props.error Validation message, or null.
 * @returns A labelled input row.
 */
function LimitField({ label, value, onChange, error }: { label: string; value: string; onChange: (v: string) => void; error: string | null }) {
  return (
    <View style={styles.limitField}>
      <View style={styles.rowBetween}>
        <Text variant="body" style={styles.flex}>
          {label}
        </Text>
        <View style={[styles.amountBox, error && styles.amountBoxError]}>
          <TextInput
            value={value}
            onChangeText={(v) => onChange(v.replace(',', '.'))}
            keyboardType="decimal-pad"
            maxLength={8}
            accessibilityLabel={`${label} limit in MON`}
            style={styles.amountInput}
          />
          <Text variant="callout" color="textTertiary">
            MON
          </Text>
        </View>
      </View>
      {error ? <FieldError text={error} /> : null}
    </View>
  );
}

/**
 * Inline error line.
 * @param props.text Message.
 * @returns Red caption with an icon, announced politely.
 */
function FieldError({ text }: { text: string }) {
  return (
    <View style={styles.inline} accessibilityLiveRegion="polite">
      <Feather name="alert-circle" size={13} color={colors.danger} />
      <Text variant="caption" color="danger" style={styles.flex}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingHorizontal: space.xl, gap: space.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.xs },
  flex: { flex: 1 },
  tabular: { fontVariant: ['tabular-nums'] },
  card: { gap: space.lg, padding: space.xl, borderRadius: radius.xl },
  cardHead: { gap: space.xs },
  centered: { alignItems: 'center', paddingVertical: space.xxl, borderRadius: radius.xl },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  inline: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  linkRow: { flexDirection: 'row', justifyContent: 'space-between' },
  field: {
    ...typeScale.body,
    minHeight: HIT,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    color: colors.text,
  },
  codeField: { fontFamily: fonts.mono, fontSize: 22, letterSpacing: 8, textAlign: 'center', minHeight: 56 },
  balanceRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm, marginTop: -space.sm },
  addressBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingLeft: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  iconButton: { width: HIT, height: HIT, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  iconButtonPressed: { backgroundColor: colors.border },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  limitField: { gap: space.xs },
  amountBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    width: 128,
    minHeight: HIT,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  amountBoxError: { borderColor: colors.danger },
  amountInput: { ...typeScale.bodyStrong, flex: 1, color: colors.text, textAlign: 'right', fontVariant: ['tabular-nums'], padding: 0 },
  spend: { gap: space.sm },
  track: { height: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
  footer: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.xs, marginTop: space.sm },
  footerIcon: { marginTop: 2 },
});
