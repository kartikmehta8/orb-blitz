/**
 * @file Inline status banner with optional actions, plus the pending-payment
 * banner shared by the Wallet tab and the Ask sheet. Tones map to the semantic palette only.
 */
import type { ReactNode } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { txUrl } from '../config';
import type { OrbApiError } from '../errors';
import { formatMon, NETWORKS, shortAddress, TESTNET_CHAIN_ID } from '../intent';
import type { PendingStatus } from '../pendingTx';
import type { PendingPhase } from '../pendingView';
import { colors, radius, space } from '../theme';
import { Button, IconTile, Text, type IconName } from './ui';

type Tone = 'neutral' | 'warning' | 'danger';

const TONES: Record<Tone, { bg: string; border: string; fg: 'text' | 'warning' | 'danger' }> = {
  neutral: { bg: colors.surface, border: colors.border, fg: 'text' },
  warning: { bg: colors.warningSoft, border: colors.warningBorder, fg: 'warning' },
  danger: { bg: colors.dangerSoft, border: colors.dangerSoft, fg: 'danger' },
};

/**
 * Banner row: tinted icon tile, text and trailing actions.
 * @param props.tone Semantic tone.
 * @param props.icon Icon name.
 * @param props.title Bold first line.
 * @param props.body Optional secondary line.
 * @param props.children Optional actions (small buttons), shown on the right.
 * @returns A banner view announced as an alert.
 */
function Banner({
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
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.row, { backgroundColor: t.bg, borderColor: t.border }]}
    >
      <IconTile icon={icon} tone={tone} size={32} />
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
 * Sentence for a failed pending check. Keeps the last chain result in the copy
 * when one exists, and never treats the failure as "no payment".
 * @param error Failure from `usePendingTx`, when the hook has one.
 * @param status Last chain result. Unchanged by the failure.
 * @returns Title and body for the error banner.
 */
function pendingErrorCopy(error: OrbApiError | null, status: PendingStatus): { title: string; body: string } {
  const why =
    error?.code === 'timeout' ? 'The check timed out.' : error?.code === 'parse' ? 'The saved payment couldn’t be read.' : 'The check failed.';
  const kept = status.kind === 'pending' || status.kind === 'unknown' ? 'Nothing was changed.' : 'Nothing was sent.';
  return { title: 'Couldn’t check for a payment', body: `${why} ${kept}` };
}

/**
 * Pending-payment banner driven by `usePendingTx`.
 * `loading` is a quiet line, `pending` is the payment, `error` offers Retry,
 * and `none` renders nothing.
 * @param props.phase Check phase.
 * @param props.status Last chain result. Kept when a check throws.
 * @param props.error Failure behind `phase === 'error'`.
 * @param props.onRetry Runs the check again. Does not throw.
 * @returns A banner, a quiet loading row, or null.
 */
export function PendingBanner({
  phase,
  status,
  error,
  onRetry,
}: {
  phase: PendingPhase;
  status: PendingStatus;
  error: OrbApiError | null;
  onRetry: () => void;
}) {
  if (phase === 'none') return null;
  if (phase === 'loading') {
    return (
      <View
        accessible
        accessibilityLabel="Checking for a payment"
        accessibilityLiveRegion="polite"
        style={styles.quiet}
      >
        <Text variant="caption" color="textTertiary">
          Checking for a payment
        </Text>
      </View>
    );
  }
  if (phase === 'error') {
    const copy = pendingErrorCopy(error, status);
    return (
      <Banner tone="danger" icon="alert-circle" title={copy.title} body={copy.body}>
        <Button
          size="sm"
          variant="secondary"
          label="Retry"
          accessibilityLabel="Retry checking for a payment"
          onPress={onRetry}
        />
      </Banner>
    );
  }
  if (status.kind === 'pending') {
    return (
      <Banner
        tone="warning"
        icon="clock"
        title={`Payment pending · ${formatMon(BigInt(status.tx.amountWei), 18)}`}
        body={`To ${status.tx.ensName ?? shortAddress(status.tx.to)}. Waiting for ${NETWORKS[status.tx.chainId ?? TESTNET_CHAIN_ID].name}.`}
      >
        <Button size="sm" variant="secondary" label="Check" accessibilityLabel="Check payment again" onPress={onRetry} />
      </Banner>
    );
  }
  if (status.kind === 'unknown') {
    const { hash } = status.tx;
    return (
      <Banner tone="neutral" icon="help-circle" title="Unknown, check explorer" body="Your last payment didn't confirm in 10 minutes.">
        <Button
          size="sm"
          variant="secondary"
          label="View"
          icon="external-link"
          accessibilityLabel="View payment on explorer"
          onPress={() => void Linking.openURL(txUrl(hash))}
        />
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
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  text: { flex: 1, gap: space.xxs },
  quiet: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
});
