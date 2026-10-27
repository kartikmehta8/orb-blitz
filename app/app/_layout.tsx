/**
 * @file Root layout (spec §7.2): fonts (splash held until loaded), Privy with
 * the embedded EVM wallet on Monad testnet, bubble lifecycle, and a two-route
 * stack: opaque `index` (Home) and transparent `ask` (sheet over other apps).
 *
 * Deep links: expo-router maps `bubbleagent://ask?ctx=…` to `/ask` on both
 * cold start (initial URL → state `[ask]`) and warm start (URL event →
 * NAVIGATE). `ask.tsx` collapses the warm-start stack to `[ask]`, so there is
 * no extra Linking handling here and no double navigation.
 */
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { JetBrainsMono_400Regular, JetBrainsMono_700Bold } from '@expo-google-fonts/jetbrains-mono';
import { Feather } from '@expo/vector-icons';
import { PrivyProvider } from '@privy-io/expo';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useBubbleLifecycle } from '../src/bubble';
import { Card, Text } from '../src/components/ui';
import { config, monadTestnet } from '../src/config';
import { colors, radius, space } from '../src/theme';

void SplashScreen.preventAutoHideAsync();

const PRIVY_CONFIGURED = !!config.privyAppId && !!config.privyClientId;

/**
 * App root.
 * @returns Providers and the route stack, or a setup screen when Privy env is missing.
 */
export default function RootLayout() {
  useBubbleLifecycle();
  const [loaded, error] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    JetBrainsMono_400Regular,
    JetBrainsMono_700Bold,
  });
  // A font failure falls back to system fonts rather than holding the splash forever.
  const ready = loaded || !!error;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <>
      <StatusBar style="dark" />
      {PRIVY_CONFIGURED ? (
        <PrivyProvider
          appId={config.privyAppId}
          clientId={config.privyClientId}
          supportedChains={[monadTestnet]}
          config={{ embedded: { ethereum: { createOnLogin: 'users-without-wallets' } } }}
        >
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" options={{ contentStyle: { backgroundColor: colors.canvas } }} />
            {/* The sheet animates itself (scrim fade + spring), so the screen transition is off. */}
            <Stack.Screen name="ask" options={{ contentStyle: { backgroundColor: 'transparent' }, animation: 'none' }} />
          </Stack>
        </PrivyProvider>
      ) : (
        <ConfigMissing />
      )}
    </>
  );
}

/**
 * Shown when the Privy env vars are missing from the build.
 * @returns A centered setup card.
 */
function ConfigMissing() {
  return (
    <View style={styles.missing}>
      <Card style={styles.card}>
        <View style={styles.icon}>
          <Feather name="settings" size={20} color={colors.primary} />
        </View>
        <Text variant="headline">Almost there</Text>
        <Text variant="callout" color="textSecondary">
          Bubble Agent needs your Privy app credentials. Add these to app/.env, then rebuild the app.
        </Text>
        <View style={styles.vars}>
          <Text variant="mono">EXPO_PUBLIC_PRIVY_APP_ID</Text>
          <Text variant="mono">EXPO_PUBLIC_PRIVY_CLIENT_ID</Text>
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  missing: { flex: 1, justifyContent: 'center', padding: space.xl, backgroundColor: colors.canvas },
  card: { gap: space.md, padding: space.xxl, borderRadius: radius.xl },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vars: { gap: space.xs, padding: space.md, borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
});
