/**
 * @file Bubble tab (spec §7.3 items 3 and 4): the floating bubble toggle, the
 * permission checklist, a three-step "How it works" and the OEM autostart tip.
 * Permissions are re-read whenever the app returns to the foreground.
 */
import { StyleSheet, View } from 'react-native';
import { BubbleCard } from '../../src/components/BubbleCard';
import { OemTip, PermissionsCard } from '../../src/components/PermissionsCard';
import { Screen } from '../../src/components/Screen';
import { Card, SectionHeader, Text } from '../../src/components/ui';
import { usePermissions } from '../../src/permissions';
import { colors, radius, space } from '../../src/theme';

const STEPS = ['Open any app with a payment message', 'Tap the bubble', 'Review and confirm with your fingerprint'];
const STEP_DOT = 28;

/**
 * Bubble screen.
 * @returns Toggle, setup checklist, how-it-works steps and the OEM tip.
 */
export default function BubbleScreen() {
  const permissions = usePermissions();
  return (
    <Screen title="Bubble" subtitle="A floating button that turns what is on your screen into a payment.">
      <BubbleCard status={permissions.status} refresh={permissions.refresh} />
      <PermissionsCard status={permissions.status} refresh={permissions.refresh} />
      <View>
        <SectionHeader title="How it works" />
        <Card style={styles.steps}>
          {STEPS.map((step, i) => (
            <View key={step} style={styles.step} accessible accessibilityLabel={`Step ${i + 1}. ${step}`}>
              <View style={styles.dot}>
                <Text variant="captionStrong" color="primary">
                  {i + 1}
                </Text>
              </View>
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
  step: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  dot: {
    width: STEP_DOT,
    height: STEP_DOT,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
});
