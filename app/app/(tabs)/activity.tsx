/**
 * @file Activity tab: every payment sent from this phone (latest 20), the
 * in-flight one on top, each opening on the explorer. Pull to refresh.
 */
import { router } from 'expo-router';
import { ActivityList } from '../../src/components/ActivityList';
import { Screen } from '../../src/components/Screen';
import { useWalletData } from '../../src/walletData';

/**
 * Activity screen.
 * @returns The full payment list, or an empty state that points to the Bubble tab.
 */
export default function ActivityScreen() {
  const { activity, pending, refresh } = useWalletData();
  return (
    <Screen title="Activity" subtitle="Payments from this phone. Tap one to view it on the explorer." onRefresh={refresh}>
      <ActivityList
        items={activity}
        pending={pending}
        emptyAction={{ label: 'Set up the bubble', onPress: () => router.navigate('/bubble') }}
      />
    </Screen>
  );
}
