/**
 * @file Design-system primitives: Text, Button, Card, Pill, StatusDot.
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
  View,
  type PressableProps,
  type StyleProp,
  type TextProps as RNTextProps,
  type ViewStyle,
} from 'react-native';
import { colors, HIT, radius, shadow, space, type as typeScale, type ColorToken, type TypeVariant } from '../theme';

export type IconName = ComponentProps<typeof Feather>['name'];

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

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

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
  ghost: { bg: 'transparent', pressed: colors.primarySoft, fg: 'primary' },
  danger: { bg: colors.dangerSoft, pressed: '#FBDCDA', fg: 'danger' },
};

/**
 * Button with variants, optional leading icon and a loading state.
 * Disabled and loading both block presses and are announced to screen readers.
 * @param props.label Visible and accessible label.
 * @returns A pressable button.
 */
export function Button({ label, variant = 'primary', icon, loading, disabled, size = 'md', style, ...rest }: ButtonProps) {
  const tone = BUTTON_TONES[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      hitSlop={size === 'sm' ? 8 : 0}
      style={({ pressed }) => [
        styles.button,
        size === 'sm' && styles.buttonSm,
        { backgroundColor: pressed ? tone.pressed : tone.bg, borderColor: tone.border ?? 'transparent' },
        inactive && styles.inactive,
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={colors[tone.fg]} size="small" />
      ) : (
        <>
          {icon && <Feather name={icon} size={size === 'sm' ? 15 : 17} color={colors[tone.fg]} />}
          <Text variant={size === 'sm' ? 'captionStrong' : 'bodyStrong'} color={tone.fg}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

/**
 * White rounded surface with a hairline border and soft shadow.
 * @param props.children Card content.
 * @param props.style Extra container style.
 * @returns A card view.
 */
export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';

const PILL_TONES: Record<Tone, { bg: string; fg: ColorToken }> = {
  neutral: { bg: colors.surfaceMuted, fg: 'textSecondary' },
  primary: { bg: colors.primarySoft, fg: 'primary' },
  success: { bg: colors.successSoft, fg: 'success' },
  warning: { bg: colors.warningSoft, fg: 'warning' },
  danger: { bg: colors.dangerSoft, fg: 'danger' },
};

/**
 * Small rounded label, e.g. the "Monad Testnet" badge.
 * @param props.label Text.
 * @param props.tone Color tone.
 * @param props.dot Show a leading status dot.
 * @returns A pill view.
 */
export function Pill({ label, tone = 'neutral', dot }: { label: string; tone?: Tone; dot?: boolean }) {
  const t = PILL_TONES[tone];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }]}>
      {dot && <View style={[styles.dot, { backgroundColor: colors[t.fg] }]} />}
      <Text variant="captionStrong" color={t.fg}>
        {label}
      </Text>
    </View>
  );
}

/**
 * Status dot for checklists.
 * @param props.tone `success` (ok), `warning` (recommended) or `danger` (required, missing).
 * @returns An 8-pt dot with an outer halo.
 */
export function StatusDot({ tone }: { tone: Extract<Tone, 'success' | 'warning' | 'danger'> }) {
  return (
    <View style={[styles.halo, { backgroundColor: PILL_TONES[tone].bg }]}>
      <View style={[styles.dot, { backgroundColor: colors[PILL_TONES[tone].fg] }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: HIT,
    paddingHorizontal: space.xl,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  buttonSm: { minHeight: 34, paddingHorizontal: space.md, borderRadius: radius.sm, gap: space.xs },
  inactive: { opacity: 0.45 },
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
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  halo: { width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});
