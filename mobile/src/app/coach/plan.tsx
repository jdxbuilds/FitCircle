import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Btn, Chips, ErrorBox, Field, H1, Note, Screen, Small } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { FORMAT } from '@/lib/theme';

const COLORS = FORMAT.instructor.colors;
const TYPES = [
  { value: 'run', label: 'Run' }, { value: 'strength', label: 'Strength' }, { value: 'hiit', label: 'HIIT' },
  { value: 'mobility', label: 'Mobility' }, { value: 'rest', label: 'Rest day' },
];

/** Post today's plan. Everyone in the programme gets it as a notification. */
export default function PostPlan() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [title, setTitle] = useState('');
  const [type, setType] = useState('run');
  const [instructions, setInstructions] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const send = async () => {
    setBusy(true); setErr(null);
    try {
      await api(`/challenges/${id}/plans`, { method: 'POST', body: { title: title.trim(), sessionType: type, instructions: instructions.trim() || undefined } });
      router.back();
    } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };

  return (
    <Screen title="Today's plan" footer={<Btn label="Send to the group" colors={COLORS} busy={busy} disabled={title.trim().length < 2} onPress={send} />}>
      <H1>Morning message to the group</H1>
      <Field label="Session" value={title} onChangeText={setTitle} placeholder="Tempo run · 5 km" maxLength={120} />
      <View style={{ gap: 8 }}>
        <Small bold>Type</Small>
        <Chips color={COLORS[0]} value={type} onChange={setType} options={TYPES} />
      </View>
      <Field label="Instructions" value={instructions} onChangeText={setInstructions} multiline style={{ height: 120, paddingTop: 12 }}
        placeholder="Easy pace, you should be able to talk. Finish with 4 × 100 m strides. Log a photo at the finish." />
      {err && <ErrorBox message={err} />}
      <Note icon="🔔">Posting again today replaces the earlier plan.</Note>
    </Screen>
  );
}
