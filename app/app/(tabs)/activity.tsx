/**
 * @file Activity tab: every payment sent from this phone (latest 20), the
 * in-flight one on top, each opening on the explorer. Pull to refresh.
 */
import { router } from 'expo-router';
import { ActivityList } from '../../src/components/ActivityList';
import { Screen } from '../../src/components/Screen';
import { useSafeRead } from '../../src/components/useSafeRead';
import { getActivity } from '../../src/storage';
import { useWalletData } from '../../src/walletData';

/**
 * Activity screen.
 * @returns The full payment list, or an empty state that points to the Orb tab.
 */
export default function ActivityScreen() {
  const { pending, refresh } = useWalletData();
  const activity = useSafeRead(getActivity, pending.kind);
  return (
    <Screen
      title="Activity"
      onRefresh={async () => {
        await Promise.allSettled([refresh(), activity.retry()]);
      }}
    >
      <ActivityList
        items={activity.value}
        pending={pending}
        error={activity.error}
        onRetry={() => void activity.retry()}
        emptyAction={{ label: 'Set up the orb', onPress: () => router.navigate('/bubble') }}
      />
    </Screen>
  );
}
