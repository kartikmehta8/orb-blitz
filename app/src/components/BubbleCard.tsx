/**
 * @file Orb tab main card: on/off toggle for the floating orb.
 *
 * Persists the user's choice with `setBubbleEnabled`, and is disabled with an
 * explanation (and a shortcut to grant it) while the overlay permission is
 * missing. Renders nothing without the native module.
 */
import { Icon } from './Icon';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BubbleOverlay } from '../../modules/bubble-overlay';
import { setBubbleEnabled } from '../bubble';
import { fixPermission, type PermissionStatus } from '../permissions';
import { colors, radius, space } from '../theme';
import { OrbGlyph } from './BrandMark';
import { Button, Card, Text, Toggle, type IconName } from './ui';

const NO_OVERLAY_MESSAGE = 'Allow "Display over other apps" to turn on the orb.';

const TIPS: { icon: IconName; label: string }[] = [
  { icon: 'mouse-pointer', label: 'Tap to ask' },
  { icon: 'move', label: 'Drag to move' },
  { icon: 'x-circle', label: 'Hold to stop' },
];

/**
 * Orb on/off card.
 * @param props.status Permission snapshot (includes whether the service runs); null while loading.
 * @param props.refresh Re-reads the snapshot.
 * @returns The card, or null when the native module is unavailable or status is loading.
 */
export function BubbleCard({ status, refresh }: { status: PermissionStatus | null; refresh: () => void }) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync with the real service state on every refresh (mount and AppState `active`).
  useEffect(() => {
    if (status) setRunning(status.bubbleRunning);
  }, [status]);

  const overlay = BubbleOverlay;
  if (!overlay || !status) return null;

  /** Starts or stops the service and stores the preference; the service starts and stops asynchronously, so state is set optimistically. */
  const toggle = async (on: boolean) => {
    setError(null);
    if (!on) {
      overlay.stopBubble();
      setRunning(false);
      await setBubbleEnabled(false);
      return;
    }
    try {
      overlay.startBubble();
      setRunning(true);
      await setBubbleEnabled(true);
    } catch (e) {
      const noPermission = (e as { code?: string }).code === 'E_NO_OVERLAY_PERMISSION';
      setError(noPermission ? NO_OVERLAY_MESSAGE : 'Couldn’t start the orb. Try again.');
      refresh();
    }
  };

  const blocked = !running && !status.overlay;

  return (
    <Card style={styles.card}>
      <View style={styles.main}>
        <View style={styles.preview}>
          <OrbGlyph size={28} color={colors.textInverse} />
        </View>
        <View style={styles.text}>
          <Text variant="headline">Floating orb</Text>
          <View style={[styles.status, running ? styles.statusOn : styles.statusOff]}>
            <View style={[styles.statusDot, { backgroundColor: running ? colors.success : colors.textTertiary }]} />
            <Text variant="captionStrong" color={running ? 'success' : 'textSecondary'}>
              {running ? 'On over other apps' : 'Off'}
            </Text>
          </View>
        </View>
        <Toggle value={running} onValueChange={(on) => void toggle(on)} label="Floating orb" disabled={blocked} />
      </View>
      <Text variant="callout" color="textSecondary">
        Floats over every app. Tap it to ask Orb about what is on your screen: check whether a message is a scam, look up an
        address or pay someone. Nothing is read until you tap.
      </Text>

      {blocked ? (
        <View style={styles.notice}>
          <Icon name="lock" size={14} color={colors.warning} />
          <Text variant="caption" color="textSecondary" style={styles.flex}>
            {NO_OVERLAY_MESSAGE}
          </Text>
          <Button size="sm" label="Allow" accessibilityLabel="Allow display over other apps" onPress={() => void fixPermission('overlay').then(refresh)} />
        </View>
      ) : null}
      {error ? (
        <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}

      <View style={styles.tips} accessible accessibilityLabel={TIPS.map((t) => t.label).join(', ')}>
        {TIPS.map((tip) => (
          <View key={tip.label} style={styles.tip}>
            <Icon name={tip.icon} size={14} color={colors.textSecondary} />
            <Text variant="captionStrong" color="textSecondary" numberOfLines={1}>
              {tip.label}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

const PREVIEW = 56;

const styles = StyleSheet.create({
  card: { gap: space.lg },
  flex: { flex: 1 },
  main: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  preview: {
    width: PREVIEW,
    height: PREVIEW,
    borderRadius: PREVIEW / 2,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: space.xs },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space.xs + 2,
    paddingHorizontal: space.sm + 2,
    paddingVertical: space.xxs + 1,
    borderRadius: radius.pill,
  },
  statusOn: { backgroundColor: colors.successSoft },
  statusOff: { backgroundColor: colors.surfaceMuted },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.warningSoft,
  },
  tips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
    paddingHorizontal: space.md,
    paddingVertical: space.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
});
