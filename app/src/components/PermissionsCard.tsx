/**
 * @file Home "Permissions" checklist (PLAN.md §7.3 item 3, edge cases 1, 3, 4, 5, 6).
 *
 * Self-contained: reads status via `usePermissions()` and re-checks on return
 * to the app. Overlay is required (red when missing); the rest are recommended
 * (amber). Also exports `SettingRow`, the row layout shared with `BubbleCard`.
 */
import { Feather } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { BubbleOverlay } from '../../modules/bubble-overlay';
import { fixPermission, usePermissions, type PermissionKey, type PermissionStatus } from '../permissions';
import { colors, HIT, radius, space } from '../theme';
import { Button, Card, Pill, StatusDot, Text, type IconName } from './ui';

type RowSpec = {
  key: PermissionKey;
  icon: IconName;
  title: string;
  granted: string;
  missing: string;
  /** Required rows go red when missing; recommended ones amber. */
  required: boolean;
  action: string;
};

const ROWS: RowSpec[] = [
  {
    key: 'overlay',
    icon: 'layers',
    title: 'Display over other apps',
    granted: 'The bubble can float over other apps',
    missing: 'Required to show the bubble',
    required: true,
    action: 'Fix',
  },
  {
    key: 'accessibility',
    icon: 'eye',
    title: 'Screen reader',
    granted: 'Bubble Agent screen reader is on',
    missing: 'Recommended. Without it, paste from your clipboard',
    required: false,
    action: 'Fix',
  },
  {
    key: 'notifications',
    icon: 'bell',
    title: 'Notifications',
    granted: "Shows the bubble's status notification",
    missing: "Needed for the bubble's status notification",
    required: false,
    action: 'Allow',
  },
  {
    key: 'battery',
    icon: 'battery-charging',
    title: 'Battery optimization',
    granted: 'Exempt, so the bubble keeps running',
    missing: 'Recommended so your phone doesn’t stop the bubble',
    required: false,
    action: 'Fix',
  },
];

const OEM_TIP =
  "Enable Autostart and 'Display pop-up windows while running in background' in App info → Other permissions.";

/**
 * One checklist row: icon tile, title, one-line subtitle and a trailing slot.
 * @param props.icon Feather icon name.
 * @param props.title Row title.
 * @param props.subtitle One-line explanation.
 * @param props.trailing Right-aligned content (status, action).
 * @param props.tint Icon tile tint; `primary` for the bubble row.
 * @returns A row view.
 */
export function SettingRow({
  icon,
  title,
  subtitle,
  trailing,
  tint = 'neutral',
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  trailing?: ReactNode;
  tint?: 'neutral' | 'primary';
}) {
  return (
    <View style={styles.row}>
      {/* Label block is one screen-reader element; the trailing action stays separately focusable. */}
      <View style={styles.rowLabel} accessible accessibilityLabel={`${title}. ${subtitle}`}>
        <View style={[styles.iconTile, tint === 'primary' && styles.iconTilePrimary]}>
          <Feather name={icon} size={18} color={tint === 'primary' ? colors.primary : colors.textSecondary} />
        </View>
        <View style={styles.rowText}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {title}
          </Text>
          <Text variant="caption" color="textSecondary" numberOfLines={2}>
            {subtitle}
          </Text>
        </View>
      </View>
      {trailing}
    </View>
  );
}

/**
 * Checks whether a permission is satisfied; rows that don't apply count as granted.
 * @param status Current snapshot.
 * @param key Permission.
 * @returns True if granted or not applicable.
 */
function isGranted(status: PermissionStatus, key: PermissionKey): boolean {
  return status[key] ?? true;
}

/**
 * Permissions checklist card. Renders an explanatory note when the native
 * module is unavailable (iOS, Expo Go).
 * @returns The card, or null while the first status read is in flight.
 */
export function PermissionsCard() {
  const { status, refresh } = usePermissions();
  const [tipOpen, setTipOpen] = useState(false);

  if (!BubbleOverlay) {
    return (
      <Card>
        <Text variant="overline" color="textTertiary" style={styles.overline}>
          Permissions
        </Text>
        <SettingRow
          icon="smartphone"
          title="Android build required"
          subtitle="The bubble and its permissions need the Bubble Agent Android app, not Expo Go."
        />
      </Card>
    );
  }
  if (!status) return null;

  const rows = ROWS.filter((row) => status[row.key] !== null);
  const missing = rows.filter((row) => !isGranted(status, row.key));
  const summary = missing.some((row) => row.required) ? (
    <Pill label="Action needed" tone="danger" />
  ) : missing.length > 0 ? (
    <Pill label={`${missing.length} recommended`} tone="warning" />
  ) : (
    <Pill label="All set" tone="success" />
  );

  return (
    <Card>
      <View style={styles.header}>
        <Text variant="overline" color="textTertiary">
          Permissions
        </Text>
        {summary}
      </View>

      {rows.map((row, i) => {
        const granted = isGranted(status, row.key);
        return (
          <View key={row.key}>
            {i > 0 && <View style={styles.divider} />}
            <SettingRow
              icon={row.icon}
              title={row.title}
              subtitle={granted ? row.granted : row.missing}
              trailing={
                <View style={styles.trailing}>
                  <StatusDot tone={granted ? 'success' : row.required ? 'danger' : 'warning'} />
                  {!granted && (
                    <Button
                      label={row.action}
                      accessibilityLabel={`${row.action} ${row.title}`}
                      size="sm"
                      variant={row.required ? 'primary' : 'secondary'}
                      onPress={() => void fixPermission(row.key).then(refresh)}
                    />
                  )}
                </View>
              }
            />
            {row.key === 'accessibility' && !granted && (
              <View style={styles.hint}>
                <Feather name="info" size={14} color={colors.textTertiary} style={styles.hintIcon} />
                <View style={styles.hintBody}>
                  <Text variant="caption" color="textSecondary">
                    Switch greyed out? Android restricts it for apps installed from a file. Open App info, tap ⋮,
                    then Allow restricted settings.
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Open App info"
                    hitSlop={space.md}
                    onPress={() => void Linking.openSettings()}
                  >
                    <Text variant="captionStrong" color="primary">
                      Open App info
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        );
      })}

      <View style={styles.divider} />
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: tipOpen }}
        accessibilityLabel="Tip for Xiaomi, Redmi, POCO, Realme, Oppo or Vivo phones"
        onPress={() => setTipOpen((open) => !open)}
        style={({ pressed }) => [styles.tipToggle, pressed && styles.tipPressed]}
      >
        <Text variant="captionStrong" color="textSecondary" style={styles.tipLabel}>
          Xiaomi, Redmi, POCO, Realme, Oppo or Vivo?
        </Text>
        <Feather name={tipOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textTertiary} />
      </Pressable>
      {tipOpen && (
        <Text variant="caption" color="textSecondary" style={styles.tipBody}>
          {OEM_TIP}
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.xs,
  },
  overline: { marginBottom: space.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: HIT + space.lg,
    paddingVertical: space.md,
  },
  iconTile: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconTilePrimary: { backgroundColor: colors.primarySoft },
  rowLabel: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md },
  rowText: { flex: 1, gap: space.xxs },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  hint: {
    flexDirection: 'row',
    gap: space.sm,
    padding: space.md,
    marginBottom: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  hintIcon: { marginTop: space.xxs },
  hintBody: { flex: 1, gap: space.sm, alignItems: 'flex-start' },
  tipToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: HIT,
    marginHorizontal: -space.sm,
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
  },
  tipLabel: { flex: 1 },
  tipPressed: { backgroundColor: colors.surfaceMuted },
  tipBody: { paddingBottom: space.xs },
});
