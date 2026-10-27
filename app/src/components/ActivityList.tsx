/**
 * @file Home "Activity" section: recent payments sent from the app, newest
 * first, with the in-flight payment (if any) on top. Tapping a row opens the
 * transaction on the explorer.
 */
import { ActivityIndicator, Linking, StyleSheet, View } from 'react-native';
import { txUrl } from '../config';
import { shortAddress } from '../intent';
import type { PendingStatus } from '../pendingTx';
import type { ActivityTx } from '../storage';
import { colors, space } from '../theme';
import { monValue, timeAgo } from './format';
import { Card, IconTile, ListRow, Pill, SectionHeader, Text, type Tone } from './ui';

type RowStatus = ActivityTx['status'] | 'pending' | 'unknown';
type Row = Omit<ActivityTx, 'status'> & { status: RowStatus };

const STATUS: Record<RowStatus, { verb: string; label: string; tone: Extract<Tone, 'primary' | 'warning' | 'danger' | 'neutral'> }> = {
  confirmed: { verb: 'Sent to', label: 'Confirmed', tone: 'primary' },
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
 * Activity section.
 * @param props.items Finished payments, newest first; null while loading.
 * @param props.pending Pending-slot status, shown as the top row when in flight.
 * @returns Section header plus a card of rows or an empty state.
 */
export function ActivityList({ items, pending }: { items: ActivityTx[] | null; pending: PendingStatus }) {
  const rows = items ? toRows(items, pending) : null;
  return (
    <View>
      <SectionHeader title="Activity" meta={rows?.length ? `${rows.length} recent` : undefined} />
      {!rows ? (
        <Card style={styles.empty}>
          <ActivityIndicator color={colors.primary} />
        </Card>
      ) : rows.length === 0 ? (
        <Card style={styles.empty}>
          <IconTile icon="send" tone="primary" size={48} />
          <Text variant="headline" align="center">
            No payments yet
          </Text>
          <Text variant="callout" color="textSecondary" align="center">
            Turn on the bubble, open any app and tap it to pay an address on your screen.
          </Text>
        </Card>
      ) : (
        <Card style={styles.list}>
          {rows.map((row, i) => (
            <ActivityRow key={row.hash} row={row} divider={i > 0} />
          ))}
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingVertical: space.xs },
  trailing: { alignItems: 'flex-end', gap: space.xs },
  empty: { alignItems: 'center', gap: space.sm, paddingVertical: space.xxl, paddingHorizontal: space.xxl },
});
