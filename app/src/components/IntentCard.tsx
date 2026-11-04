/**
 * @file "Review payment" card: amount, recipient (ENS name over the full address),
 * source, fee/total/balance-after, the Scam Shield verdict with its reasons,
 * expiry, then Confirm/Cancel (or hold-to-confirm) and the execution status.
 * A "Likely scam" verdict swaps the emphasis: "Don't pay" becomes the primary action.
 */
import { Icon } from './Icon';
import type { ConnectedEthereumWallet } from '@privy-io/expo';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import type { Address, Hash } from 'viem';
import { config } from '../config';
import type { DeviceAuthStatus } from '../deviceAuth';
import { useIntentExecution } from '../execute';
import { formatMon, MAINNET_CHAIN_ID, NETWORKS, type Intent } from '../intent';
import { paymentLevel, type Assessment } from '../risk';
import { colors, HIT, radius, space } from '../theme';
import { intentCost } from '../validateIntent';
import { paymentSpeech, speak } from '../voice';
import { AddressText } from './AddressText';
import { AgentAvatar } from './AgentAvatar';
import { displayMemo } from './format';
import { HoldButton } from './HoldButton';
import { PaymentStatus } from './PaymentStatus';
import { RiskPanel, SIGNAL_COPY, WARNING_COPY } from './RiskVerdict';
import { Button, Card, Text, type IconName } from './ui';

/** One line on the confirm card for each device-auth result. The control below still follows `authMode`. */
const AUTH_LINE: Record<DeviceAuthStatus, string> = {
  biometric: 'Your fingerprint confirms this payment.',
  pin: 'Your screen lock confirms this payment.',
  'not-enrolled': 'Add a fingerprint or screen lock in Settings.',
  unavailable: "This device can't use biometrics, so hold to confirm.",
  error: 'The check failed.',
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
      return { icon: 'smartphone', text: `Found on screen in ${app}` };
    case 'clipboard':
      return { icon: 'clipboard', text: 'From clipboard' };
    case 'agent':
      return { icon: 'cpu', text: `Requested by ${app}` };
    case 'user':
      return { icon: 'message-circle', text: 'From your message' };
    case 'both':
      return { icon: 'smartphone', text: `Found in ${app} and in your message` };
  }
}

type Props = {
  intent: Intent;
  wallet: ConnectedEthereumWallet | null;
  address: Address | null;
  /** Called when the payment confirms or reverts. */
  onSettled?: () => void;
  /** The turn's screen verdict; it can raise this payment's label. */
  screen?: Assessment | null;
  /** Called once with the hash when the payment is sent (agent requests report it back). */
  onSent?: (hash: Hash) => void;
  /** Called when the user declines. */
  onDeclined?: () => void;
};

/**
 * Review card for one intent.
 * @param props.intent Locally prepared intent.
 * @param props.wallet Privy embedded wallet (null while being created).
 * @param props.address Wallet address.
 * @param props.onSettled Refresh hook after the payment settles.
 * @param props.screen The turn's screen verdict.
 * @returns The card, or a one-line note once the user cancels it.
 */
export function IntentCard({ intent, wallet, address, onSettled, screen = null, onSent, onDeclined }: Props) {
  const exec = useIntentExecution(intent, wallet, address, onSettled);
  const [declined, setDeclined] = useState(false);
  const { state, check, balanceWei, walletStatus, authMode, deviceAuth } = exec;
  const cost = intentCost(intent);
  const source = sourceLine(intent.provenance);
  const actionable = state.status === 'idle' || state.status === 'cancelled';
  // Confirm stays disabled until checks pass and the wallet provider has resolved (spinner meanwhile).
  const preparing = check === null || walletStatus === 'loading';
  const confirmBlocked = !check?.ok || walletStatus !== 'ready' || authMode === null;
  const short = balanceWei !== null && cost !== null && balanceWei < cost.total;
  const amount = intent.amountDisplay.replace(/\s*MON$/, '');
  const memo = displayMemo(intent.memo);
  // Ellipsis while the balance loads; never a negative balance.
  const balanceAfter = short ? 'Not enough MON' : balanceWei !== null && cost ? formatMon(balanceWei - cost.total) : '…';
  const level = paymentLevel(intent.warnings, screen);
  // Payment reasons in WARNING_COPY order (most serious first), then what the screen showed.
  const order = Object.keys(WARNING_COPY);
  const reasons = [
    ...[...intent.warnings].sort((a, b) => order.indexOf(a) - order.indexOf(b)).map((w) => WARNING_COPY[w]),
    ...(screen?.signals ?? []).map((s) => SIGNAL_COPY[s]),
  ];
  const name = intent.ensName ?? intent.primaryName;
  const decline = () => {
    void Haptics.selectionAsync();
    setDeclined(true);
    onDeclined?.();
  };
  const sentHash = 'hash' in state ? state.hash : null;
  const reported = useRef(false);
  useEffect(() => {
    if (!sentHash || reported.current) return;
    reported.current = true;
    onSent?.(sentHash);
  }, [sentHash, onSent]);
  const requestedBy = intent.provenance.source === 'agent' ? intent.provenance.appLabel : undefined;
  const mainnet = intent.chainId === MAINNET_CHAIN_ID;

  if (declined) {
    return (
      <View style={styles.declined} accessibilityRole="text">
        <Icon name="x-circle" size={14} color={colors.textTertiary} />
        <Text variant="caption" color="textTertiary">
          Payment of {intent.amountDisplay} cancelled.
        </Text>
      </View>
    );
  }

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text variant="overline" color="textTertiary" accessibilityRole="header">
          Review payment
        </Text>
        <View style={styles.inline}>
          {actionable ? <ExpiryCountdown expiresAt={intent.expiresAt} /> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Read this payment aloud"
            onPress={() => speak(paymentSpeech(intent, level, requestedBy))}
            hitSlop={space.sm}
            style={({ pressed }) => [styles.speaker, pressed && styles.speakerPressed]}
          >
            <Icon name="volume-2" size={16} color={colors.textSecondary} />
          </Pressable>
        </View>
      </View>

      <View style={styles.hero}>
        <View
          style={[styles.network, mainnet ? styles.networkMain : styles.networkTest]}
          accessible
          accessibilityLabel={mainnet ? 'Monad Mainnet. This moves real MON.' : 'Monad Testnet'}
        >
          <View style={[styles.dot, { backgroundColor: mainnet ? colors.mainnet : colors.testnet }]} />
          <Text variant="captionStrong" color={mainnet ? 'mainnet' : 'testnet'}>
            {mainnet ? 'Monad Mainnet · real MON' : NETWORKS[intent.chainId].name}
          </Text>
        </View>
        <View style={styles.amount} accessible accessibilityLabel={`Send ${intent.amountDisplay}`}>
          <Text variant="display" numberOfLines={1} adjustsFontSizeToFit style={styles.amountFigure}>
            {amount}
          </Text>
          <Text variant="headline" color="textSecondary">
            MON
          </Text>
        </View>
        <View style={styles.recipient}>
          <Text variant="caption" color="textSecondary">
            To
          </Text>
          {name ? (
            <Text variant="headline" numberOfLines={1} ellipsizeMode="middle" accessibilityLabel={`ENS name ${name}`}>
              {name}
            </Text>
          ) : null}
          <AddressText address={intent.to} />
          <View style={styles.inline}>
            {requestedBy ? (
              <AgentAvatar name={requestedBy} size={20} />
            ) : (
              <Icon name={source.icon} size={14} color={colors.textSecondary} />
            )}
            <Text variant="caption" color="textSecondary" style={styles.flex}>
              {source.text}
            </Text>
          </View>
          {memo ? (
            <Text
              variant="caption"
              color="textTertiary"
              numberOfLines={1}
              ellipsizeMode="tail"
              accessibilityLabel={`For: ${memo}`}
            >
              For: {memo}
            </Text>
          ) : null}
        </View>
      </View>

      <View>
        <DetailRow label="Network fee" value={intent.estFeeDisplay} />
        <DetailRow label="Total" value={cost ? formatMon(cost.total, 6) : '…'} strong />
        <DetailRow label="Balance after" value={balanceAfter} />
      </View>

      <RiskPanel level={level} reasons={reasons} />

      {actionable ? (
        <View style={styles.stack}>
          {check && !check.ok ? (
            <ReasonRow text={check.reason}>
              {'retryable' in check ? (
                <Button size="sm" variant="secondary" icon="refresh-cw" label="Try again" onPress={() => void exec.recheck()} />
              ) : null}
              {short && !mainnet ? (
                <Button
                  size="sm"
                  variant="secondary"
                  icon="droplet"
                  label="Get testnet MON"
                  onPress={() => void Linking.openURL(config.faucetUrl)}
                />
              ) : null}
            </ReasonRow>
          ) : null}
          {walletStatus === 'error' ? <ReasonRow text="Your wallet isn't ready. Close and reopen Orb." /> : null}
          {state.status === 'cancelled' ? (
            <Text variant="caption" color="textSecondary" align="center" accessibilityLiveRegion="polite">
              Not confirmed. You can try again.
            </Text>
          ) : null}
          {deviceAuth ? (
            <Text variant="caption" color="textSecondary" accessibilityLiveRegion="polite">
              {AUTH_LINE[deviceAuth]}
            </Text>
          ) : null}
          {level === 'scam' ? <Button label="Don't pay" icon="x" onPress={decline} /> : null}
          {authMode === 'hold' ? (
            <HoldButton disabled={confirmBlocked || preparing} onComplete={() => void exec.confirm()} />
          ) : (
            <Button
              variant={level === 'scam' ? 'secondary' : 'primary'}
              label={level === 'scam' ? 'Pay anyway' : 'Confirm'}
              icon="shield"
              loading={preparing}
              disabled={confirmBlocked}
              accessibilityHint="Asks for your fingerprint or PIN, then sends"
              onPress={() => void exec.confirm()}
            />
          )}
          {level === 'scam' ? null : <Button variant="ghost" label="Cancel" onPress={decline} />}
        </View>
      ) : (
        <PaymentStatus state={state} chainId={intent.chainId} onCheckAgain={() => void exec.checkAgain()} />
      )}
    </Card>
  );
}

/**
 * Label/value row with a hairline divider above it.
 * @param props.label Row label.
 * @param props.value Right-aligned value.
 * @param props.strong Emphasize the value (the total).
 * @returns A row.
 */
function DetailRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text variant="overline" color="textTertiary">
        {label}
      </Text>
      <Text variant={strong ? 'amount' : 'callout'} style={[styles.tabular, styles.value]}>
        {value}
      </Text>
    </View>
  );
}

/**
 * Muted row explaining why Confirm is disabled, with optional fix-it actions.
 * @param props.text Reason.
 * @param props.children Small action buttons.
 * @returns The row.
 */
function ReasonRow({ text, children }: { text: string; children?: ReactNode }) {
  return (
    <View style={styles.reason}>
      <View style={styles.reasonHead}>
        <Icon name="info" size={15} color={colors.textSecondary} style={styles.rowIcon} />
        <Text variant="captionStrong" color="textSecondary" style={styles.flex} accessibilityLiveRegion="polite">
          {text}
        </Text>
      </View>
      {children ? <View style={styles.reasonActions}>{children}</View> : null}
    </View>
  );
}

/**
 * Subtle "Expires in m:ss" label; owns its own one-second timer so the card doesn't re-render.
 * The expiry check itself lives in `useIntentExecution`, which re-validates at `expiresAt`.
 * @param props.expiresAt Intent expiry (epoch ms).
 * @returns The label.
 */
function ExpiryCountdown({ expiresAt }: { expiresAt: number }) {
  const [now, setNow] = useState(Date.now);
  const left = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const expired = left === 0;

  useEffect(() => {
    if (expired) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [expired]);

  const label = expired ? 'Expired' : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  return (
    <View style={styles.inline} accessible accessibilityLabel={expired ? 'Payment expired' : `Expires in ${label}`}>
      <Icon name="clock" size={12} color={expired ? colors.danger : colors.textTertiary} />
      <Text variant="overline" color={expired ? 'danger' : 'textTertiary'} style={styles.tabular}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.lg, padding: space.xl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 24 },
  flex: { flex: 1 },
  tabular: { fontVariant: ['tabular-nums'] },
  value: { flexShrink: 1, textAlign: 'right' },
  hero: { gap: space.md },
  network: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.xs + 1,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  networkMain: { backgroundColor: colors.successSoft },
  networkTest: { backgroundColor: colors.testnetSoft },
  dot: { width: 7, height: 7, borderRadius: 4 },
  amount: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  amountFigure: { flexShrink: 1 },
  recipient: { gap: space.xs },
  inline: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 2 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.md,
    minHeight: 48,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  stack: { gap: space.sm },
  speaker: { width: HIT - space.md, height: HIT - space.md, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  speakerPressed: { backgroundColor: colors.surfaceMuted },
  rowIcon: { marginTop: 1 },
  reason: { gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
  reasonHead: { flexDirection: 'row', gap: space.sm },
  reasonActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  declined: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm, alignSelf: 'center' },
});
