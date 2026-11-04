/**
 * @file Wallet tab balance card: flat white card with the MON balance, a
 * copyable address chip and four quick actions (Receive, Copy, Faucet,
 * Explorer). Receive opens the QR sheet.
 */
import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import type { Address } from 'viem';
import { addressUrl, config } from '../config';
import { formatMon, shortAddress } from '../intent';
import { colors, HIT, radius, space } from '../theme';
import { monValue } from './format';
import { ReceiveSheet } from './ReceiveSheet';
import { Button, Card, Text, type IconName } from './ui';
import { useCopy } from './useCopy';

const ACTION_SIZE = 52;

/**
 * Round quick action with a label underneath.
 * @param props.icon Feather icon.
 * @param props.label Visible label.
 * @param props.a11yLabel Screen-reader label.
 * @param props.primary Purple fill for the lead action.
 * @param props.disabled Blocks presses.
 * @param props.onPress Press handler.
 * @returns The action button.
 */
function QuickAction({
  icon,
  label,
  a11yLabel,
  primary,
  disabled,
  onPress,
}: {
  icon: IconName;
  label: string;
  a11yLabel: string;
  primary?: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.action, disabled && styles.disabled]}
    >
      {({ pressed }) => (
        <>
          <View style={[styles.actionCircle, primary && styles.actionPrimary, pressed && styles.pressed]}>
            <Feather name={icon} size={20} color={primary ? colors.textInverse : colors.text} />
          </View>
          <Text variant="captionStrong" numberOfLines={1}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

/**
 * Balance card.
 * @param props.address Embedded wallet address; null while the wallet is being created.
 * @param props.balance Balance in wei; null until loaded.
 * @param props.balanceError Last balance fetch failed.
 * @returns The card plus its Receive sheet.
 */
export function BalanceCard({
  address,
  balance,
  balanceError,
  onRetry,
}: {
  address: Address | null;
  balance: bigint | null;
  balanceError: boolean;
  /** Loads the balance again. */
  onRetry?: () => void;
}) {
  const { copied, copy } = useCopy();
  const [receiveOpen, setReceiveOpen] = useState(false);
  const copyAddress = () => address && void copy(address);
  const open = (url: string) => void Linking.openURL(url);

  return (
    <Card style={styles.card}>
      <View style={styles.top}>
        <Text variant="overline" color="textTertiary">
          Balance
        </Text>
        {balance !== null ? (
          <View style={styles.balanceRow} accessible accessibilityLabel={`Balance ${formatMon(balance)}`}>
            <Text variant="display" numberOfLines={1} adjustsFontSizeToFit style={styles.balance}>
              {monValue(balance)}
            </Text>
            <Text variant="headline" color="textSecondary">
              MON
            </Text>
          </View>
        ) : balanceError ? null : (
          <View style={styles.placeholder} accessible accessibilityLabel="Balance loading" />
        )}
        {balanceError ? (
          <View style={styles.error} accessibilityRole="alert">
            <View style={styles.inline}>
              <Feather name="alert-circle" size={16} color={colors.danger} />
              <Text variant="caption" color="danger" style={styles.flex}>
                Couldn’t load your balance.
              </Text>
            </View>
            {onRetry ? <Button size="sm" variant="secondary" icon="refresh-cw" label="Retry" onPress={onRetry} /> : null}
          </View>
        ) : null}

        {address ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copied ? 'Address copied' : `Copy wallet address ${shortAddress(address)}`}
            onPress={copyAddress}
            hitSlop={space.xs}
            style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
          >
            <Text variant="mono" color="textSecondary">
              {copied ? 'Copied' : shortAddress(address)}
            </Text>
            <Feather name={copied ? 'check' : 'copy'} size={14} color={copied ? colors.success : colors.textTertiary} />
          </Pressable>
        ) : (
          <View style={styles.chip} accessibilityLabel="Creating your wallet">
            <View style={styles.chipSkeleton} />
            <Text variant="caption" color="textSecondary">
              Creating your wallet…
            </Text>
          </View>
        )}
      </View>

      <View style={styles.actions}>
        <QuickAction icon="arrow-down-left" label="Receive" a11yLabel="Receive MON" primary disabled={!address} onPress={() => setReceiveOpen(true)} />
        <QuickAction
          icon={copied ? 'check' : 'copy'}
          label={copied ? 'Copied' : 'Copy'}
          a11yLabel={copied ? 'Address copied' : 'Copy address'}
          disabled={!address}
          onPress={copyAddress}
        />
        <QuickAction icon="droplet" label="Faucet" a11yLabel="Get testnet MON from the faucet" disabled={!address} onPress={() => open(config.faucetUrl)} />
        <QuickAction
          icon="external-link"
          label="Explorer"
          a11yLabel="View wallet on explorer"
          disabled={!address}
          onPress={() => address && open(addressUrl(address))}
        />
      </View>

      {address ? <ReceiveSheet address={address} visible={receiveOpen} onClose={() => setReceiveOpen(false)} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: space.xl, gap: space.xl },
  top: { gap: space.sm, alignItems: 'flex-start' },
  flex: { flex: 1 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: space.sm, alignSelf: 'stretch' },
  balanceRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  balance: { flexShrink: 1 },
  placeholder: { width: 168, height: 46, borderRadius: radius.md, backgroundColor: colors.borderStrong },
  error: { alignSelf: 'stretch', gap: space.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: HIT,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  chipSkeleton: { width: 88, height: 14, borderRadius: radius.sm, backgroundColor: colors.borderStrong },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  action: { alignItems: 'center', gap: space.sm, minWidth: HIT + space.lg },
  actionCircle: {
    width: ACTION_SIZE,
    height: ACTION_SIZE,
    borderRadius: ACTION_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  actionPrimary: { backgroundColor: colors.primary },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.4 },
});
