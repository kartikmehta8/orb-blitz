/**
 * @file Wallet tab: account header (email, ENS name when there is one, network
 * switch), the balance hero with quick actions, the pending-payment banner,
 * spending limits (tap to change) and the three latest payments. Pull to refresh.
 */
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { ActivityList } from '../../src/components/ActivityList';
import { BalanceCard } from '../../src/components/BalanceCard';
import { LimitsCard } from '../../src/components/LimitsCard';
import { PendingBanner } from '../../src/components/Banner';
import { NetworkPill } from '../../src/components/NetworkPill';
import { Screen } from '../../src/components/Screen';
import { SectionHeader, Text } from '../../src/components/ui';
import { useSafeRead } from '../../src/components/useSafeRead';
import { usePrimaryName } from '../../src/hooks';
import { getActivity } from '../../src/storage';
import { HIT, space } from '../../src/theme';
import { useWalletData } from '../../src/walletData';

/** Payments shown before "See all". */
const RECENT = 3;

/**
 * Wallet screen.
 * @returns The scrollable wallet overview.
 */
export default function WalletScreen() {
  const {
    address,
    email,
    balance,
    balanceError,
    pending,
    pendingPhase,
    pendingError,
    retryPending,
    refresh,
    limits,
    localError,
    reloadLocal,
  } = useWalletData();
  const activity = useSafeRead(getActivity, pending.kind);
  const ensName = usePrimaryName(address);

  const header = (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open profile"
        onPress={() => router.navigate('/profile')}
        style={({ pressed }) => [styles.account, pressed && styles.pressed]}
      >
        <View style={styles.flex}>
          <Text variant="headline" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {email ?? 'Orb wallet'}
          </Text>
          {ensName ? (
            <Text variant="caption" color="textSecondary" numberOfLines={1}>
              {ensName}
            </Text>
          ) : null}
        </View>
      </Pressable>
      <NetworkPill toggle />
    </View>
  );

  return (
    <Screen
      header={header}
      onRefresh={async () => {
        await Promise.allSettled([refresh(), activity.retry()]);
      }}
    >
      <BalanceCard address={address} balance={balance} balanceError={balanceError} onRetry={() => void refresh()} />
      <PendingBanner phase={pendingPhase} status={pending} error={pendingError} onRetry={retryPending} />
      <LimitsCard state={limits} error={localError !== null} onRetry={() => void reloadLocal()} onSaved={() => void reloadLocal()} />
      <View>
        <SectionHeader title="Activity" action={{ label: 'See all', onPress: () => router.navigate('/activity') }} />
        <ActivityList
          items={activity.value}
          pending={pending}
          limit={RECENT}
          error={activity.error}
          onRetry={() => void activity.retry()}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: HIT },
  account: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md },
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
});
