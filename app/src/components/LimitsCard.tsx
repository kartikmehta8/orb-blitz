/**
 * @file Profile "Spending limits" section: per-payment and daily caps, each
 * edited in a bottom sheet with presets, plus today's spend.
 */
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { LIMIT_DEFAULTS } from '../config';
import { limitError, saveLimits, type LimitState, type Limits } from '../limits';
import { colors, fonts, HIT, radius, space, type as typeScale } from '../theme';
import { monValue } from './format';
import { Sheet } from './Sheet';
import { Button, Card, ListRow, ProgressBar, SectionHeader, Text } from './ui';

type Field = keyof Limits;

const FIELDS: Record<Field, { title: string; subtitle: string; icon: 'zap' | 'calendar' }> = {
  perTxMon: { title: 'Per payment', subtitle: 'Largest single payment', icon: 'zap' },
  dailyMon: { title: 'Daily limit', subtitle: 'Total across a day', icon: 'calendar' },
};

const PRESETS = ['0.5', '1', '2', '5'];

/** Share of the daily cap after which the bar turns amber. */
const WARN_AT = 0.8;

/**
 * Editor sheet for one cap. Remount it (via `key`) for each edit so the input starts from the saved value.
 * @param props.field Cap being edited.
 * @param props.visible Whether the sheet is open.
 * @param props.limits Current caps.
 * @param props.onClose Closes without saving.
 * @param props.onSaved Called after the new caps are stored.
 * @returns The sheet.
 */
function LimitSheet({
  field,
  visible,
  limits,
  onClose,
  onSaved,
}: {
  field: Field;
  visible: boolean;
  limits: Limits;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(limits[field]);
  const [saving, setSaving] = useState(false);
  const error = limitError(value);
  const meta = FIELDS[field];

  const save = async () => {
    setSaving(true);
    await saveLimits({ ...limits, [field]: value.trim() });
    setSaving(false);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSaved();
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={meta.title}>
      <Text variant="callout" color="textSecondary">
        Payments above this are blocked, whatever the agent proposes. Maximum {LIMIT_DEFAULTS.hardMaxMon} MON on testnet.
      </Text>
      <View style={[styles.amountBox, value !== '' && error ? styles.amountBoxError : null]}>
        <TextInput
          value={value}
          onChangeText={(v) => setValue(v.replace(',', '.'))}
          keyboardType="decimal-pad"
          maxLength={8}
          autoFocus
          selectTextOnFocus
          accessibilityLabel={`${meta.title} limit in MON`}
          style={styles.amountInput}
        />
        <Text variant="headline" color="textTertiary">
          MON
        </Text>
      </View>
      {value !== '' && error ? (
        <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <View style={styles.presets}>
        {PRESETS.map((p) => {
          const active = value === p;
          return (
            <Pressable
              key={p}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${p} MON`}
              onPress={() => setValue(p)}
              style={({ pressed }) => [styles.preset, active && styles.presetActive, pressed && styles.presetPressed]}
            >
              <Text variant="button" color={active ? 'primary' : 'text'}>
                {p}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.actions}>
        <Button variant="secondary" label="Cancel" onPress={onClose} style={styles.flex} />
        <Button label="Save" loading={saving} disabled={!!error} onPress={() => void save()} style={styles.flex} />
      </View>
    </Sheet>
  );
}

/**
 * Spending limits section.
 * A missing store is the default caps, so a successful read is never an empty card.
 * @param props.state Current caps and spend. Null while the first read is in flight. Kept when a refresh fails.
 * @param props.error The last read threw. With `state`, the card stays and offers Retry. Without it, the error card replaces the skeleton.
 * @param props.onRetry Reads the caps again.
 * @param props.onSaved Called after caps are stored (to reload state).
 * @returns Section header plus card, skeleton, or error.
 */
export function LimitsCard({
  state,
  error = false,
  onRetry,
  onSaved,
}: {
  state: LimitState | null;
  error?: boolean;
  onRetry?: () => void;
  onSaved: () => void;
}) {
  const [field, setField] = useState<Field>('perTxMon');
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(0);
  const edit = (f: Field) => {
    setField(f);
    setSession((n) => n + 1);
    setOpen(true);
  };

  if (!state) {
    return (
      <View>
        <SectionHeader title="Spending limits" />
        {error ? (
          <Card style={styles.loading}>
            <View
              accessible
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              accessibilityLabel="Couldn’t load limits. Spending limits on this phone didn’t load. Your caps were not changed."
              style={styles.errorCopy}
            >
              <Text variant="headline" align="center">
                Couldn’t load limits
              </Text>
              <Text variant="callout" color="textSecondary" align="center">
                Spending limits on this phone didn’t load. Your caps were not changed.
              </Text>
            </View>
            {onRetry ? (
              <Button
                icon="refresh-cw"
                label="Retry"
                accessibilityLabel="Retry loading spending limits"
                onPress={onRetry}
              />
            ) : null}
          </Card>
        ) : (
          <Card accessible style={styles.loading} accessibilityLabel="Loading spending limits" accessibilityLiveRegion="polite">
            <View style={styles.skelLine} />
            <View style={styles.skelLine} />
            <View style={[styles.skelLine, styles.skelShort]} />
          </Card>
        )}
      </View>
    );
  }

  const used = state.dailyWei > 0n ? Number((state.spentWei * 1000n) / state.dailyWei) / 1000 : 0;
  const spentLabel = `${monValue(state.spentWei)} of ${monValue(state.dailyWei)} MON`;

  return (
    <View>
      <SectionHeader title="Spending limits" />
      <Card style={styles.card}>
        {error ? (
          <View style={styles.refreshError}>
            <Text
              variant="caption"
              color="danger"
              style={styles.flex}
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
            >
              Couldn’t refresh. These are the last limits that loaded.
            </Text>
            {onRetry ? (
              <Button
                size="sm"
                variant="secondary"
                label="Retry"
                accessibilityLabel="Retry loading spending limits"
                onPress={onRetry}
              />
            ) : null}
          </View>
        ) : null}
        {(Object.keys(FIELDS) as Field[]).map((field, i) => (
          <ListRow
            key={field}
            icon={FIELDS[field].icon}
            tone="neutral"
            title={FIELDS[field].title}
            subtitle={FIELDS[field].subtitle}
            divider={i > 0 || error}
            accessibilityLabel={`${FIELDS[field].title}, ${state.limits[field]} MON. Edit`}
            onPress={() => edit(field)}
            trailing={
              <View style={styles.value}>
                <Text variant="mono" style={styles.valueText}>
                  {state.limits[field]} MON
                </Text>
                <Text variant="bodyStrong" color="primaryInk">
                  Edit
                </Text>
              </View>
            }
          />
        ))}
        <View style={styles.spend} accessible accessibilityLabel={`Spent today ${spentLabel}`}>
          <View style={styles.spendHead}>
            <Text variant="captionStrong" color="textSecondary">
              Spent today
            </Text>
            <Text variant="captionStrong" color={used >= WARN_AT ? 'warning' : 'text'} style={styles.tabular}>
              {spentLabel}
            </Text>
          </View>
          <ProgressBar value={used} tone={used >= WARN_AT ? 'warning' : 'primary'} />
        </View>
      </Card>
      <LimitSheet
        key={session}
        field={field}
        visible={open}
        limits={state.limits}
        onClose={() => setOpen(false)}
        onSaved={() => {
          setOpen(false);
          onSaved();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  tabular: { fontVariant: ['tabular-nums'] },
  loading: { alignItems: 'stretch', gap: space.md, paddingVertical: space.xl },
  errorCopy: { alignItems: 'center', gap: space.sm },
  refreshError: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  skelLine: { height: 18, borderRadius: radius.sm, backgroundColor: colors.borderStrong },
  skelShort: { width: '55%' },
  card: { paddingVertical: space.xs },
  value: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  valueText: { fontFamily: fonts.monoMedium },
  spend: {
    gap: space.sm,
    paddingTop: space.md,
    paddingBottom: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  spendHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  amountBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 64,
    paddingHorizontal: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceMuted,
  },
  amountBoxError: { borderColor: colors.danger },
  amountInput: { ...typeScale.title, flex: 1, color: colors.text, padding: 0, fontVariant: ['tabular-nums'] },
  presets: { flexDirection: 'row', gap: space.sm },
  preset: {
    flex: 1,
    minHeight: HIT,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  presetActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  presetPressed: { backgroundColor: colors.surfaceMuted },
  actions: { flexDirection: 'row', gap: space.md },
});
