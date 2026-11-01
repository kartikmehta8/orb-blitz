/**
 * @file Orb tab: the floating orb toggle, the
 * permission checklist, a three-step "How it works" and the OEM autostart tip.
 * Permissions are re-read whenever the app returns to the foreground.
 */
import { StyleSheet, View } from 'react-native';
import { BubbleCard } from '../../src/components/BubbleCard';
import { OemTip, PermissionsCard } from '../../src/components/PermissionsCard';
import { Screen } from '../../src/components/Screen';
import { Card, SectionHeader, Text } from '../../src/components/ui';
import { usePermissions } from '../../src/permissions';
import { space } from '../../src/theme';

const STEPS = ['Open any app with a payment message', 'Tap the orb', 'Review and confirm with your fingerprint'];

/**
 * Orb screen.
 * @returns Toggle, setup checklist, how-it-works steps and the OEM tip.
 */
export default function BubbleScreen() {
  const permissions = usePermissions();
  return (
    <Screen title="Orb" subtitle="Tap the orb in any app to pay from what is on screen.">
      <BubbleCard status={permissions.status} refresh={permissions.refresh} />
      <PermissionsCard status={permissions.status} refresh={permissions.refresh} />
      <View>
        <SectionHeader title="How it works" />
        <Card style={styles.steps}>
          {STEPS.map((step, i) => (
            <View key={step} style={styles.step} accessible accessibilityLabel={`Step ${i + 1}. ${step}`}>
              <Text variant="bodyStrong" color="textSecondary">
                {i + 1}
              </Text>
              <Text variant="bodyStrong" style={styles.flex}>
                {step}
              </Text>
            </View>
          ))}
        </Card>
      </View>
      <OemTip />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  steps: { gap: space.lg },
  step: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48 },
});
