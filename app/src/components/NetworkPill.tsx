/**
 * @file Network switch for the Wallet: which Monad network the balance and
 * links show. The whole pill is green on mainnet (real MON) and orange on testnet.
 *
 * Display only. Payments never use it: each payment's network is the one the
 * user names, and Orb asks when they have not.
 */
import { Icon } from './Icon';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';
import { MAINNET_CHAIN_ID, NETWORKS } from '../intent';
import { useViewNetwork } from '../network';
import { colors, radius, space } from '../theme';
import { MonadMark } from './BrandMark';
import { Text } from './ui';

/**
 * Pill with the Monad mark, the network name and a status dot.
 * @param props.toggle Tapping switches between mainnet and testnet (Wallet header only).
 * @returns The pill.
 */
export function NetworkPill({ toggle }: { toggle?: boolean }) {
  const [chainId, switchNetwork] = useViewNetwork();
  const mainnet = chainId === MAINNET_CHAIN_ID;
  const label = mainnet ? 'Mainnet' : 'Testnet';
  const fill = mainnet ? colors.mainnet : colors.testnet;
  const content = (
    <>
      <MonadMark size={12} color={colors.textInverse} />
      <Text variant="captionStrong" color="textInverse">
        {label}
      </Text>
      {toggle ? <Icon name="chevron-down" size={14} color={colors.textInverse} weight="bold" /> : null}
    </>
  );
  if (!toggle) {
    return (
      <View style={[styles.pill, { backgroundColor: fill }]} accessible accessibilityLabel={NETWORKS[chainId].name}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${NETWORKS[chainId].name}. Switch to ${mainnet ? 'testnet' : 'mainnet'}`}
      onPress={() => {
        void Haptics.selectionAsync();
        switchNetwork();
      }}
      hitSlop={space.sm}
      style={({ pressed }) => [styles.pill, { backgroundColor: fill }, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
    paddingHorizontal: space.md,
    paddingVertical: space.xs + 2,
    borderRadius: radius.pill,
  },
  pressed: { opacity: 0.85 },
});
