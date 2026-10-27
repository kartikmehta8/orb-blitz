/**
 * @file Network badge: the Monad logomark beside the network name, used in the
 * Wallet header, the Ask sheet header and the Profile network row so the
 * network reads the same everywhere.
 */
import { StyleSheet, View } from 'react-native';
import { colors, radius, space } from '../theme';
import { MonadMark } from './BrandMark';
import { Text } from './ui';

const MARK = 12;

/**
 * Soft purple pill with the Monad mark and a network label.
 * @param props.label Network name (default "Testnet"; use "Monad Testnet" where there is room).
 * @returns The badge, announced as one element.
 */
export function NetworkPill({ label = 'Testnet' }: { label?: string }) {
  return (
    <View style={styles.pill} accessible accessibilityLabel={label === 'Testnet' ? 'Monad Testnet' : label}>
      <MonadMark size={MARK} color={colors.primary} />
      <Text variant="captionStrong" color="primary">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
    paddingHorizontal: space.sm + 2,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
});
