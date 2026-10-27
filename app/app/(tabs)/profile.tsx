/**
 * @file Profile tab: account card (email and wallet address), spending
 * limits, network, security and about sections, and Sign out with a confirm.
 */
import { Feather } from '@expo/vector-icons';
import { usePrivy } from '@privy-io/expo';
import Constants from 'expo-constants';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';
import { Avatar } from '../../src/components/Avatar';
import { LimitsCard } from '../../src/components/LimitsCard';
import { Screen } from '../../src/components/Screen';
import { Card, ListRow, SectionHeader, Text, type IconName } from '../../src/components/ui';
import { useCopy } from '../../src/components/useCopy';
import { addressUrl, config } from '../../src/config';
import { CHAIN_ID, shortAddress } from '../../src/intent';
import { colors, HIT, radius, space } from '../../src/theme';
import { useWalletData } from '../../src/walletData';

type Row = { icon: IconName; title: string; subtitle?: string; onPress?: () => void; value?: string };

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
              row.value ? (
                <Text variant="mono" color="textSecondary">
                  {row.value}
                </Text>
              ) : row.onPress ? (
                <Feather name="external-link" size={16} color={colors.textTertiary} />
              ) : undefined
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
  const { address, email, limits, reloadLocal } = useWalletData();
  const { copied, copy } = useCopy();
  const version = Constants.expoConfig?.version ?? '1.0.0';

  const confirmSignOut = () =>
    Alert.alert('Sign out?', 'Sign in again with the same email to get back to this wallet.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void logout() },
    ]);

  return (
    <Screen title="Profile">
      <Card style={styles.account}>
        <Avatar email={email} size={56} />
        <View style={styles.flex}>
          <Text variant="headline" numberOfLines={1} ellipsizeMode="middle">
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
              <Text variant="mono" color="textSecondary">
                {copied ? 'Copied' : shortAddress(address)}
              </Text>
              <Feather name={copied ? 'check' : 'copy'} size={14} color={copied ? colors.success : colors.textTertiary} />
            </Pressable>
          ) : (
            <Text variant="caption" color="textSecondary">
              Creating your wallet…
            </Text>
          )}
        </View>
      </Card>

      <LimitsCard state={limits} onSaved={() => void reloadLocal()} />

      <Group
        title="Network"
        rows={[
          { icon: 'globe', title: 'Monad Testnet', subtitle: 'The only network this app uses', value: `ID ${CHAIN_ID}` },
          {
            icon: 'search',
            title: 'Explorer',
            subtitle: 'View your wallet on MonadVision',
            onPress: () => open(address ? addressUrl(address) : config.explorerUrl),
          },
          { icon: 'droplet', title: 'Faucet', subtitle: 'Get free testnet MON', onPress: () => open(config.faucetUrl) },
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
          { icon: 'eye', title: 'Privacy', subtitle: 'Your screen is read only when you tap the bubble' },
        ]}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Sign out"
        onPress={confirmSignOut}
        style={({ pressed }) => [styles.signOut, pressed && styles.signOutPressed]}
      >
        <Feather name="log-out" size={18} color={colors.danger} />
        <Text variant="bodyStrong" color="danger">
          Sign out
        </Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: space.xs },
  account: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  address: { flexDirection: 'row', alignItems: 'center', gap: space.sm, alignSelf: 'flex-start' },
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
