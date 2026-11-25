import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { StakePicker } from '@/components/stake-picker';
import { Btn, Card, Chips, ErrorBox, Field, H1, Note, Screen, Small } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { FORMAT, FORFEIT_GROUP, MAX_MISSED, kes, nairobiDate, nextMonday, prettyDate } from '@/lib/theme';

const COLORS = FORMAT.peer.colors;

export default function NewPeerGroup() {
  const { me } = useAuth();
  const [title, setTitle] = useState('');
  const [spw, setSpw] = useState(3);
  const [weeks, setWeeks] = useState(4);
  const monday = nextMonday();
  const starts = [{ value: monday, label: `Mon ${prettyDate(monday)}` }, { value: nairobiDate(1), label: 'Tomorrow' }];
  const [startDate, setStartDate] = useState(monday);
  const [stake, setStake] = useState<number | null>(me?.canStake ? 500 : null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const create = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api<{ id: number }>('/challenges', { method: 'POST', body: { type: 'peer', title: title.trim(), startDate, weeks, sessionsPerWeek: spw, stake } });
      router.replace(stake ? `/challenge/${r.id}/pay` : `/challenge/${r.id}`);
    } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };

  return (
    <Screen title="New peer group" footer={<Btn label={stake ? `Create and lock ${kes(stake)}` : 'Create the group'} colors={COLORS} busy={busy} disabled={title.trim().length < 2} onPress={create} />}>
      <H1>Your circle, your rules</H1>
      <Field label="Group name" value={title} onChangeText={setTitle} placeholder="Ofisi Movers" maxLength={160} />
      <View style={{ gap: 8 }}>
        <Small bold>Sessions per week</Small>
        <Chips color={COLORS[0]} value={spw} onChange={setSpw} options={[2, 3, 4, 5, 6, 7].map((n) => ({ value: n, label: `${n}×` }))} />
        <Note icon="🛡">FitCircle minimum is 2 sessions a week.</Note>
      </View>
      <View style={{ gap: 8 }}>
        <Small bold>Length</Small>
        <Chips color={COLORS[0]} value={weeks} onChange={setWeeks} options={[2, 4, 6, 8, 12].map((n) => ({ value: n, label: `${n} weeks` }))} />
      </View>
      <View style={{ gap: 8 }}>
        <Small bold>Starts</Small>
        <Chips color={COLORS[0]} value={startDate} onChange={setStartDate} options={starts} />
      </View>
      <View style={{ gap: 8 }}>
        <Small bold>Stake (the same for everyone)</Small>
        <StakePicker value={stake} onChange={setStake} canStake={!!me?.canStake} color={COLORS[0]} />
      </View>
      {stake ? (
        <Card style={{ gap: 6 }}>
          <Small bold color="#12A150">Show up</Small>
          <Small>Get your full {kes(stake)} back plus a share of {100 - FORFEIT_GROUP}% of every forfeited stake.</Small>
          <Small bold color="#D93A3A">Miss {MAX_MISSED} in a week{spw === 2 ? ' (or both)' : ''}</Small>
          <Small>You're out. {FORFEIT_GROUP}% of your stake goes to FitCircle, {100 - FORFEIT_GROUP}% to the finishers.</Small>
        </Card>
      ) : null}
      {err && <ErrorBox message={err} />}
      <Note icon="🔒">Stakes lock when the challenge starts and cannot be withdrawn early. You'll get an invite code to share.</Note>
    </Screen>
  );
}
