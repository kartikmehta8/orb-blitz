/**
 * @file Profile tab: account card (email and wallet address), spending
 * limits, network, security and about sections, and Sign out with a confirm.
 */
import { Icon } from '../../src/components/Icon';
import { usePrivy } from '@privy-io/expo';
import Constants from 'expo-constants';
import type { ReactNode } from 'react';
import { router } from 'expo-router';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';
import { LimitsCard } from '../../src/components/LimitsCard';
import { NetworkPill } from '../../src/components/NetworkPill';
import { Screen } from '../../src/components/Screen';
import { Card, ListRow, SectionHeader, Text, Toggle, type IconName } from '../../src/components/ui';
import { useCopy } from '../../src/components/useCopy';
import { addressUrl, config } from '../../src/config';
import { NETWORKS, shortAddress, TESTNET_CHAIN_ID } from '../../src/intent';
import { useViewNetwork } from '../../src/network';
import { colors, HIT, radius, space, type as typeScale } from '../../src/theme';
import { useReadAloud } from '../../src/voice';
import { useWalletData } from '../../src/walletData';

type Row = {
  icon: IconName;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  value?: string;
  badge?: ReactNode;
  /** Opens a screen inside Orb: a chevron instead of the external-link icon. */
  internal?: boolean;
};

const open = (url: string) => void Linking.openURL(url);

/**
 * Titled card of list rows.
 * @param props.title Section name.
 * @param props.rows Rows, top to bottom.
 * @returns Section header plus card.
 */
function Group({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <View>
      <SectionHeader title={title} />
      <Card style={styles.group}>
        {rows.map((row, i) => (
          <ListRow
            key={row.title}
            icon={row.icon}
            tone="neutral"
            title={row.title}
            subtitle={row.subtitle}
            divider={i > 0}
            onPress={row.onPress}
            trailing={
              row.badge ??
              (row.value ? (
                <Text variant="mono" color="textSecondary">
                  {row.value}
                </Text>
              ) : row.onPress ? (
                <Icon name={row.internal ? 'chevron-right' : 'external-link'} size={row.internal ? 20 : 16} color={colors.textTertiary} />
              ) : undefined)
            }
          />
        ))}
      </Card>
    </View>
  );
}

/**
 * Profile screen.
 * @returns Account details and settings.
 */
export default function ProfileScreen() {
  const { logout } = usePrivy();
  const { address, email, limits, localError, reloadLocal } = useWalletData();
  const { copied, copy } = useCopy();
  const version = Constants.expoConfig?.version ?? '1.0.0';
  const [readAloud, setReadAloud] = useReadAloud();
  const [chainId] = useViewNetwork();

  const confirmSignOut = () =>
    Alert.alert('Sign out?', 'Sign in again with the same email to get back to this wallet.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void logout() },
    ]);

  return (
    <Screen title="Profile">
      <Card style={styles.account}>
        <View style={styles.flex}>
          <Text variant="caption" color="textTertiary">
            Signed in as
          </Text>
          <Text variant="bodyStrong" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            {email ?? 'Privy account'}
          </Text>
          {address ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copied ? 'Address copied' : `Copy wallet address ${shortAddress(address)}`}
              onPress={() => void copy(address)}
              hitSlop={space.sm}
              style={({ pressed }) => [styles.address, pressed && styles.pressed]}
            >
              <Text color="textSecondary" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[styles.flexShrink, styles.addressText]}>
                {copied ? 'Copied' : address}
              </Text>
              <Icon name={copied ? 'check' : 'copy'} size={14} color={copied ? colors.success : colors.textSecondary} />
            </Pressable>
          ) : (
            <Text variant="caption" color="textSecondary">
              Creating your wallet…
            </Text>
          )}
        </View>
      </Card>

      <LimitsCard
        state={limits}
        error={localError !== null}
        onRetry={() => void reloadLocal()}
        onSaved={() => void reloadLocal()}
      />

      <Group
        title="Your account"
        rows={[
          {
            icon: 'clock',
            title: 'Activity',
            subtitle: 'Every payment from this phone, on both networks',
            onPress: () => router.navigate('/activity'),
            internal: true,
          },
          {
            icon: 'cpu',
            title: 'Agents',
            subtitle: 'Let Claude or Codex ask you for payments',
            onPress: () => router.push('/agents'),
            internal: true,
          },
        ]}
      />

      <Group
        title="Network"
        rows={[
          { icon: 'globe', title: 'Wallet shows', subtitle: `${NETWORKS[chainId].name} · chain ${chainId}`, badge: <NetworkPill toggle /> },
          {
            icon: 'search',
            title: 'Explorer',
            subtitle: 'View your wallet on MonadVision',
            onPress: () => address && open(addressUrl(address, chainId)),
          },
          ...(chainId === TESTNET_CHAIN_ID
            ? [{ icon: 'droplet' as const, title: 'Faucet', subtitle: 'Get free testnet MON', onPress: () => open(config.faucetUrl) }]
            : []),
        ]}
      />

      <Group
        title="Voice"
        rows={[
          {
            icon: 'volume-2',
            title: 'Read aloud',
            subtitle: 'Read payments and safety checks out loud',
            badge: <Toggle value={readAloud} onValueChange={setReadAloud} label="Read aloud" />,
          },
        ]}
      />

      <Group
        title="Security"
        rows={[
          { icon: 'lock', title: 'Payment approval', subtitle: 'Payments need your fingerprint or device PIN' },
          { icon: 'shield', title: 'Keys stay on this device', subtitle: 'Your wallet signs payments on this phone' },
        ]}
      />

      <Group
        title="About"
        rows={[
          { icon: 'info', title: 'Version', value: version },
          { icon: 'eye', title: 'Privacy', subtitle: 'Your screen is read only when you tap the orb' },
        ]}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Sign out"
        onPress={confirmSignOut}
        style={({ pressed }) => [styles.signOut, pressed && styles.signOutPressed]}
      >
        <Icon name="log-out" size={18} color={colors.danger} />
        <Text variant="bodyStrong" color="danger">
          Sign out
        </Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flexShrink: { flexShrink: 1 },
  addressText: { ...typeScale.mono, fontSize: 11.5, lineHeight: 16 },
  flex: { flex: 1, gap: space.xs },
  account: { flexDirection: 'row', alignItems: 'center', gap: space.lg, paddingVertical: space.lg },
  address: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    alignSelf: 'stretch',
    minHeight: 36,
    marginTop: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  pressed: { opacity: 0.6 },
  group: { paddingVertical: space.xs },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    minHeight: HIT + space.sm,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  signOutPressed: { backgroundColor: colors.dangerSoft },
});
