/**
 * @file Design-system primitives: Text, Button, Card, Pill, StatusDot,
 * IconTile, ListRow, SectionHeader, ProgressBar and Toggle.
 *
 * Screens compose these instead of styling raw RN views, which keeps
 * typography, color and touch targets consistent across the app.
 */
import { Feather } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text as RNText,
  StyleSheet,
  Switch,
  View,
  type PressableProps,
  type StyleProp,
  type TextProps as RNTextProps,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { colors, HIT, radius, shadow, space, type as typeScale, type ColorToken, type TypeVariant } from '../theme';

export type IconName = ComponentProps<typeof Feather>['name'];

/** Semantic tones shared by pills, tiles, dots and progress bars. */
export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';

const TONES: Record<Tone, { bg: string; fg: ColorToken }> = {
  neutral: { bg: colors.surfaceMuted, fg: 'textSecondary' },
  primary: { bg: colors.primarySoft, fg: 'primaryInk' },
  success: { bg: colors.successSoft, fg: 'success' },
  warning: { bg: colors.warningSoft, fg: 'warning' },
  danger: { bg: colors.dangerSoft, fg: 'danger' },
};

type TextProps = RNTextProps & { variant?: TypeVariant; color?: ColorToken; align?: 'left' | 'center' | 'right' };

/**
 * Themed text. Always use this instead of RN `Text`.
 * @param props.variant Type-scale entry (default `body`).
 * @param props.color Color token (default `text`).
 * @returns A styled `Text`.
 */
export function Text({ variant = 'body', color = 'text', align, style, ...rest }: TextProps) {
  return <RNText {...rest} style={[typeScale[variant], { color: colors[color], textAlign: align }, style]} />;
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

type ButtonProps = Omit<PressableProps, 'style' | 'children'> & {
  label: string;
  variant?: ButtonVariant;
  icon?: IconName;
  loading?: boolean;
  size?: 'md' | 'sm';
  style?: StyleProp<ViewStyle>;
};

const BUTTON_TONES: Record<ButtonVariant, { bg: string; pressed: string; fg: ColorToken; border?: string }> = {
  primary: { bg: colors.primary, pressed: colors.primaryPressed, fg: 'textInverse' },
  secondary: { bg: colors.surface, pressed: colors.surfaceMuted, fg: 'text', border: colors.borderStrong },
  ghost: { bg: 'transparent', pressed: colors.primarySoft, fg: 'primaryInk' },
};

/**
 * Pill button with a sentence-case label, variants, optional leading icon
 * and a loading state. Disabled and loading both block presses and are
 * announced to screen readers.
 * @param props.label Visible and accessible label.
 * @returns A pressable button.
 */
export function Button({ label, variant = 'primary', icon, loading, disabled, size = 'md', style, ...rest }: ButtonProps) {
  const tone = BUTTON_TONES[variant];
  const blocked = disabled || loading;
  // Disabled is a solid muted control, not a faded one, so the label stays above 4.5:1.
  const quiet = !!disabled && !loading;
  const fg: ColorToken = quiet ? 'textSecondary' : tone.fg;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!blocked, busy: !!loading }}
      disabled={blocked}
      style={({ pressed }) => [
        styles.button,
        size === 'sm' && styles.buttonSm,
        {
          backgroundColor: quiet ? colors.surfaceMuted : pressed ? tone.pressed : tone.bg,
          borderColor: quiet ? colors.borderStrong : (tone.border ?? 'transparent'),
        },
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={colors[fg]} size="small" />
      ) : (
        <>
          {icon && <Feather name={icon} size={16} color={colors[fg]} />}
          <Text variant="button" color={fg} style={[styles.buttonLabel, size === 'sm' && styles.buttonSmText]}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

/**
 * White rounded surface with a hairline border.
 * @param props.children Card content.
 * @param props.style Extra container style.
 * @returns A card view.
 */
export function Card({
  children,
  style,
  ...rest
}: { children: ReactNode; style?: StyleProp<ViewStyle> } & Pick<ViewProps, 'accessibilityRole' | 'accessibilityLabel'>) {
  return (
    <View {...rest} style={[styles.card, style]}>
      {children}
    </View>
  );
}

/**
 * Small rounded label, e.g. the "Monad Testnet" badge.
 * @param props.label Text.
 * @param props.tone Color tone.
 * @param props.dot Show a leading status dot.
 * @returns A pill view.
 */
export function Pill({ label, tone = 'neutral', dot }: { label: string; tone?: Tone; dot?: boolean }) {
  const t = TONES[tone];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }]}>
      {dot && <View style={[styles.dot, { backgroundColor: colors[t.fg] }]} />}
      <Text variant="overline" color={t.fg}>
        {label}
      </Text>
    </View>
  );
}

/**
 * Status dot with a soft halo.
 * @param props.tone `success` (ok), `warning` (recommended) or `danger` (required, missing).
 * @returns A 7-pt dot inside a 16-pt halo.
 */
export function StatusDot({ tone }: { tone: Extract<Tone, 'success' | 'warning' | 'danger'> }) {
  return (
    <View style={[styles.halo, { backgroundColor: TONES[tone].bg }]}>
      <View style={[styles.dot, { backgroundColor: colors[TONES[tone].fg] }]} />
    </View>
  );
}

/**
 * Outline icon for a row. No tinted tile: color is reserved for status.
 * @param props.icon Feather icon name.
 * @param props.tone Icon color (default neutral).
 * @param props.size Slot edge in pt (default 24). The glyph stays smaller than the slot.
 * @returns The icon.
 */
export function IconTile({ icon, tone = 'neutral', size = 24 }: { icon: IconName; tone?: Tone; size?: number }) {
  const t = TONES[tone];
  return (
    <View style={[styles.tile, { width: size, height: size }]}>
      <Feather name={icon} size={Math.min(22, Math.round(size * 0.7))} color={colors[t.fg]} />
    </View>
  );
}

type ListRowProps = {
  title: string;
  subtitle?: string;
  icon?: IconName;
  tone?: Tone;
  /** Right-hand content; defaults to a chevron when the row is pressable. */
  trailing?: ReactNode;
  onPress?: () => void;
  /** Hairline above the row (for stacked rows inside a card). */
  divider?: boolean;
  accessibilityLabel?: string;
};

/**
 * Settings-style row: icon tile, title, subtitle, trailing slot.
 * @returns A static or pressable row with a 56-pt minimum height.
 */
export function ListRow({ title, subtitle, icon, tone, trailing, onPress, divider, accessibilityLabel }: ListRowProps) {
  const content = (
    <>
      {icon && <IconTile icon={icon} tone={tone} />}
      <View style={styles.rowText}>
        <Text variant="bodyStrong">{title}</Text>
        {subtitle ? (
          <Text variant="caption" color="textSecondary" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ?? (onPress ? <Feather name="chevron-right" size={18} color={colors.textTertiary} /> : null)}
    </>
  );
  const style = [styles.row, divider && styles.rowDivider];
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      onPress={onPress}
      style={({ pressed }) => [...style, pressed && styles.rowPressed]}
    >
      {content}
    </Pressable>
  ) : (
    <View style={style} accessibilityLabel={accessibilityLabel}>
      {content}
    </View>
  );
}

/**
 * Section title with optional right-aligned meta text or action.
 * @param props.title Section name.
 * @param props.meta Muted text on the right (e.g. "3 of 4 ready").
 * @param props.action Text button on the right.
 * @returns The header row.
 */
export function SectionHeader({
  title,
  meta,
  action,
}: {
  title: string;
  meta?: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.section}>
      <Text variant="headline" accessibilityRole="header">
        {title}
      </Text>
      {action ? (
        <Pressable accessibilityRole="button" accessibilityLabel={action.label} onPress={action.onPress} style={styles.sectionAction}>
          <Text variant="bodyStrong" color="primaryInk">
            {action.label}
          </Text>
        </Pressable>
      ) : meta ? (
        <Text variant="caption" color="textTertiary">
          {meta}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Thin rounded progress bar.
 * @param props.value Fraction from 0 to 1 (clamped).
 * @param props.tone Fill tone (default `primary`).
 * @returns The bar, announced as a progressbar.
 */
export function ProgressBar({ value, tone = 'primary' }: { value: number; tone?: Exclude<Tone, 'neutral'> }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: pct }}>
      <View style={[styles.fill, { width: `${pct}%`, backgroundColor: colors[TONES[tone].fg] }]} />
    </View>
  );
}

/**
 * Brand-colored switch.
 * @param props.value Current state.
 * @param props.onValueChange Change handler.
 * @param props.label Accessible label.
 * @param props.disabled Blocks interaction.
 * @returns A native switch.
 */
export function Toggle({
  value,
  onValueChange,
  label,
  disabled,
}: {
  value: boolean;
  onValueChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <Switch
      accessibilityLabel={label}
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      trackColor={{ true: colors.primary, false: colors.borderStrong }}
      thumbColor={colors.surface}
      ios_backgroundColor={colors.borderStrong}
    />
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    paddingHorizontal: space.xl,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  buttonSm: { minHeight: HIT, paddingHorizontal: space.lg },
  buttonLabel: { flexShrink: 1, textAlign: 'center' },
  buttonSmText: { fontSize: 15, lineHeight: 20 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: space.lg,
    ...shadow.card,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
    paddingHorizontal: space.sm + 2,
    paddingVertical: space.xs + 1,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  halo: { width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  tile: { alignItems: 'center', justifyContent: 'center' },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowPressed: { opacity: 0.6 },
  rowText: { flex: 1, gap: space.xxs },
  section: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: HIT,
    paddingHorizontal: space.xs,
  },
  sectionAction: { minHeight: HIT, justifyContent: 'center', paddingHorizontal: space.sm },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceMuted, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
});

