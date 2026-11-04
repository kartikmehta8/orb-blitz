/**
 * @file Execution status block for the payment card: replaces the
 * Confirm/Cancel buttons once a payment is in flight or settled, with the
 * transaction hash and explorer link where one exists.
 */
import { Icon } from './Icon';
import { useEffect, useRef, type ReactNode } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Linking, StyleSheet, View } from 'react-native';
import { txUrl } from '../config';
import type { ExecState } from '../execute';
import { NETWORKS, shortAddress, type ChainId } from '../intent';
import { colors, radius, space } from '../theme';
import { easeOut, motion, useReduceMotion } from './motion';
import { Button, Text, type IconName, type Tone } from './ui';

const BADGE = 56;

type Badge = { icon: IconName; tone: Extract<Tone, 'success' | 'warning' | 'danger'> } | 'spinner';

const BADGE_BG: Record<Exclude<Badge, 'spinner'>['tone'], string> = {
  success: colors.successSoft,
  warning: colors.warningSoft,
  danger: colors.dangerSoft,
};

/**
 * Round state badge. A settled icon eases in; reduced motion shows it at rest.
 * The spinner is for work in flight, where the content has no final shape yet.
 * @param props.badge What to show.
 * @returns The badge.
 */
function StateBadge({ badge }: { badge: Badge }) {
  const reduce = useReduceMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const badgeKey = badge === 'spinner' ? 'spinner' : `${badge.tone}:${badge.icon}`;

  useEffect(() => {
    if (badgeKey === 'spinner' || reduce) {
      scale.setValue(1);
      return;
    }
    scale.setValue(0.92);
    Animated.timing(scale, { toValue: 1, duration: motion.ui, easing: easeOut, useNativeDriver: true }).start();
  }, [badgeKey, reduce, scale]);

  if (badge === 'spinner') {
    return (
      <View style={[styles.badge, styles.spinnerBadge]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  return (
    <Animated.View style={[styles.badge, { backgroundColor: BADGE_BG[badge.tone], transform: [{ scale }] }]}>
      <Icon name={badge.icon} size={26} color={colors[badge.tone]} />
    </Animated.View>
  );
}

/**
 * Centered status layout shared by every state.
 * @param props.badge Leading badge.
 * @param props.title Main line.
 * @param props.detail Secondary line (reason or hash).
 * @param props.note Extra sentence under the detail.
 * @param props.mono Render the detail in monospace.
 * @param props.big Larger title (the success moment).
 * @param props.live `alert` for a failure, otherwise a polite update.
 * @param props.children Actions under the text.
 * @returns The block.
 */
function Block({
  badge,
  title,
  detail,
  note,
  mono,
  big,
  live = 'polite',
  children,
}: {
  badge: Badge;
  title: string;
  detail?: string;
  note?: string;
  mono?: boolean;
  big?: boolean;
  live?: 'polite' | 'alert';
  children?: ReactNode;
}) {
  const spoken = [title, detail, note].filter(Boolean).join('. ');
  useEffect(() => {
    if (spoken) AccessibilityInfo.announceForAccessibility(spoken);
  }, [spoken]);

  return (
    <View style={styles.block}>
      <View
        style={styles.copy}
        accessibilityLiveRegion={live === 'alert' ? 'assertive' : 'polite'}
        accessibilityRole={live === 'alert' ? 'alert' : 'text'}
      >
        <StateBadge key={badge === 'spinner' ? badge : badge.icon} badge={badge} />
        <View style={styles.text}>
          <Text variant={big ? 'title' : 'headline'} align="center" style={styles.tabular}>
            {title}
          </Text>
          {detail ? (
            <Text variant={mono ? 'mono' : 'callout'} color="textSecondary" align="center">
              {detail}
            </Text>
          ) : null}
          {note ? (
            <Text variant="callout" color="textSecondary" align="center">
              {note}
            </Text>
          ) : null}
        </View>
      </View>
      {children ? <View style={styles.actions}>{children}</View> : null}
    </View>
  );
}

/**
 * In-flight and terminal states with explorer links.
 * @param props.state Execution state (renders nothing for idle/cancelled).
 * @param props.chainId Network the payment is on, for the copy and the explorer link.
 * @param props.onCheckAgain Re-checks the receipt after a timeout.
 * @returns The status block, or null.
 */
export function PaymentStatus({ state, chainId, onCheckAgain }: { state: ExecState; chainId: ChainId; onCheckAgain: () => void }) {
  const network = NETWORKS[chainId].name;
  const hash = 'hash' in state ? state.hash : null;
  const explorer = hash ? (
    <Button size="sm" variant="secondary" icon="external-link" label="View on explorer" onPress={() => void Linking.openURL(txUrl(hash, chainId))} />
  ) : null;

  switch (state.status) {
    case 'confirming':
      return <Block badge="spinner" title="Waiting for your approval" detail="Use your fingerprint or device PIN." />;
    case 'signing':
      return <Block badge="spinner" title="Signing and sending" detail="This stays on your phone until it is sent." />;
    case 'submitted':
      return (
        <Block badge="spinner" title="Submitted" detail={shortAddress(state.hash)} note={`Waiting for ${network}.`} mono>
          {explorer}
        </Block>
      );
    case 'confirmed':
      return (
        <Block
          badge={{ icon: 'check', tone: 'success' }}
          title={state.ms === null ? 'Confirmed' : `Confirmed in ${state.ms} ms`}
          detail={shortAddress(state.hash)}
          note={`${network} included this payment.`}
          mono
          big
        >
          {explorer}
        </Block>
      );
    case 'failed':
      return (
        <Block badge={{ icon: 'x', tone: 'danger' }} title="Payment failed" detail={state.reason} live="alert">
          {explorer}
        </Block>
      );
    case 'pending_timeout':
      return (
        <Block
          badge={{ icon: 'clock', tone: 'warning' }}
          title="Still pending"
          detail={`${network} has not confirmed this yet. You can check again.`}
        >
          <Button size="sm" variant="primary" icon="refresh-cw" label="Check again" onPress={onCheckAgain} />
          {explorer}
        </Block>
      );
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  block: { alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  copy: { alignItems: 'center', gap: space.md, alignSelf: 'stretch' },
  badge: { width: BADGE, height: BADGE, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  spinnerBadge: { backgroundColor: colors.primarySoft },
  text: { alignItems: 'center', gap: space.xs, alignSelf: 'stretch' },
  tabular: { fontVariant: ['tabular-nums'] },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.sm },
});
