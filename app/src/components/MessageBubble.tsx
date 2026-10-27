/**
 * @file Chat bubbles for the Ask sheet: user (right, accent), agent (left,
 * muted) and the agent's "thinking" placeholder.
 */
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { colors, radius, space } from '../theme';
import { Text } from './ui';

/**
 * One chat message.
 * @param props.role Who wrote it.
 * @param props.text Message text; omit with `thinking` for the loading bubble.
 * @param props.thinking Show a spinner instead of text.
 * @returns An aligned bubble.
 */
export function MessageBubble({ role, text, thinking }: { role: 'user' | 'assistant'; text?: string; thinking?: boolean }) {
  const mine = role === 'user';
  return (
    <View
      accessible
      accessibilityLabel={thinking ? 'Agent is thinking' : `${mine ? 'You' : 'Agent'}: ${text ?? ''}`}
      style={[styles.bubble, mine ? styles.user : styles.agent]}
    >
      {thinking ? (
        <View style={styles.thinking}>
          <ActivityIndicator size="small" color={colors.textTertiary} />
          <Text variant="callout" color="textSecondary">
            Thinking…
          </Text>
        </View>
      ) : (
        <Text variant="callout" color={mine ? 'textInverse' : 'text'} selectable>
          {text}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: { maxWidth: '85%', paddingHorizontal: space.md + 2, paddingVertical: space.sm + 2, borderRadius: radius.lg },
  user: { alignSelf: 'flex-end', backgroundColor: colors.primary, borderBottomRightRadius: radius.sm / 2 },
  agent: { alignSelf: 'flex-start', backgroundColor: colors.surfaceMuted, borderBottomLeftRadius: radius.sm / 2 },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
