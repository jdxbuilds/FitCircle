import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Btn, Card, Chips, ErrorBox, Field, H1, Note, Screen, Small } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { FORMAT, kes, nairobiDate, nextMonday, prettyDate } from '@/lib/theme';

const COLORS = FORMAT.instructor.colors;

/** Launch a paid programme. Members pay the entry fee; you keep 65% of finishers' fees and 40% of removed members'. */
export default function NewProgramme() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [weeks, setWeeks] = useState(4);
  const [spw, setSpw] = useState(3);
  const [fee, setFee] = useState('1500');
  const [cap, setCap] = useState('40');
  const monday = nextMonday();
  const [startDate, setStartDate] = useState(monday);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const feeN = Math.round(Number(fee) || 0);
  const capN = Math.round(Number(cap) || 0);

  const publish = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api<{ id: number }>('/challenges', {
        method: 'POST',
        body: { type: 'instructor', title: title.trim(), description: description.trim() || undefined, startDate, weeks, sessionsPerWeek: spw, entryFee: feeN, capacity: capN || undefined },
      });
      router.replace(`/challenge/${r.id}`);
    } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };

  return (
    <Screen title="New programme" footer={<Btn label="Publish programme" colors={COLORS} busy={busy} disabled={title.trim().length < 2 || feeN < 1} onPress={publish} />}>
      <H1>Launch the next cohort</H1>
      <Field label="Programme name" value={title} onChangeText={setTitle} placeholder="Hill Power 5K" maxLength={160} />
      <Field label="What members get" value={description} onChangeText={setDescription} placeholder="Daily plan, a voice note each morning, group chat." multiline style={{ height: 90, paddingTop: 12 }} />
      <View style={{ gap: 8 }}>
        <Small bold>Length</Small>
        <Chips color={COLORS[0]} value={weeks} onChange={setWeeks} options={[1, 2, 3, 4, 6, 8, 12].map((n) => ({ value: n, label: `${n} wk` }))} />
      </View>
      <View style={{ gap: 8 }}>
        <Small bold>Sessions per week</Small>
        <Chips color={COLORS[0]} value={spw} onChange={setSpw} options={[2, 3, 4, 5, 6].map((n) => ({ value: n, label: `${n}×` }))} />
      </View>
      <View style={{ gap: 8 }}>
        <Small bold>Starts</Small>
        <Chips color={COLORS[0]} value={startDate} onChange={setStartDate} options={[{ value: monday, label: `Mon ${prettyDate(monday)}` }, { value: nairobiDate(14), label: prettyDate(nairobiDate(14)) }]} />
      </View>
      <Field label="Entry fee (KES)" value={fee} onChangeText={(v) => setFee(v.replace(/\D/g, ''))} keyboardType="number-pad" />
      <Field label="Places" value={cap} onChangeText={(v) => setCap(v.replace(/\D/g, ''))} keyboardType="number-pad" />
      {feeN > 0 && capN > 0 && <Card><Small>If all {capN} places fill and everyone finishes: {kes(feeN * capN)} in fees, your 65% is {kes(feeN * capN * 0.65)}.</Small></Card>}
      {err && <ErrorBox message={err} />}
      <Note icon="🔒">Dates, target and fee are locked once the programme starts.</Note>
    </Screen>
  );
}
