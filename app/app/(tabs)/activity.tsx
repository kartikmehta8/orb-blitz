/**
 * @file Activity: every payment sent from this phone (latest 20) on both
 * networks, the in-flight one on top, each opening on its explorer. Opened
 * from Wallet ("See all") and Profile; a hidden tab, so it has a back button.
 * Pull to refresh.
 */
import { Icon } from '../../src/components/Icon';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../src/components/ui';
import { colors, HIT, radius, space } from '../../src/theme';
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
      header={
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => (router.canGoBack() ? router.back() : router.navigate('/'))}
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}
          >
            <Icon name="chevron-left" size={24} color={colors.text} />
          </Pressable>
          <Text variant="title" accessibilityRole="header">
            Activity
          </Text>
        </View>
      }
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

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginLeft: -space.md },
  back: { width: HIT, height: HIT, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  pressed: { opacity: 0.6 },
});
