/**
 * @file Payment confirm card (spec §7.6/§7.7): amount, full recipient, source,
 * fee/total/balance-after, plain-language warnings, Confirm/Cancel (or
 * hold-to-confirm) and the execution state with explorer links.
 */
import { Feather } from '@expo/vector-icons';
import type { ConnectedEthereumWallet } from '@privy-io/expo';
import * as Haptics from 'expo-haptics';
import { useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Linking, Pressable, StyleSheet, View } from 'react-native';
import type { Address } from 'viem';
import { config, txUrl } from '../config';
import { useIntentExecution, type ExecState } from '../execute';
import { formatMon, type Intent, type IntentWarning } from '../intent';
import { colors, HIT, radius, space } from '../theme';
import { intentCost } from '../validateIntent';
import { AddressText } from './AddressText';
import { Button, Card, Pill, Text, type IconName } from './ui';

const HOLD_MS = 1500;

/** Plain-language copy for each warning (spec §8 where defined). */
const WARNING_COPY: Record<IntentWarning, string> = {
  NEW_RECIPIENT: "You haven't paid this address before. Check it matches.",
  RECIPIENT_IS_CONTRACT: 'This address is a contract. Funds may not be recoverable.',
  SELF_TRANSFER: 'This is your own address.',
  AMOUNT_NOT_IN_CONTEXT: "This amount doesn't appear on your screen or in your message.",
  PARSED_WITHOUT_AI: 'Read by the basic parser while the agent is offline. Double-check every detail.',
  CLOSE_TO_DAILY_LIMIT: "This uses most of today's spending limit.",
};

const STATE_PILL: Partial<Record<ExecState['status'], { label: string; tone: 'neutral' | 'primary' | 'success' | 'warning' | 'danger' }>> = {
  confirming: { label: 'Approving', tone: 'primary' },
  signing: { label: 'Signing', tone: 'primary' },
  submitted: { label: 'Submitted', tone: 'primary' },
  confirmed: { label: 'Confirmed', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  pending_timeout: { label: 'Pending', tone: 'warning' },
  cancelled: { label: 'Not confirmed', tone: 'neutral' },
};

/**
 * Where the recipient came from, as shown under the address.
 * @param p Intent provenance.
 * @returns Icon and source line.
 */
function sourceLine(p: Intent['provenance']): { icon: IconName; text: string } {
  const app = p.appLabel ?? 'another app';
  switch (p.source) {
    case 'screen':
      return { icon: 'eye', text: `Found on screen in ${app}` };
    case 'clipboard':
      return { icon: 'clipboard', text: 'From clipboard' };
    case 'user':
      return { icon: 'message-circle', text: 'From your message' };
    case 'both':
      return { icon: 'eye', text: `Found in ${app} and in your message` };
  }
}

type Props = {
  intent: Intent;
  wallet: ConnectedEthereumWallet | null;
  address: Address | null;
  /** Called when the payment confirms or reverts. */
  onSettled?: () => void;
};

/**
 * Confirm card for one intent.
 * @param props.intent Locally prepared intent.
 * @param props.wallet Privy embedded wallet (null while being created).
 * @param props.address Wallet address.
 * @param props.onSettled Refresh hook after the payment settles.
 * @returns The card.
 */
export function IntentCard({ intent, wallet, address, onSettled }: Props) {
  const exec = useIntentExecution(intent, wallet, address, onSettled);
  const [declined, setDeclined] = useState(false);
  const { state, check, balanceWei, walletStatus, authMode } = exec;
  const cost = intentCost(intent);
  const source = sourceLine(intent.provenance);
  const pill = STATE_PILL[state.status];
  const actionable = state.status === 'idle' || state.status === 'cancelled';
  // Confirm stays disabled until checks pass and the wallet provider has resolved (spinner meanwhile).
  const preparing = check === null || walletStatus === 'loading';
  const confirmBlocked = !check?.ok || walletStatus !== 'ready' || authMode === null;

  if (declined) {
    return (
      <View style={styles.declined} accessibilityRole="text">
        <Feather name="x" size={14} color={colors.textTertiary} />
        <Text variant="caption" color="textTertiary">
          Payment of {intent.amountDisplay} cancelled.
        </Text>
      </View>
    );
  }

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.badge}>
          <Feather name="arrow-up-right" size={18} color={colors.primary} />
        </View>
        <View style={styles.flex}>
          <Text variant="overline" color="textTertiary">
            Payment
          </Text>
          <Text variant="title" style={styles.tabular} accessibilityRole="header">
            Send {intent.amountDisplay}
          </Text>
        </View>
        {pill ? <Pill label={pill.label} tone={pill.tone} /> : null}
      </View>

      <View style={styles.section}>
        <Text variant="caption" color="textTertiary">
          To
        </Text>
        <AddressText address={intent.to} />
        <View style={styles.inline}>
          <Feather name={source.icon} size={13} color={colors.textSecondary} />
          <Text variant="caption" color="textSecondary">
            {source.text}
          </Text>
        </View>
      </View>

      <View style={styles.rows}>
        <Row label="Network fee (est.)" value={intent.estFeeDisplay} />
        <Row label="Total" value={cost ? formatMon(cost.total, 6) : '—'} strong />
        <Row
          label="Balance after"
          value={balanceWei !== null && cost && balanceWei >= cost.total ? formatMon(balanceWei - cost.total) : '—'}
        />
      </View>

      {intent.warnings.length ? (
        <View style={styles.warnings}>
          {intent.warnings.map((w) => (
            <View key={w} style={styles.warning} accessibilityRole="alert">
              <Feather name="alert-triangle" size={14} color={colors.warning} style={styles.warningIcon} />
              <Text variant="caption" color="warning" style={styles.flex}>
                {WARNING_COPY[w]}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {actionable && check && !check.ok ? (
        <View style={styles.blocked}>
          <View style={styles.inline}>
            <Feather name="slash" size={14} color={colors.danger} />
            <Text variant="captionStrong" color="danger" style={styles.flex} accessibilityLiveRegion="polite">
              {check.reason}
            </Text>
          </View>
          <View style={styles.inline}>
            {'retryable' in check ? <Button size="sm" variant="secondary" label="Try again" onPress={() => void exec.recheck()} /> : null}
            {balanceWei !== null && cost && balanceWei < cost.total ? (
              <Button
                size="sm"
                variant="secondary"
                icon="droplet"
                label="Get testnet MON"
                onPress={() => void Linking.openURL(config.faucetUrl)}
              />
            ) : null}
          </View>
        </View>
      ) : null}

      {actionable ? (
        <>
          {state.status === 'cancelled' ? (
            <Text variant="caption" color="textSecondary">
              Not confirmed. You can try again.
            </Text>
          ) : null}
          {walletStatus === 'error' ? (
            <Text variant="caption" color="danger">
              {"Your wallet isn't ready. Close and reopen Bubble Agent."}
            </Text>
          ) : null}
          <View style={styles.actions}>
            <Button
              variant="secondary"
              label="Cancel"
              style={styles.flex}
              onPress={() => {
                void Haptics.selectionAsync();
                setDeclined(true);
              }}
            />
            {authMode === 'hold' ? (
              <HoldButton disabled={confirmBlocked || preparing} onComplete={() => void exec.confirm()} />
            ) : (
              <Button
                label="Confirm"
                icon="lock"
                loading={preparing}
                disabled={confirmBlocked}
                accessibilityHint="Asks for your fingerprint or PIN, then sends"
                style={styles.grow}
                onPress={() => void exec.confirm()}
              />
            )}
          </View>
        </>
      ) : (
        <Status state={state} onCheckAgain={() => void exec.checkAgain()} />
      )}
    </Card>
  );
}

/**
 * Label/value row with tabular numbers.
 * @param props.label Left label.
 * @param props.value Right value.
 * @param props.strong Emphasize the value.
 * @returns A row.
 */
function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text variant="callout" color="textSecondary">
        {label}
      </Text>
      <Text variant={strong ? 'bodyStrong' : 'callout'} style={styles.tabular}>
        {value}
      </Text>
    </View>
  );
}

/**
 * In-flight and terminal states with explorer links.
 * @param props.state Execution state (not idle/cancelled).
 * @param props.onCheckAgain Re-checks after a receipt timeout.
 * @returns Status block.
 */
function Status({ state, onCheckAgain }: { state: ExecState; onCheckAgain: () => void }) {
  const hash = 'hash' in state ? state.hash : null;
  const explorer = hash ? (
    <Button size="sm" variant="ghost" icon="external-link" label="View on explorer" onPress={() => void Linking.openURL(txUrl(hash))} />
  ) : null;

  switch (state.status) {
    case 'confirming':
    case 'signing':
    case 'submitted':
      return (
        <View style={styles.status} accessibilityLiveRegion="polite">
          <View style={styles.inline}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text variant="callout" color="textSecondary">
              {state.status === 'confirming'
                ? 'Waiting for your approval…'
                : state.status === 'signing'
                  ? 'Signing and sending…'
                  : 'Submitted. Waiting for confirmation…'}
            </Text>
          </View>
          {explorer}
        </View>
      );
    case 'confirmed':
      return (
        <View style={styles.status} accessibilityLiveRegion="polite">
          <View style={styles.inline}>
            <Feather name="check-circle" size={18} color={colors.success} />
            <Text variant="bodyStrong" color="success" style={styles.tabular}>
              {state.ms === null ? 'Confirmed.' : `Confirmed in ${state.ms} ms.`}
            </Text>
          </View>
          {explorer}
        </View>
      );
    case 'failed':
      return (
        <View style={styles.status} accessibilityLiveRegion="polite">
          <View style={styles.inline}>
            <Feather name="x-circle" size={18} color={colors.danger} />
            <Text variant="callout" color="danger" style={styles.flex}>
              {state.reason}
            </Text>
          </View>
          {explorer}
        </View>
      );
    case 'pending_timeout':
      return (
        <View style={styles.status} accessibilityLiveRegion="polite">
          <View style={styles.inline}>
            <Feather name="clock" size={18} color={colors.warning} />
            <Text variant="callout" color="warning">
              Still pending
            </Text>
          </View>
          <View style={styles.inline}>
            <Button size="sm" variant="secondary" icon="refresh-cw" label="Check again" onPress={onCheckAgain} />
            {explorer}
          </View>
        </View>
      );
    default:
      return null;
  }
}

/**
 * Hold-to-confirm fallback when no biometric or PIN is enrolled (1.5 s press).
 * @param props.disabled Blocks the gesture.
 * @param props.onComplete Called once the hold completes.
 * @returns A primary-styled button with a fill that tracks the hold.
 */
function HoldButton({ disabled, onComplete }: { disabled: boolean; onComplete: () => void }) {
  const progress = useRef(new Animated.Value(0)).current;

  const start = () => {
    void Haptics.selectionAsync();
    Animated.timing(progress, { toValue: 1, duration: HOLD_MS, easing: Easing.linear, useNativeDriver: true }).start(({ finished }) => {
      if (!finished) return;
      progress.setValue(0);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onComplete();
    });
  };
  const release = () => Animated.timing(progress, { toValue: 0, duration: 150, useNativeDriver: true }).start();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Hold to confirm"
      accessibilityHint="Press and hold for one and a half seconds to send"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPressIn={start}
      onPressOut={release}
      style={[styles.hold, styles.grow, disabled && styles.inactive]}
    >
      <Animated.View style={[styles.holdFill, { transform: [{ scaleX: progress }] }]} />
      <Feather name="lock" size={17} color={colors.textInverse} />
      <Text variant="bodyStrong" color="textInverse">
        Hold to confirm
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.lg, padding: space.xl, borderRadius: radius.xl },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  badge: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
  grow: { flex: 2 },
  tabular: { fontVariant: ['tabular-nums'] },
  section: { gap: space.xs + 2 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  rows: {
    gap: space.sm,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  warnings: { gap: space.xs },
  warning: {
    flexDirection: 'row',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.sm,
    backgroundColor: colors.warningSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.warningBorder,
  },
  warningIcon: { marginTop: 1 },
  blocked: { gap: space.sm, padding: space.md, borderRadius: radius.sm, backgroundColor: colors.dangerSoft },
  actions: { flexDirection: 'row', gap: space.md },
  status: { gap: space.sm, alignItems: 'flex-start' },
  hold: {
    minHeight: HIT,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    overflow: 'hidden',
  },
  holdFill: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.primaryPressed, transformOrigin: 'left' },
  inactive: { opacity: 0.45 },
  declined: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm, alignSelf: 'center' },
});
