import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Btn, Chips, Field, H1, Note, Screen, Small } from '@/components/ui';
import { signupDraft } from '@/lib/auth';
import { FORMAT } from '@/lib/theme';

const GOALS = [
  { value: 'lose_weight', label: 'Lose weight' },
  { value: 'build_strength', label: 'Build strength' },
  { value: 'run_10k', label: 'Run a 10K' },
  { value: 'consistency', label: 'Consistency' },
  { value: 'mental_toughness', label: 'Mental toughness' },
  { value: 'feel_better', label: 'Feel better' },
];

const ageOf = (dob: string) => {
  const d = new Date(dob + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  if (now.getUTCMonth() < d.getUTCMonth() || (now.getUTCMonth() === d.getUTCMonth() && now.getUTCDate() < d.getUTCDate())) age--;
  return age;
};

export default function Signup() {
  const { then } = useLocalSearchParams<{ then?: string }>();
  const coach = signupDraft.as === 'coach';
  const colors = coach ? FORMAT.instructor.colors : FORMAT.peer.colors;
  const [name, setName] = useState(signupDraft.firstName);
  const [dob, setDob] = useState(signupDraft.dateOfBirth);
  const [goals, setGoals] = useState<string[]>(signupDraft.goals);
  const [err, setErr] = useState<string | null>(null);
  const age = /^\d{4}-\d{2}-\d{2}$/.test(dob) ? ageOf(dob) : null;

  const next = () => {
    if (!name.trim()) return setErr('Add your first name');
    if (age === null) return setErr('Enter your date of birth as YYYY-MM-DD');
    if (age < 16) return setErr('FitCircle is for ages 16 and up.');
    if (coach && age < 18) return setErr('Instructors must be 18 or older.');
    Object.assign(signupDraft, { firstName: name.trim(), dateOfBirth: dob, goals });
    router.push({ pathname: '/terms', params: { kind: 'member', ...(then ? { then } : {}) } });
  };

  return (
    <Screen title={coach ? 'Your instructor profile' : 'Your profile'} footer={<Btn label="Continue  →" colors={colors} onPress={next} />}>
      <H1>Tell us about you</H1>
      <Field label="First name" value={name} onChangeText={(v) => { setName(v); setErr(null); }} autoComplete="given-name" />
      <Field label="Date of birth (YYYY-MM-DD)" value={dob} onChangeText={(v) => { setDob(v); setErr(null); }} placeholder="2000-01-31" keyboardType="numbers-and-punctuation" maxLength={10} error={err} />
      {!coach && age !== null && age >= 16 && age < 18 && <Note icon="🛡">You can join any challenge. Staked challenges open when you turn 18.</Note>}
      {!coach && (
        <View style={{ gap: 8 }}>
          <Small bold>What are you working towards?</Small>
          <Chips multi options={GOALS} value={goals} color={colors[0]} onChange={(g) => setGoals((G) => (G.includes(g) ? G.filter((x) => x !== g) : [...G, g]))} />
        </View>
      )}
      {coach && <Note icon="🛡">Next: the member and instructor terms, then we verify your certification, ID and a short demo video before you can host.</Note>}
    </Screen>
  );
}
