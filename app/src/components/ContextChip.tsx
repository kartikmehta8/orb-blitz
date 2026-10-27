/**
 * @file Context chip at the top of the Ask sheet (spec §7.4): shows what was
 * read, lets the user inspect the raw text and exclude it, or offers the
 * clipboard when the screen couldn't be read.
 */
import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import type { AgentContext } from '../agentApi';
import { colors, HIT, radius, space } from '../theme';
import { Button, Text } from './ui';

/** Captured screen or clipboard text, as shown and sent. */
export type CapturedContext = AgentContext & { truncated: boolean };

export type ContextState =
  | { kind: 'captured'; ctx: CapturedContext }
  /** The app was read but exposes no text (Flutter, canvas, games). */
  | { kind: 'empty'; appLabel: string }
  /** No capture: accessibility off, capture expired, or our own app. */
  | { kind: 'unavailable'; accessibilityOn: boolean };

type Props = {
  state: ContextState;
  excluded: boolean;
  onExcludedChange: (excluded: boolean) => void;
  onUseClipboard: () => void;
  /** e.g. "Clipboard is empty." */
  clipboardError: string | null;
};

/**
 * Context chip with expand, "Don't use" toggle and clipboard fallback.
 * @param props.state What was captured.
 * @param props.excluded Whether the user excluded the text from requests.
 * @param props.onExcludedChange Toggles exclusion.
 * @param props.onUseClipboard Reads the clipboard (only on this explicit tap).
 * @param props.clipboardError Message after a failed clipboard read.
 * @returns The chip.
 */
export function ContextChip({ state, excluded, onExcludedChange, onUseClipboard, clipboardError }: Props) {
  const [open, setOpen] = useState(false);

  if (state.kind !== 'captured') {
    const body =
      state.kind === 'empty'
        ? `${state.appLabel} doesn't expose its text. Copy the details and tap "Use clipboard".`
        : state.accessibilityOn
          ? 'Copy the details and tap "Use clipboard".'
          : "Turn on screen reading to let me see what you're looking at, or use your clipboard.";
    return (
      <View style={[styles.box, styles.muted]}>
        <View style={styles.headRow}>
          <Feather name="eye-off" size={16} color={colors.textSecondary} />
          <Text variant="captionStrong" color="textSecondary">
            {"Couldn't read the screen"}
          </Text>
        </View>
        <Text variant="caption" color="textSecondary">
          {body}
        </Text>
        <View style={styles.actionRow}>
          <Button size="sm" variant="secondary" icon="clipboard" label="Use clipboard" onPress={onUseClipboard} />
          {clipboardError ? (
            <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
              {clipboardError}
            </Text>
          ) : null}
        </View>
      </View>
    );
  }

  const { ctx } = state;
  const label = `${excluded ? 'Not using' : 'Reading'}: ${ctx.appLabel} · ${ctx.text.length} chars${ctx.truncated ? ' (truncated)' : ''}`;
  const fg = excluded ? 'textSecondary' : 'primary';
  return (
    <View style={[styles.box, excluded ? styles.muted : styles.active]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={open ? 'Hides the captured text' : 'Shows the captured text'}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((o) => !o)}
        style={styles.headRow}
        hitSlop={8}
      >
        <Feather name={excluded ? 'eye-off' : ctx.source === 'clipboard' ? 'clipboard' : 'eye'} size={16} color={colors[fg]} />
        <Text variant="captionStrong" color={fg} style={styles.flex} numberOfLines={1}>
          {label}
        </Text>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors[fg]} />
      </Pressable>
      {open ? (
        <>
          <ScrollView style={styles.raw} nestedScrollEnabled>
            <Text variant="mono" color="textSecondary" selectable>
              {ctx.text}
            </Text>
          </ScrollView>
          <View style={styles.toggleRow}>
            <Text variant="callout" style={styles.flex}>
              {"Don't use this text"}
            </Text>
            <Switch
              accessibilityLabel="Don't use this text"
              value={excluded}
              onValueChange={onExcludedChange}
              trackColor={{ false: colors.borderStrong, true: colors.primary }}
              thumbColor={colors.surface}
            />
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, padding: space.md, gap: space.sm },
  active: { backgroundColor: colors.primarySoft, borderColor: colors.primarySoftBorder },
  muted: { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 32 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, flexWrap: 'wrap' },
  flex: { flex: 1 },
  raw: {
    maxHeight: 140,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: space.md,
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center', minHeight: HIT, gap: space.md },
});
