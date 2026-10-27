/**
 * @file Home (spec §7.3). Signed out: onboarding with email sign-in.
 * Signed in: wallet hero, pending banner, activity, setup checklist, bubble
 * toggle and spending limits on one scrollable screen. The window is
 * translucent, so the scroll view paints the opaque canvas itself.
 */
import { Feather } from '@expo/vector-icons';
import { usePrivy, type PrivyEmailAccount } from '@privy-io/expo';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, KeyboardAvoidingView, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActivityList } from '../src/components/ActivityList';
import { PendingBanner } from '../src/components/Banner';
import { BubbleCard } from '../src/components/BubbleCard';
import { HomeHeader } from '../src/components/HomeHeader';
import { LimitsCard } from '../src/components/LimitsCard';
import { PermissionsCard } from '../src/components/PermissionsCard';
import { SignIn } from '../src/components/SignIn';
import { Text } from '../src/components/ui';
import { WalletHero } from '../src/components/WalletHero';
import { useBalance, usePendingTx, useWallet } from '../src/hooks';
import { getLimitState, type LimitState } from '../src/limits';
import { usePermissions } from '../src/permissions';
import { getActivity, type ActivityTx } from '../src/storage';
import { colors, space } from '../src/theme';

/**
 * Home screen.
 * @returns The scrollable wallet screen, or onboarding when signed out.
 */
export default function Home() {
  const insets = useSafeAreaInsets();
  const { ready, user, address } = useWallet();
  const { logout } = usePrivy();
  const balance = useBalance(address);
  const pending = usePendingTx();
  const permissions = usePermissions();
  const [activity, setActivity] = useState<ActivityTx[] | null>(null);
  const [limits, setLimits] = useState<LimitState | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const { refresh: refreshBalance } = balance;
  const { recheck } = pending;
  const email = user?.linked_accounts.find((a): a is PrivyEmailAccount => a.type === 'email')?.address ?? null;

  const reloadLocal = useCallback(async () => {
    const [items, state] = await Promise.all([getActivity(), getLimitState()]);
    setActivity(items);
    setLimits(state);
  }, []);

  const refresh = useCallback(async () => {
    await Promise.all([recheck(), refreshBalance(), reloadLocal()]);
  }, [recheck, refreshBalance, reloadLocal]);

  useEffect(() => {
    void reloadLocal();
  }, [reloadLocal]);

  // A resumed payment just settled: spend, activity and balance changed.
  useEffect(() => {
    if (pending.status.kind === 'confirmed' || pending.status.kind === 'failed') {
      void reloadLocal();
      void refreshBalance();
    }
  }, [pending.status, reloadLocal, refreshBalance]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void refresh());
    return () => sub.remove();
  }, [refresh]);

  const onPullRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refresh(), permissions.refresh()]);
    setRefreshing(false);
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.screen}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xxxl }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          user ? (
            <RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} colors={[colors.primary]} tintColor={colors.primary} />
          ) : undefined
        }
      >
        {!ready ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : user ? (
          <>
            <HomeHeader account={{ email }} onSignOut={() => void logout()} />
            <View style={styles.top}>
              <WalletHero address={address} balance={balance.balance} balanceError={balance.error} />
              <PendingBanner status={pending.status} onRecheck={() => void recheck()} />
            </View>
            <ActivityList items={activity} pending={pending.status} />
            <PermissionsCard status={permissions.status} refresh={permissions.refresh} />
            <BubbleCard status={permissions.status} refresh={permissions.refresh} />
            <LimitsCard state={limits} onSaved={() => void reloadLocal()} />
            <View style={styles.footer}>
              <Feather name="shield" size={13} color={colors.textTertiary} />
              <Text variant="caption" color="textTertiary">
                Testnet only · Keys never leave this device
              </Text>
            </View>
          </>
        ) : (
          <SignIn />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { flexGrow: 1, paddingHorizontal: space.xl, gap: space.xxl },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  top: { gap: space.md, marginTop: -space.sm },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs },
});
