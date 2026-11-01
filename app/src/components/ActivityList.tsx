/**
 * @file Payment list used by the Wallet tab (latest few) and the Activity tab
 * (all): payments sent from the app, newest first, with the in-flight payment
 * (if any) on top. Tapping a row opens the transaction on the explorer.
 */
import { Linking, StyleSheet, View } from 'react-native';
import { txUrl } from '../config';
import { shortAddress } from '../intent';
import type { PendingStatus } from '../pendingTx';
import type { ActivityTx } from '../storage';
import { colors, radius, space } from '../theme';
import { monValue, timeAgo } from './format';
import { Button, Card, ListRow, Pill, Text, type Tone } from './ui';

type RowStatus = ActivityTx['status'] | 'pending' | 'unknown';
type Row = Omit<ActivityTx, 'status'> & { status: RowStatus };

const STATUS: Record<RowStatus, { verb: string; label: string; tone: Extract<Tone, 'warning' | 'danger' | 'neutral'> }> = {
  confirmed: { verb: 'Sent to', label: 'Confirmed', tone: 'neutral' },
  pending: { verb: 'Sending to', label: 'Pending', tone: 'warning' },
  unknown: { verb: 'Payment to', label: 'Unconfirmed', tone: 'neutral' },
  failed: { verb: 'Payment to', label: 'Failed', tone: 'danger' },
};

/**
 * Merges the pending slot into the stored list.
 * @param items Finished payments, newest first.
 * @param pending Pending-slot status.
 * @returns Rows to render, newest first, without duplicate hashes.
 */
function toRows(items: ActivityTx[], pending: PendingStatus): Row[] {
  if (pending.kind !== 'pending' && pending.kind !== 'unknown') return items;
  const { hash, to, amountWei, sentAt } = pending.tx;
  if (items.some((t) => t.hash === hash)) return items;
  return [{ hash, to, amountWei, at: sentAt, status: pending.kind }, ...items];
}

/**
 * One payment row.
 * @param props.row Payment.
 * @param props.divider Hairline above the row.
 * @returns A pressable list row.
 */
function ActivityRow({ row, divider }: { row: Row; divider: boolean }) {
  const s = STATUS[row.status];
  const amount = `−${monValue(BigInt(row.amountWei), 6)} MON`;
  const when = timeAgo(row.at);
  return (
    <ListRow
      icon="arrow-up-right"
      tone={s.tone}
      title={`${s.verb} ${shortAddress(row.to)}`}
      subtitle={`${when} · ${s.label}`}
      divider={divider}
      accessibilityLabel={`${s.verb} ${shortAddress(row.to)}, ${amount}, ${when}, ${s.label}. Opens explorer.`}
      onPress={() => void Linking.openURL(txUrl(row.hash))}
      trailing={
        <View style={styles.trailing}>
          <Text variant="amount" color={row.status === 'confirmed' ? 'text' : 'textTertiary'}>
            {amount}
          </Text>
          {row.status !== 'confirmed' ? <Pill label={s.label} tone={s.tone} /> : null}
        </View>
      }
    />
  );
}

/**
 * Payment list card.
 * @param props.items Finished payments, newest first; null while loading.
 * @param props.pending Pending-slot status, shown as the top row when in flight.
 * @param props.limit Show at most this many rows (default all).
 * @param props.emptyAction Optional button under the empty state.
 * @param props.error The read threw. Never rendered as the empty state.
 * @param props.onRetry Loads the list again.
 * @returns A card of rows, a skeleton, an error, or an empty state.
 */
export function ActivityList({
  items,
  pending,
  limit,
  emptyAction,
  error,
  onRetry,
}: {
  items: ActivityTx[] | null;
  pending: PendingStatus;
  limit?: number;
  emptyAction?: { label: string; onPress: () => void };
  error?: boolean;
  onRetry?: () => void;
}) {
  const rows = items ? toRows(items, pending).slice(0, limit) : null;
  if (error && (!rows || rows.length === 0)) {
    return (
      <Card style={styles.empty}>
        <Text variant="headline" align="center">
          Couldn’t load payments
        </Text>
        <Text variant="callout" color="textSecondary" align="center">
          Payments on this phone didn’t load. Nothing was sent.
        </Text>
        {onRetry ? <Button icon="refresh-cw" label="Retry" onPress={onRetry} style={styles.emptyAction} /> : null}
      </Card>
    );
  }
  if (!rows) return <ActivitySkeleton />;
  if (rows.length === 0) {
    return (
      <Card style={styles.empty}>
        <Text variant="headline" align="center">
          No payments yet
        </Text>
        <Text variant="callout" color="textSecondary" align="center">
          Payments you confirm from the orb show up here.
        </Text>
        {emptyAction ? (
          <Button size="sm" variant="secondary" label={emptyAction.label} onPress={emptyAction.onPress} style={styles.emptyAction} />
        ) : null}
      </Card>
    );
  }
  return (
    <Card style={styles.list}>
      {error && onRetry ? (
        <View style={styles.refreshError} accessibilityRole="alert">
          <Text variant="caption" color="danger" style={styles.flex}>
            Couldn’t refresh. This is the last list that loaded.
          </Text>
          <Button size="sm" variant="secondary" label="Retry" onPress={onRetry} />
        </View>
      ) : null}
      {rows.map((row, i) => (
        <ActivityRow key={row.hash} row={row} divider={i > 0 || !!error} />
      ))}
    </Card>
  );
}

/**
 * Three quiet rows in the shape of the list, with no spinner and no shimmer.
 * @returns The loading card.
 */
function ActivitySkeleton() {
  return (
    <Card style={styles.list} accessibilityLabel="Loading payments">
      {[0, 1, 2].map((row) => (
        <View key={row} style={styles.skelRow}>
          <View style={styles.skelIcon} />
          <View style={styles.skelText}>
            <View style={styles.skelLine} />
            <View style={[styles.skelLine, styles.skelShort]} />
          </View>
          <View style={styles.skelAmount} />
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  list: { paddingVertical: space.xs },
  flex: { flex: 1 },
  trailing: { alignItems: 'flex-end', gap: space.xs },
  empty: { alignItems: 'center', gap: space.sm, paddingVertical: space.xxl, paddingHorizontal: space.xxl },
  emptyAction: { marginTop: space.sm, alignSelf: 'stretch' },
  refreshError: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  skelRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  skelIcon: { width: 22, height: 22, borderRadius: radius.sm, backgroundColor: colors.borderStrong },
  skelText: { flex: 1, gap: space.sm },
  skelLine: { height: 12, borderRadius: radius.sm, backgroundColor: colors.borderStrong },
  skelShort: { width: '46%' },
  skelAmount: { width: 72, height: 14, borderRadius: radius.sm, backgroundColor: colors.borderStrong },
});
