/**
 * @file Agents: connect Claude Code, Codex or any MCP client to this wallet.
 *
 * An agent can only ask. Each request becomes a notification, opens the review
 * card with its Scam Shield label, and moves money only after the fingerprint.
 * Each agent has its own per-payment and daily limit on top of the device limits.
 */
import { Icon } from '../src/components/Icon';
import * as Haptics from 'expo-haptics';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { BubbleOverlay } from '../modules/bubble-overlay';
import {
  connectAgent,
  connectSetup,
  listAgents,
  registerInbox,
  revokeAgent,
  type AgentPaymentRequest,
  type ConnectedAgent,
} from '../src/agentsApi';
import { AgentAvatar, BrandLogo } from '../src/components/AgentAvatar';
import { AGENT_BRANDS } from '../src/components/agentLogos';
import { Screen } from '../src/components/Screen';
import { Sheet } from '../src/components/Sheet';
import { Button, Card, ListRow, SectionHeader, Text } from '../src/components/ui';
import { useCopy } from '../src/components/useCopy';
import { useWallet } from '../src/hooks';
import { parseMon, shortAddress } from '../src/intent';
import { colors, HIT, radius, space, type as typeScale } from '../src/theme';

/** Same ceiling as the device limits. */
const HARD_MAX = parseMon('10') as bigint;

type Load = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; agents: ConnectedAgent[]; requests: AgentPaymentRequest[] };

/**
 * Agents screen.
 * @returns Waiting requests, connected agents and the connect flow.
 */
export default function AgentsScreen() {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [connecting, setConnecting] = useState(false);
  const orbOn = BubbleOverlay?.isBubbleRunning() ?? false;

  const refresh = useCallback(async () => {
    try {
      const data = await listAgents();
      setLoad({ kind: 'ready', ...data });
      // Fresh inbox token for the orb's listener each visit; harmless if no agent is connected yet.
      if (data.agents.length) await registerInbox().catch(() => undefined);
    } catch (e) {
      setLoad({ kind: 'error', message: e instanceof Error ? e.message : "Couldn't load agents." });
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const confirmRevoke = (agent: ConnectedAgent) =>
    Alert.alert(`Disconnect ${agent.name}?`, 'Its key stops working and anything it is waiting on is declined.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: () => void revokeAgent(agent.id).then(refresh, () => Alert.alert("Couldn't disconnect", 'Try again.')),
      },
    ]);

  const header = (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))}
        style={({ pressed }) => [styles.back, pressed && styles.pressed]}
      >
        <Icon name="chevron-left" size={24} color={colors.text} />
      </Pressable>
      <Text variant="title" accessibilityRole="header">
        Agents
      </Text>
    </View>
  );

  return (
    <Screen header={header} onRefresh={refresh}>
      <Text variant="callout" color="textSecondary">
        Let Claude, Codex or another AI agent ask this wallet to pay. Every request comes to this phone as a notification,
        and nothing is sent until you confirm with your fingerprint.
      </Text>

      {!orbOn ? (
        <Card style={styles.notice}>
          <Icon name="bell-off" size={18} color={colors.warning} />
          <View style={styles.flex}>
            <Text variant="bodyStrong">Turn on the orb to get notified</Text>
            <Text variant="caption" color="textSecondary">
              Agent requests arrive through the orb. While it is off, check this screen instead.
            </Text>
          </View>
          <Button size="sm" variant="secondary" label="Orb" onPress={() => router.push('/bubble')} />
        </Card>
      ) : null}

      {load.kind === 'loading' ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : null}

      {load.kind === 'error' ? (
        <Card style={styles.notice}>
          <Icon name="wifi-off" size={18} color={colors.danger} />
          <Text variant="callout" color="text" style={styles.flex}>
            {load.message}
          </Text>
          <Button size="sm" variant="secondary" label="Retry" onPress={() => void refresh()} />
        </Card>
      ) : null}

      {load.kind === 'ready' && load.requests.length ? (
        <View>
          <SectionHeader title="Waiting for you" />
          <Card style={styles.group}>
            {load.requests.map((r, i) => (
              <ListRow
                key={r.id}
                leading={<AgentAvatar name={r.agentName} />}
                divider={i > 0}
                title={`${r.agentName} · ${r.amountMon} MON on ${r.chainId === 143 ? 'Mainnet' : 'Testnet'}`}
                subtitle={`To ${r.to.startsWith('0x') ? shortAddress(r.to) : r.to}, for ${r.reason}`}
                onPress={() => router.push({ pathname: '/ask', params: { request: r.id, from: 'app' } })}
                accessibilityLabel={`Review ${r.agentName}'s request to pay ${r.amountMon} MON`}
              />
            ))}
          </Card>
        </View>
      ) : null}

      {load.kind === 'ready' ? (
        <View>
          <SectionHeader title="Connected" />
          <Card style={styles.group}>
            {load.agents.length === 0 ? (
              <Text variant="callout" color="textSecondary" style={styles.empty}>
                No agents yet.
              </Text>
            ) : (
              load.agents.map((a, i) => (
                <ListRow
                  key={a.id}
                  leading={<AgentAvatar name={a.name} />}
                  divider={i > 0}
                  title={a.name}
                  subtitle={`${trimMon(a.spentMon)} of ${a.dailyMon} MON in 24 h · up to ${a.perTxMon} per payment`}
                  trailing={
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Disconnect ${a.name}`}
                      onPress={() => confirmRevoke(a)}
                      style={({ pressed }) => [styles.revoke, pressed && styles.pressed]}
                    >
                      <Text variant="bodyStrong" color="danger">
                        Disconnect
                      </Text>
                    </Pressable>
                  }
                />
              ))
            )}
          </Card>
        </View>
      ) : null}

      <Button label="Connect an agent" icon="plus" onPress={() => setConnecting(true)} />

      <ConnectSheet
        visible={connecting}
        onClose={() => {
          setConnecting(false);
          void refresh();
        }}
      />
    </Screen>
  );
}

/** "0.200000" → "0.2". */
const trimMon = (v: string) => v.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');

/**
 * Limit fields are MON decimals: 0 < per payment <= daily <= 10.
 * @returns An error to show, or null.
 */
function limitsError(perTx: string, daily: string): string | null {
  const p = parseMon(perTx);
  const d = parseMon(daily);
  if (p === null || d === null || p <= 0n || d <= 0n) return 'Enter amounts like 0.5.';
  if (p > d) return 'Per payment cannot be more than per day.';
  if (d > HARD_MAX) return 'At most 10 MON per day.';
  return null;
}

/**
 * Connect flow: name and limits, then the key once with ready-to-paste setup.
 * @param props.visible Sheet open.
 * @param props.onClose Close and refresh.
 * @returns The sheet.
 */
function ConnectSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { address } = useWallet();
  const [client, setClient] = useState('claude');
  const [name, setName] = useState('Claude');
  const [perTx, setPerTx] = useState('0.5');
  const [daily, setDaily] = useState('2');
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const error = limitsError(perTx, daily);

  const close = () => {
    setKey(null);
    setFailure(null);
    onClose();
  };

  const create = async () => {
    if (!address || error || !name.trim()) return;
    setSaving(true);
    setFailure(null);
    try {
      const res = await connectAgent({ name: name.trim(), wallet: address, perTxMon: perTx.trim(), dailyMon: daily.trim() });
      await registerInbox().catch(() => undefined);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setKey(res.key);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "Couldn't connect. Try again.");
    } finally {
      setSaving(false);
    }
  };

  if (key) {
    const setup = connectSetup(client, key);
    return (
      <Sheet visible={visible} onClose={close} title={`Connect ${name.trim()}`}>
        <Text variant="callout" color="textSecondary">
          Do this on the computer where your agent runs. Copy it now: the key is shown only once.
        </Text>
        <CommandBlock label={setup.where} command={setup.text} />
        <Text variant="caption" color="textTertiary">
          Then ask your agent to check your Orb balance. Anyone with this key can ask you for payments, so keep it private.
        </Text>
        <Button label="Done" onPress={close} />
      </Sheet>
    );
  }

  return (
    <Sheet visible={visible} onClose={close} title="Connect an agent">
      <Text variant="overline" color="textTertiary">
        Agent
      </Text>
      <View style={styles.clients} accessibilityRole="radiogroup">
        {[...AGENT_BRANDS.filter((b) => b.id !== 'perplexity'), null].map((b) => {
          const id = b?.id ?? 'other';
          const selected = client === id;
          return (
            <Pressable
              key={id}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={b?.label ?? 'Other'}
              onPress={() => {
                setClient(id);
                setName(b?.label ?? '');
              }}
              style={({ pressed }) => [styles.client, selected && styles.clientSelected, pressed && styles.pressed]}
            >
              {b ? <BrandLogo brand={b} size={22} /> : <Icon name="plus" size={20} color={colors.textSecondary} />}
              <Text variant="caption" color={selected ? 'text' : 'textSecondary'} numberOfLines={1}>
                {b?.label.replace('GitHub ', '') ?? 'Other'}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Field label="Name" value={name} onChange={setName} placeholder="My agent" />
      <View style={styles.row}>
        <Field label="Per payment" value={perTx} onChange={setPerTx} unit="MON" numeric fill />
        <Field label="Per day" value={daily} onChange={setDaily} unit="MON" numeric fill />
      </View>
      <Text variant="caption" color={error ? 'danger' : 'textTertiary'} accessibilityLiveRegion="polite">
        {error ?? 'Your device limits still apply. Every payment needs your fingerprint.'}
      </Text>
      {failure ? (
        <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
          {failure}
        </Text>
      ) : null}
      <Button label="Create key" icon="key" loading={saving} disabled={!!error || !name.trim() || !address} onPress={() => void create()} />
    </Sheet>
  );
}

/**
 * Labelled input.
 * @param props.numeric MON amount keyboard.
 * @param props.unit Suffix shown inside the box.
 * @param props.fill Share a row's width with its neighbours (only inside a row; in a column it would collapse the field).
 * @returns The field.
 */
function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  unit?: string;
  numeric?: boolean;
  fill?: boolean;
}) {
  return (
    <View style={[styles.field, props.fill && styles.fill]}>
      <Text variant="overline" color="textTertiary">
        {props.label}
      </Text>
      <View style={styles.inputBox}>
        <TextInput
          value={props.value}
          onChangeText={(v) => props.onChange(props.numeric ? v.replace(',', '.') : v)}
          placeholder={props.placeholder}
          placeholderTextColor={colors.textTertiary}
          keyboardType={props.numeric ? 'decimal-pad' : 'default'}
          maxLength={props.numeric ? 8 : 40}
          accessibilityLabel={props.unit ? `${props.label} in ${props.unit}` : props.label}
          style={styles.input}
        />
        {props.unit ? (
          <Text variant="callout" color="textTertiary">
            {props.unit}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * A setup command with a copy button.
 * @param props.label Client name.
 * @param props.command Text to copy.
 * @returns The block.
 */
function CommandBlock({ label, command }: { label: string; command: string }) {
  const { copied, copy } = useCopy();
  return (
    <View style={styles.command}>
      <View style={styles.commandHead}>
        <Text variant="bodyStrong">{label}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copied ? `${label} command copied` : `Copy ${label} command`}
          onPress={() => void copy(command)}
          hitSlop={space.sm}
          style={({ pressed }) => [styles.copy, pressed && styles.pressed]}
        >
          <Icon name={copied ? 'check' : 'copy'} size={14} color={copied ? colors.success : colors.primaryInk} />
          <Text variant="captionStrong" color={copied ? 'success' : 'primaryInk'}>
            {copied ? 'Copied' : 'Copy'}
          </Text>
        </Pressable>
      </View>
      <Text variant="mono" color="textSecondary" selectable>
        {command}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  clients: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  client: {
    width: '23%',
    flexGrow: 1,
    alignItems: 'center',
    gap: space.xs,
    paddingVertical: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  clientSelected: { borderColor: colors.primary, borderWidth: 2 },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginLeft: -space.md },
  back: { width: HIT, height: HIT, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  pressed: { opacity: 0.6 },
  flex: { flex: 1, gap: space.xxs },
  notice: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  loading: { marginVertical: space.xl },
  group: { paddingVertical: 0 },
  empty: { paddingVertical: space.lg },
  revoke: { minHeight: HIT, justifyContent: 'center', paddingLeft: space.sm },
  row: { flexDirection: 'row', gap: space.md },
  field: { gap: space.xs },
  fill: { flex: 1 },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: HIT,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  input: { ...typeScale.body, flex: 1, color: colors.text, paddingVertical: space.sm },
  command: { gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
  commandHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  copy: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 32 },
});
