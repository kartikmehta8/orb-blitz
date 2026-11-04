/**
 * @file Wallet hero: balance on the viewed network, address chip, and the
 * round quick actions (Send, Receive, Faucet on testnet, Explorer).
 * Send opens the Ask tab, where Orb prepares the payment.
 */
import { Icon } from './Icon';
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import type { Address } from 'viem';
import { addressUrl, config } from '../config';
import { formatMon, NETWORKS, shortAddress, TESTNET_CHAIN_ID } from '../intent';
import { useViewNetwork } from '../network';
import { colors, HIT, radius, space } from '../theme';
import { monValue } from './format';
import { ReceiveSheet } from './ReceiveSheet';
import { Button, Text, type IconName } from './ui';
import { useCopy } from './useCopy';

const ACTION_SIZE = 52;

/**
 * Round action with a label underneath.
 * @returns A 48pt+ pressable.
 */
function QuickAction(props: { icon: IconName; label: string; a11yLabel: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.a11yLabel}
      accessibilityState={{ disabled: props.disabled }}
      disabled={props.disabled}
      onPress={props.onPress}
      style={[styles.action, props.disabled && styles.disabled]}
    >
      {({ pressed }) => (
        <>
          <View style={[styles.actionCircle, pressed && styles.actionPressed]}>
            <Icon name={props.icon} size={20} color={colors.textInverse} />
          </View>
          <Text variant="captionStrong" numberOfLines={1}>
            {props.label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

/**
 * Balance hero.
 * @param props.address Embedded wallet address; null while the wallet is being created.
 * @param props.balance Balance in wei on the viewed network; null until loaded.
 * @param props.balanceError Last balance fetch failed.
 * @param props.onRetry Loads the balance again.
 * @returns The hero plus its Receive sheet.
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
  onRetry?: () => void;
}) {
  const { copied, copy } = useCopy();
  const [chainId] = useViewNetwork();
  const [receiveOpen, setReceiveOpen] = useState(false);
  const open = (url: string) => void Linking.openURL(url);
  const testnet = chainId === TESTNET_CHAIN_ID;

  return (
    <View style={styles.hero}>
      {balance !== null ? (
        <View style={styles.balanceRow} accessible accessibilityLabel={`Balance ${formatMon(balance)} on ${NETWORKS[chainId].name}`}>
          <Text variant="display" numberOfLines={1} adjustsFontSizeToFit style={styles.balance}>
            {monValue(balance)}
          </Text>
          <Text variant="title" color="textSecondary">
            MON
          </Text>
        </View>
      ) : balanceError ? null : (
        <View style={styles.placeholder} accessible accessibilityLabel="Balance loading" />
      )}
      {balanceError ? (
        <View style={styles.error} accessibilityRole="alert">
          <Text variant="callout" color="danger" align="center">
            Couldn’t load your balance.
          </Text>
          {onRetry ? <Button size="sm" variant="secondary" icon="refresh-cw" label="Retry" onPress={onRetry} /> : null}
        </View>
      ) : null}

      {address ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copied ? 'Address copied' : `Copy wallet address ${shortAddress(address)}`}
          onPress={() => void copy(address)}
          hitSlop={space.xs}
          style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
        >
          <Text variant="mono" color="textSecondary" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={styles.address}>
            {copied ? 'Copied' : address}
          </Text>
          <Icon name={copied ? 'check' : 'copy'} size={14} color={copied ? colors.success : colors.textTertiary} />
        </Pressable>
      ) : (
        <Text variant="caption" color="textSecondary">
          Creating your wallet…
        </Text>
      )}

      <View style={styles.actions}>
        <QuickAction icon="arrow-up-right" label="Send" a11yLabel="Send MON with Orb" disabled={!address} onPress={() => router.navigate('/chat')} />
        <QuickAction icon="arrow-down-left" label="Receive" a11yLabel="Receive MON" disabled={!address} onPress={() => setReceiveOpen(true)} />
        {testnet ? (
          <QuickAction icon="droplet" label="Faucet" a11yLabel="Get testnet MON from the faucet" disabled={!address} onPress={() => open(config.faucetUrl)} />
        ) : (
          <QuickAction icon="clock" label="Activity" a11yLabel="Payment history" disabled={false} onPress={() => router.navigate('/activity')} />
        )}
        <QuickAction
          icon="external-link"
          label="Explorer"
          a11yLabel="View wallet on explorer"
          disabled={!address}
          onPress={() => address && open(addressUrl(address, chainId))}
        />
      </View>

      {address ? <ReceiveSheet address={address} visible={receiveOpen} onClose={() => setReceiveOpen(false)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: space.sm, paddingTop: space.lg, paddingBottom: space.sm },
  balanceRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm, maxWidth: '100%' },
  balance: { flexShrink: 1, fontSize: 44, lineHeight: 52 },
  placeholder: { width: 180, height: 52, borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
  error: { alignItems: 'center', gap: space.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 36,
    maxWidth: '100%',
    paddingHorizontal: space.md,
    marginTop: space.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  chipPressed: { backgroundColor: colors.border },
  address: { flexShrink: 1 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignSelf: 'stretch', marginTop: space.xl, paddingHorizontal: space.sm },
  action: { alignItems: 'center', gap: space.sm, minWidth: HIT + space.lg },
  actionCircle: {
    width: ACTION_SIZE,
    height: ACTION_SIZE,
    borderRadius: ACTION_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  actionPressed: { backgroundColor: colors.primaryPressed },
  disabled: { opacity: 0.4 },
});
