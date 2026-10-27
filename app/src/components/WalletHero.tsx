/**
 * @file Home wallet hero (spec §7.3 items 1–2): ink card with a soft Monad
 * glow, MON balance, copyable address chip and four quick actions
 * (Receive, Copy, Faucet, Explorer).
 */
import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import type { Address } from 'viem';
import { addressUrl, config } from '../config';
import { formatMon, shortAddress } from '../intent';
import { colors, HIT, radius, space } from '../theme';
import { monValue } from './format';
import { ReceiveSheet } from './ReceiveSheet';
import { Text, type IconName } from './ui';
import { useCopy } from './useCopy';

/** Decorative glows: [id, color, center x, center y, radius, peak opacity]. Purple leads; cyan and pink are hints. */
const GLOWS = [
  ['glowPurple', colors.primary, '100%', '0%', '85%', 0.6],
  ['glowCyan', colors.accentCyan, '0%', '100%', '60%', 0.16],
  ['glowPink', colors.accentPink, '75%', '115%', '50%', 0.14],
] as const;

/**
 * Brand glow behind the hero content, drawn with SVG radial gradients.
 * @returns An absolutely positioned, non-interactive SVG.
 */
function HeroGlow() {
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        {GLOWS.map(([id, color, cx, cy, r, opacity]) => (
          <RadialGradient key={id} id={id} cx={cx} cy={cy} r={r} fx={cx} fy={cy}>
            <Stop offset="0" stopColor={color} stopOpacity={opacity} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        ))}
      </Defs>
      {GLOWS.map(([id]) => (
        <Rect key={id} width="100%" height="100%" fill={`url(#${id})`} />
      ))}
    </Svg>
  );
}

/**
 * Circular quick action with a mono caps label.
 * @param props.icon Feather icon.
 * @param props.label Visible label.
 * @param props.a11yLabel Screen-reader label.
 * @param props.primary Purple fill for the lead action.
 * @param props.disabled Blocks presses.
 * @param props.onPress Press handler.
 * @returns The action button.
 */
function HeroAction({
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
          <View style={[styles.actionCircle, primary && styles.actionPrimary, pressed && styles.actionPressed]}>
            <Feather name={icon} size={20} color={colors.textInverse} />
          </View>
          <Text variant="overline" color="textOnInk" numberOfLines={1}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

/**
 * Wallet hero card.
 * @param props.address Embedded wallet address; null while the wallet is being created.
 * @param props.balance Balance in wei; null until loaded.
 * @param props.balanceError Last balance fetch failed.
 * @returns The hero card plus its Receive sheet.
 */
export function WalletHero({ address, balance, balanceError }: { address: Address | null; balance: bigint | null; balanceError: boolean }) {
  const { copied, copy } = useCopy();
  const [receiveOpen, setReceiveOpen] = useState(false);
  const copyAddress = () => address && void copy(address);
  const open = (url: string) => void Linking.openURL(url);

  return (
    <View style={styles.hero}>
      <HeroGlow />
      <Text variant="overline" color="textOnInk">
        Balance · Monad testnet
      </Text>

      {balance !== null ? (
        <View style={styles.balanceRow} accessible accessibilityLabel={`Balance ${formatMon(balance)}`}>
          <Text variant="display" color="textInverse" numberOfLines={1} adjustsFontSizeToFit style={styles.balance}>
            {monValue(balance)}
          </Text>
          <Text variant="headline" color="textOnInk">
            MON
          </Text>
        </View>
      ) : balanceError ? null : (
        <View style={styles.balancePlaceholder} accessible accessibilityLabel="Balance loading" />
      )}
      {balanceError ? (
        <View style={styles.inline} accessibilityLiveRegion="polite">
          <Feather name="alert-circle" size={14} color={colors.danger} />
          <Text variant="caption" color="textOnInk" style={styles.flex}>
            {"Couldn't load your balance. Pull down to retry."}
          </Text>
        </View>
      ) : null}

      {address ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copied ? 'Address copied' : `Copy wallet address ${shortAddress(address)}`}
          onPress={copyAddress}
          hitSlop={space.xs}
          style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
        >
          <Text variant="mono" color="textInverse">
            {copied ? 'Copied' : shortAddress(address)}
          </Text>
          <Feather name={copied ? 'check' : 'copy'} size={14} color={copied ? colors.success : colors.textOnInk} />
        </Pressable>
      ) : (
        <View style={styles.chip}>
          <ActivityIndicator size="small" color={colors.textOnInk} />
          <Text variant="caption" color="textOnInk">
            Creating your wallet…
          </Text>
        </View>
      )}

      <View style={styles.actions}>
        <HeroAction icon="arrow-down-left" label="Receive" a11yLabel="Receive MON" primary disabled={!address} onPress={() => setReceiveOpen(true)} />
        <HeroAction
          icon={copied ? 'check' : 'copy'}
          label={copied ? 'Copied' : 'Copy'}
          a11yLabel={copied ? 'Address copied' : 'Copy address'}
          disabled={!address}
          onPress={copyAddress}
        />
        <HeroAction icon="droplet" label="Faucet" a11yLabel="Get testnet MON from the faucet" disabled={!address} onPress={() => open(config.faucetUrl)} />
        <HeroAction
          icon="external-link"
          label="Explorer"
          a11yLabel="View wallet on explorer"
          disabled={!address}
          onPress={() => address && open(addressUrl(address))}
        />
      </View>

      {address ? <ReceiveSheet address={address} visible={receiveOpen} onClose={() => setReceiveOpen(false)} /> : null}
    </View>
  );
}

const ACTION_SIZE = 52;

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.ink,
    borderRadius: radius.xxl,
    padding: space.xxl,
    gap: space.md,
    overflow: 'hidden',
  },
  flex: { flex: 1 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  balanceRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  balance: { flexShrink: 1 },
  balancePlaceholder: { width: 168, height: 46, borderRadius: radius.md, backgroundColor: colors.inkRaised },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space.sm,
    minHeight: 36,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.inkRaised,
  },
  chipPressed: { opacity: 0.7 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.md },
  action: { alignItems: 'center', gap: space.sm, minWidth: HIT + space.lg },
  actionCircle: {
    width: ACTION_SIZE,
    height: ACTION_SIZE,
    borderRadius: ACTION_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.inkRaised,
  },
  actionPrimary: { backgroundColor: colors.primary },
  actionPressed: { opacity: 0.75 },
  disabled: { opacity: 0.4 },
});
