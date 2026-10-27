/**
 * @file Wallet tab (spec §7.3 items 1, 2 and 6): brand header with the
 * testnet badge and a profile shortcut, the balance card with quick actions,
 * the pending-payment banner and the three latest payments. Pull to refresh.
 */
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { ActivityList } from '../../src/components/ActivityList';
import { Avatar } from '../../src/components/Avatar';
import { BalanceCard } from '../../src/components/BalanceCard';
import { PendingBanner } from '../../src/components/Banner';
import { BrandMark } from '../../src/components/BrandMark';
import { Screen } from '../../src/components/Screen';
import { Pill, SectionHeader, Text } from '../../src/components/ui';
import { HIT, space } from '../../src/theme';
import { useWalletData } from '../../src/walletData';

/** Payments shown before "See all". */
const RECENT = 3;
const AVATAR = 36;

/**
 * Wallet screen.
 * @returns The scrollable wallet overview.
 */
export default function WalletScreen() {
  const { address, email, balance, balanceError, pending, recheckPending, activity, refresh } = useWalletData();

  const header = (
    <View style={styles.header}>
      <BrandMark size={28} />
      <Text variant="headline" accessibilityRole="header" style={styles.flex}>
        Bubble Agent
      </Text>
      <Pill label="Testnet" tone="primary" dot />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open profile"
        onPress={() => router.navigate('/profile')}
        hitSlop={(HIT - AVATAR) / 2}
        style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}
      >
        <Avatar email={email} size={AVATAR} />
      </Pressable>
    </View>
  );

  return (
    <Screen header={header} onRefresh={refresh}>
      <View style={styles.top}>
        <BalanceCard address={address} balance={balance} balanceError={balanceError} />
        <PendingBanner status={pending} onRecheck={recheckPending} />
      </View>
      <View>
        <SectionHeader title="Recent activity" action={{ label: 'See all', onPress: () => router.navigate('/activity') }} />
        <ActivityList items={activity} pending={pending} limit={RECENT} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: HIT },
  flex: { flex: 1 },
  avatar: { marginLeft: space.xs },
  pressed: { opacity: 0.7 },
  top: { gap: space.md },
});
