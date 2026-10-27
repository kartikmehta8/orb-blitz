/**
 * @file "Review payment" card (spec §7.6/§7.7): amount, full recipient,
 * source, fee/total/balance-after, plain-language warnings, expiry, then
 * Confirm/Cancel (or hold-to-confirm) and the execution status with explorer links.
 */
import { Feather } from '@expo/vector-icons';
import type { ConnectedEthereumWallet } from '@privy-io/expo';
import * as Haptics from 'expo-haptics';
import { useEffect, useState, type ReactNode } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import type { Address } from 'viem';
import { config } from '../config';
import { useIntentExecution } from '../execute';
import { formatMon, type Intent, type IntentWarning } from '../intent';
import { colors, radius, space } from '../theme';
import { intentCost } from '../validateIntent';
import { AddressText } from './AddressText';
import { HoldButton } from './HoldButton';
import { PaymentStatus } from './PaymentStatus';
import { Button, Card, IconTile, Text, type IconName } from './ui';

/** Plain-language copy for each warning (spec §8 where defined). */
const WARNING_COPY: Record<IntentWarning, string> = {
  NEW_RECIPIENT: "You haven't paid this address before. Check it matches.",
  RECIPIENT_IS_CONTRACT: 'This address is a contract. Funds may not be recoverable.',
  SELF_TRANSFER: 'This is your own address.',
  AMOUNT_NOT_IN_CONTEXT: "This amount doesn't appear on your screen or in your message.",
  PARSED_WITHOUT_AI: 'Read by the basic parser while the agent is offline. Double-check every detail.',
  CLOSE_TO_DAILY_LIMIT: "This uses most of today's spending limit.",
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
};

/**
 * Review card for one intent.
 * @param props.intent Locally prepared intent.
 * @param props.wallet Privy embedded wallet (null while being created).
 * @param props.address Wallet address.
 * @param props.onSettled Refresh hook after the payment settles.
 * @returns The card, or a one-line note once the user cancels it.
 */
export function IntentCard({ intent, wallet, address, onSettled }: Props) {
  const exec = useIntentExecution(intent, wallet, address, onSettled);
  const [declined, setDeclined] = useState(false);
  const { state, check, balanceWei, walletStatus, authMode } = exec;
  const cost = intentCost(intent);
  const source = sourceLine(intent.provenance);
  const actionable = state.status === 'idle' || state.status === 'cancelled';
  // Confirm stays disabled until checks pass and the wallet provider has resolved (spinner meanwhile).
  const preparing = check === null || walletStatus === 'loading';
  const confirmBlocked = !check?.ok || walletStatus !== 'ready' || authMode === null;
  const short = balanceWei !== null && cost !== null && balanceWei < cost.total;
  const amount = intent.amountDisplay.replace(/\s*MON$/, '');
  // Ellipsis while the balance loads; never a negative balance.
  const balanceAfter = short ? 'Not enough MON' : balanceWei !== null && cost ? formatMon(balanceWei - cost.total) : '…';

  if (declined) {
    return (
      <View style={styles.declined} accessibilityRole="text">
        <Feather name="x-circle" size={14} color={colors.textTertiary} />
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
        {actionable ? <ExpiryCountdown expiresAt={intent.expiresAt} /> : null}
      </View>

      <View style={styles.amount} accessible accessibilityLabel={`Send ${intent.amountDisplay}`}>
        <Text variant="display">{amount}</Text>
        <Text variant="headline" color="textSecondary" style={styles.unit}>
          MON
        </Text>
      </View>

      <View style={styles.recipient}>
        <IconTile icon="user" size={36} />
        <View style={styles.recipientText}>
          <Text variant="overline" color="textTertiary">
            To
          </Text>
          <AddressText address={intent.to} />
          <View style={styles.inline}>
            <Feather name={source.icon} size={12} color={colors.textSecondary} />
            <Text variant="caption" color="textSecondary">
              {source.text}
            </Text>
          </View>
        </View>
      </View>

      <View>
        <DetailRow label="Network fee" value={intent.estFeeDisplay} />
        <DetailRow label="Total" value={cost ? formatMon(cost.total, 6) : '…'} strong />
        <DetailRow label="Balance after" value={balanceAfter} />
      </View>

      {intent.warnings.length ? (
        <View style={styles.stack}>
          {intent.warnings.map((w) => (
            <View key={w} style={styles.warning} accessibilityRole="alert">
              <Feather name="alert-triangle" size={15} color={colors.warning} style={styles.rowIcon} />
              <Text variant="caption" color="warning" style={styles.flex}>
                {WARNING_COPY[w]}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {actionable ? (
        <View style={styles.stack}>
          {check && !check.ok ? (
            <ReasonRow text={check.reason}>
              {'retryable' in check ? (
                <Button size="sm" variant="secondary" icon="refresh-cw" label="Try again" onPress={() => void exec.recheck()} />
              ) : null}
              {short ? (
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
          {authMode === 'hold' ? (
            <HoldButton disabled={confirmBlocked || preparing} onComplete={() => void exec.confirm()} />
          ) : (
            <Button
              label="Confirm"
              icon="shield"
              loading={preparing}
              disabled={confirmBlocked}
              accessibilityHint="Asks for your fingerprint or PIN, then sends"
              onPress={() => void exec.confirm()}
            />
          )}
          <Button
            variant="ghost"
            label="Cancel"
            onPress={() => {
              void Haptics.selectionAsync();
              setDeclined(true);
            }}
          />
        </View>
      ) : (
        <PaymentStatus state={state} onCheckAgain={() => void exec.checkAgain()} />
      )}
    </Card>
  );
}

/**
 * Label/value row with a hairline divider above it.
 * @param props.label Mono caps label.
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
      <Text variant={strong ? 'amount' : 'callout'} style={styles.tabular}>
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
        <Feather name="info" size={15} color={colors.textSecondary} style={styles.rowIcon} />
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
      <Feather name="clock" size={12} color={expired ? colors.danger : colors.textTertiary} />
      <Text variant="overline" color={expired ? 'danger' : 'textTertiary'} style={styles.tabular}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.lg, padding: space.xl, borderRadius: radius.xl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  flex: { flex: 1 },
  tabular: { fontVariant: ['tabular-nums'] },
  amount: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: space.sm, paddingVertical: space.xs },
  unit: { marginBottom: space.xs },
  recipient: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
  recipientText: { flex: 1, gap: space.xs },
  inline: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 2 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 44,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  stack: { gap: space.sm },
  warning: {
    flexDirection: 'row',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.warningSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.warningBorder,
  },
  rowIcon: { marginTop: 1 },
  reason: { gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
  reasonHead: { flexDirection: 'row', gap: space.sm },
  reasonActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  declined: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm, alignSelf: 'center' },
});
