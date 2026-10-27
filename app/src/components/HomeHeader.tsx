/**
 * @file Home header: brand mark and name, the testnet badge, and (when signed
 * in) an account avatar that opens a sheet with the email and Sign out.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, HIT, radius, space } from '../theme';
import { BrandMark } from './BrandMark';
import { Sheet } from './Sheet';
import { Button, Pill, Text } from './ui';

/**
 * Circle with the account's initial.
 * @param props.email Account email; "?" when unknown.
 * @param props.size Diameter in pt.
 * @returns The avatar.
 */
function Avatar({ email, size }: { email: string | null; size: number }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text variant={size > HIT ? 'title' : 'bodyStrong'} color="primary">
        {(email?.[0] ?? '?').toUpperCase()}
      </Text>
    </View>
  );
}

/**
 * Header row.
 * @param props.account Signed-in account (email may be null for non-email logins), or null when signed out.
 * @param props.onSignOut Signs out.
 * @returns The header plus its account sheet.
 */
export function HomeHeader({ account, onSignOut }: { account: { email: string | null } | null; onSignOut: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <View style={styles.header}>
      <BrandMark size={28} />
      <Text variant="headline" accessibilityRole="header" style={styles.flex}>
        Bubble Agent
      </Text>
      <Pill label="Testnet" tone="primary" dot />
      {account ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Account"
            onPress={() => setMenuOpen(true)}
            hitSlop={space.xs}
            style={({ pressed }) => [styles.avatarButton, pressed && styles.pressed]}
          >
            <Avatar email={account.email} size={AVATAR} />
          </Pressable>
          <Sheet visible={menuOpen} onClose={() => setMenuOpen(false)} title="Account">
            <View style={styles.account}>
              <Avatar email={account.email} size={56} />
              <View style={styles.flex}>
                <Text variant="overline" color="textTertiary">
                  Signed in as
                </Text>
                <Text variant="bodyStrong" numberOfLines={1} ellipsizeMode="middle">
                  {account.email ?? 'Privy account'}
                </Text>
              </View>
            </View>
            <Button
              variant="danger"
              icon="log-out"
              label="Sign out"
              onPress={() => {
                setMenuOpen(false);
                onSignOut();
              }}
            />
          </Sheet>
        </>
      ) : null}
    </View>
  );
}

const AVATAR = 40;

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: HIT },
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoftBorder,
  },
  avatarButton: { marginLeft: space.xs },
  account: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
});
