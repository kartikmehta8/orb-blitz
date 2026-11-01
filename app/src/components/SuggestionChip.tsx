/**
 * @file Suggestion chip for the Ask sheet: quick actions before the first
 * message, and clarification options from the agent.
 *
 * An option is either a full address or a MON amount. Address chips show an
 * optional label above a shortened address. Tapping still sends the raw option.
 */
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';
import { shortAddress } from '../intent';
import { colors, HIT, radius, space } from '../theme';
import { Text, type IconName } from './ui';

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const AMOUNT = /^\d+(?:\.\d+)?\s+MON$/i;

/**
 * Whether an option is a MON amount chip, such as "0.5 MON".
 * @param option Raw option string.
 * @returns True for amount options.
 */
export function isAmountOption(option: string): boolean {
  return AMOUNT.test(option.trim());
}

/**
 * Visible lines for one clarification option. A missing label is not invented.
 * @param option Raw value that a tap sends.
 * @param label Parallel label, or null when this option has none.
 * @returns The chip's text and the string a screen reader should speak.
 */
export function chipContent(
  option: string,
  label: string | null,
): { label: string; detail?: string; mono: boolean; accessibilityLabel: string } {
  if (ADDRESS.test(option)) {
    const short = shortAddress(option);
    if (label) return { label, detail: short, mono: false, accessibilityLabel: `${label}, ${option}` };
    return { label: short, mono: true, accessibilityLabel: option };
  }
  return { label: option, mono: isAmountOption(option), accessibilityLabel: option };
}

/**
 * Tappable suggestion. At least 48pt tall.
 * @param props.label Visible label.
 * @param props.detail Optional second line, always monospace (a shortened address).
 * @param props.icon Optional leading icon.
 * @param props.mono Render the label in monospace (amounts and unlabeled addresses).
 * @param props.accessibilityLabel Spoken label when it differs from the visible text.
 * @param props.onPress Sends the suggestion.
 * @returns The chip.
 */
export function SuggestionChip({
  label,
  detail,
  icon,
  mono,
  accessibilityLabel,
  onPress,
}: {
  label: string;
  detail?: string;
  icon?: IconName;
  mono?: boolean;
  accessibilityLabel?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (detail ? `${label}, ${detail}` : label)}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
    >
      {icon ? <Feather name={icon} size={16} color={colors.textSecondary} /> : null}
      <View style={styles.text}>
        <Text variant={mono ? 'mono' : 'bodyStrong'}>{label}</Text>
        {detail ? (
          <Text variant="mono" color="textSecondary">
            {detail}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    maxWidth: '100%',
    minHeight: HIT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  text: { flexShrink: 1, gap: space.xxs },
  pressed: { backgroundColor: colors.surfaceMuted },
});
