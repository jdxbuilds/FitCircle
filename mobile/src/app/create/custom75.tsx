import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { StakePicker } from '@/components/stake-picker';
import { Btn, Card, Chips, ErrorBox, Field, H1, Note, P, Screen, Small } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { C, FORMAT, kes, nairobiDate, nextMonday, prettyDate } from '@/lib/theme';

const COLORS = FORMAT.custom75.colors;
const PRESETS = [
  { t: '45-min workout', hard: true, soft: true }, { t: 'Second workout, outdoors', hard: true, soft: false },
  { t: 'Drink 3 litres of water', hard: true, soft: true }, { t: 'Read 10 pages', hard: true, soft: true },
  { t: 'Progress photo', hard: true, soft: false }, { t: 'No alcohol', hard: false, soft: false },
  { t: '10-min stretch', hard: false, soft: false }, { t: '8,000 steps', hard: false, soft: false },
];

export default function Build75() {
  const { me } = useAuth();
  const [mode, setMode] = useState<'soft' | 'hard'>('soft');
  const [tasks, setTasks] = useState<string[]>(PRESETS.filter((p) => p.soft).map((p) => p.t));
  const [custom, setCustom] = useState('');
  const monday = nextMonday();
  const [startDate, setStartDate] = useState(monday);
  const [stake, setStake] = useState<number | null>(me?.canStake ? 1000 : null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const pickMode = (m: 'soft' | 'hard') => { setMode(m); setTasks(PRESETS.filter((p) => (m === 'hard' ? p.hard : p.soft)).map((p) => p.t)); };
  const toggle = (t: string) => setTasks((T) => (T.includes(t) ? T.filter((x) => x !== t) : [...T, t]));
  const all = [...PRESETS.map((p) => p.t), ...tasks.filter((t) => !PRESETS.some((p) => p.t === t))];

  const create = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api<{ id: number }>('/challenges', {
        method: 'POST',
        body: { type: 'custom75', title: `My 75 ${mode === 'hard' ? 'Hard' : 'Soft'}`, startDate, mode, tasks, stake },
      });
      router.replace(stake ? `/challenge/${r.id}/pay` : `/challenge/${r.id}`);
    } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };

  return (
    <Screen title="Build your 75" footer={<Btn label={`${tasks.length} daily tasks · ${stake ? `Lock ${kes(stake)}` : 'Start without a stake'}`} colors={COLORS} busy={busy} disabled={tasks.length < 2} onPress={create} />}>
      <H1>75 days. Your rules.</H1>
      <P muted>Every task, every day, with proof. Miss 3 days and you are out.</P>
      <Chips color={COLORS[0]} value={mode} onChange={pickMode} options={[{ value: 'soft', label: '75 Soft' }, { value: 'hard', label: '75 Hard' }]} />
      <Note icon="✨">{mode === 'hard' ? 'Hard: more tasks every day.' : 'Soft: fewer tasks, same rule.'} A day counts only when every task is ticked and proof is uploaded.</Note>
      <View style={{ gap: 8 }}>
        {all.map((t) => {
          const on = tasks.includes(t);
          return (
            <Pressable key={t} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => toggle(t)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, backgroundColor: C.surface2 }}>
              <View style={{ width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: on ? COLORS[0] : C.line, backgroundColor: on ? COLORS[0] : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                {on && <Text style={{ color: '#fff', fontWeight: '900' }}>✓</Text>}
              </View>
              <Text style={{ fontSize: 15, color: C.ink, flex: 1 }}>{t}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}><Field label="Add your own task" value={custom} onChangeText={setCustom} placeholder="Cold shower" maxLength={120} /></View>
        <Btn small label="Add" variant="dark" disabled={custom.trim().length < 2} onPress={() => { setTasks((T) => [...T, custom.trim()]); setCustom(''); }} />
      </View>
      <View style={{ gap: 8 }}>
        <Small bold>Starts</Small>
        <Chips color={COLORS[0]} value={startDate} onChange={setStartDate} options={[{ value: monday, label: `Mon ${prettyDate(monday)}` }, { value: nairobiDate(1), label: 'Tomorrow' }]} />
      </View>
      <View style={{ gap: 8 }}>
        <Small bold>Stake</Small>
        <StakePicker value={stake} onChange={setStake} canStake={!!me?.canStake} color={COLORS[0]} />
      </View>
      {stake ? <Card><Small>Finish the 75 days and get your full {kes(stake)} back. Miss 3 days and you're out: FitCircle keeps 100% of your stake.</Small></Card> : null}
      {err && <ErrorBox message={err} />}
    </Screen>
  );
}
