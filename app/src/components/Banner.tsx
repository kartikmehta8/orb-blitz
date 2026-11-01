/**
 * @file Inline status banner with optional actions, plus the pending-payment
 * banner shared by the Wallet tab and the Ask sheet. Tones map to the semantic palette only.
 */
import { useState, type ReactNode } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { publicClient } from '../chain';
import { txUrl } from '../config';
import { formatMon, shortAddress } from '../intent';
import { checkPending, type PendingStatus } from '../pendingTx';
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
 * @param props.icon Feather icon name.
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
    <View accessibilityRole="alert" style={[styles.row, { backgroundColor: t.bg, borderColor: t.border }]}>
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
 * Pending-payment banner. Renders nothing unless the slot is pending or unknown.
 * @param props.status Result of `checkPending`.
 * @param props.onRecheck Re-checks the receipt.
 * @returns A banner, or null.
 */
export function PendingBanner({ status, onRecheck }: { status: PendingStatus; onRecheck: () => void }) {
  const [checkError, setCheckError] = useState(false);

  // Call the chain check here. On failure, do not call `onRecheck`: that path
  // treats a throw as "no pending payment" and would remove this banner.
  const recheck = () => {
    void (async () => {
      try {
        await checkPending(publicClient);
        setCheckError(false);
        onRecheck();
      } catch {
        setCheckError(true);
      }
    })();
  };

  if (status.kind === 'pending') {
    return (
      <Banner
        tone={checkError ? 'danger' : 'warning'}
        icon={checkError ? 'alert-circle' : 'clock'}
        title={checkError ? 'Couldn’t check this payment' : `Payment pending · ${formatMon(BigInt(status.tx.amountWei), 18)}`}
        body={
          checkError
            ? 'It is still pending. Nothing was changed.'
            : `To ${shortAddress(status.tx.to)}. Waiting for Monad testnet.`
        }
      >
        <Button
          size="sm"
          variant="secondary"
          label={checkError ? 'Retry' : 'Check'}
          accessibilityLabel={checkError ? 'Retry checking the payment' : 'Check payment again'}
          onPress={recheck}
        />
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
});
