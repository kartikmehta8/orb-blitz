/**
 * @file Home "Bubble" section: Start/Stop toggle (PLAN.md §7.3 item 4, edge case 1).
 *
 * Self-contained: reads overlay permission and running state via
 * `usePermissions()` (re-checked on return to the app), persists the user's
 * choice with `setBubbleEnabled`, and is disabled with an explanation while
 * the overlay permission is missing. Renders nothing without the native module.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BubbleOverlay } from '../../modules/bubble-overlay';
import { setBubbleEnabled } from '../bubble';
import { usePermissions } from '../permissions';
import { space } from '../theme';
import { SettingRow } from './PermissionsCard';
import { Button, Card, Pill, Text } from './ui';

const NO_OVERLAY_MESSAGE = 'Allow "Display over other apps" above to start the bubble.';

/**
 * Bubble Start/Stop card.
 * @returns The card, or null when the native module is unavailable or status is loading.
 */
export function BubbleCard() {
  const { status, refresh } = usePermissions();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync with the real service state on every refresh (mount and AppState `active`).
  useEffect(() => {
    if (status) setRunning(status.bubbleRunning);
  }, [status]);

  const overlay = BubbleOverlay;
  if (!overlay || !status) return null;

  /** Starts or stops the service and stores the preference; the service starts and stops asynchronously, so state is set optimistically. */
  const toggle = async () => {
    setError(null);
    if (running) {
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
      setError(noPermission ? NO_OVERLAY_MESSAGE : 'Couldn’t start the bubble. Try again.');
      refresh();
    }
  };

  const subtitle = !status.overlay
    ? NO_OVERLAY_MESSAGE
    : running
      ? 'Running. It appears when you leave the app.'
      : 'Tap it over any app to ask about what’s on screen.';

  return (
    <Card>
      <Text variant="overline" color="textTertiary" style={styles.overline}>
        Bubble
      </Text>
      <SettingRow
        icon="message-circle"
        tint="primary"
        title="Floating bubble"
        subtitle={subtitle}
        trailing={<Pill label={running ? 'On' : 'Off'} tone={running ? 'success' : 'neutral'} dot={running} />}
      />
      {error && (
        <Text variant="caption" color="danger" style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      )}
      <View style={styles.action}>
        <Button
          label={running ? 'Stop bubble' : 'Start bubble'}
          icon={running ? 'square' : 'play'}
          variant={running ? 'secondary' : 'primary'}
          disabled={!running && !status.overlay}
          accessibilityHint={!running && !status.overlay ? NO_OVERLAY_MESSAGE : undefined}
          onPress={() => void toggle()}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  overline: { marginBottom: space.xs },
  error: { marginBottom: space.sm },
  action: { marginTop: space.xs },
});
