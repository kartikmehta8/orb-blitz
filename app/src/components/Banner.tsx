/**
 * @file Inline status banner with optional actions, plus the pending-payment
 * banner shared by Home and the Ask sheet. Tones map to the semantic palette only.
 */
import { Feather } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { txUrl } from '../config';
import { formatMon, shortAddress } from '../intent';
import type { PendingStatus } from '../pendingTx';
import { colors, radius, space } from '../theme';
import { Button, Text, type IconName } from './ui';

type Tone = 'neutral' | 'warning' | 'danger';

const TONES: Record<Tone, { bg: string; border: string; fg: 'textSecondary' | 'warning' | 'danger' }> = {
  neutral: { bg: colors.surfaceMuted, border: colors.border, fg: 'textSecondary' },
  warning: { bg: colors.warningSoft, border: colors.warningBorder, fg: 'warning' },
  danger: { bg: colors.dangerSoft, border: colors.dangerSoft, fg: 'danger' },
};

/**
 * Banner row: icon, text and trailing actions.
 * @param props.tone Semantic tone.
 * @param props.icon Feather icon name.
 * @param props.title Bold first line.
 * @param props.body Optional secondary line.
 * @param props.children Optional actions (small buttons), shown on the right.
 * @returns A banner view announced as an alert.
 */
export function Banner({
  tone,
  icon,
  title,
  body,
  children,
}: {
  tone: Tone;
  icon: IconName;
  title: string;
  body?: string;
  children?: ReactNode;
}) {
  const t = TONES[tone];
  return (
    <View accessibilityRole="alert" style={[styles.row, { backgroundColor: t.bg, borderColor: t.border }]}>
      <Feather name={icon} size={16} color={colors[t.fg]} style={styles.icon} />
      <View style={styles.text}>
        <Text variant="captionStrong" color={t.fg}>
          {title}
        </Text>
        {body ? (
          <Text variant="caption" color="textSecondary">
            {body}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/**
 * Pending-payment banner (spec §7.8). Renders nothing unless the slot is pending or unknown.
 * @param props.status Result of `checkPending`.
 * @param props.onRecheck Re-checks the receipt.
 * @returns A banner, or null.
 */
export function PendingBanner({ status, onRecheck }: { status: PendingStatus; onRecheck: () => void }) {
  if (status.kind === 'pending') {
    return (
      <Banner
        tone="warning"
        icon="clock"
        title={`Payment pending · ${formatMon(BigInt(status.tx.amountWei), 18)}`}
        body={`To ${shortAddress(status.tx.to)}. Waiting for Monad testnet.`}
      >
        <Button size="sm" variant="ghost" label="Check again" onPress={onRecheck} />
      </Banner>
    );
  }
  if (status.kind === 'unknown') {
    const { hash } = status.tx;
    return (
      <Banner tone="neutral" icon="help-circle" title="Unknown, check explorer" body="Your last payment didn't confirm in 10 minutes.">
        <Button size="sm" variant="ghost" label="Explorer" icon="external-link" onPress={() => void Linking.openURL(txUrl(hash))} />
      </Banner>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  icon: { alignSelf: 'flex-start', marginTop: 1 },
  text: { flex: 1, gap: space.xxs },
});
