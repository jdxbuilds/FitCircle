import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Btn, Card, ErrorBox, Eyebrow, H1, LinkBtn, Screen, Small } from '@/components/ui';
import {
  COACH_KEY_POINTS, COACH_SEGMENT, COACH_TERMS, COACH_TERMS_2, MEMBER_KEY_POINTS, MEMBER_SEGMENTS, MEMBER_TERMS, MEMBER_TERMS_2,
  TERMS_VERSION, type Section, type Segment,
} from '@/content/terms';
import { api, errorText } from '@/lib/api';
import { instructorTerms, signupDraft, useAuth } from '@/lib/auth';
import { C, FORMAT } from '@/lib/theme';

const SEG_COLOR: Record<string, string> = { peer: FORMAT.peer.colors[0], coach: FORMAT.instructor.colors[0], d75: FORMAT.custom75.colors[0], fc: FORMAT.fitcircle.colors[0] };

function Block([h, items]: Section) {
  return (
    <View key={h} style={{ gap: 6 }}>
      <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }} accessibilityRole="header">{h}</Text>
      {items.map((t, i) => <Text key={i} style={{ fontSize: 14, lineHeight: 20, color: C.ink }}>{`${h.split('.')[0]}.${i + 1}  ${t}`}</Text>)}
    </View>
  );
}

function Seg([k, title, rows]: Segment) {
  const c = SEG_COLOR[k] ?? C.ink;
  return (
    <View key={k} style={{ borderRadius: 18, padding: 14, gap: 6, borderWidth: 1.5, borderColor: c + '55', backgroundColor: c + '10' }}>
      <View style={{ alignSelf: 'flex-start', backgroundColor: c, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 }}>
        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 0.8 }}>{title.toUpperCase()}</Text>
      </View>
      {rows.map(([dt, dd]) => (
        <View key={dt}><Text style={{ fontSize: 12.5, fontWeight: '700', color: C.muted }}>{dt}</Text><Text style={{ fontSize: 14, lineHeight: 20, color: C.ink }}>{dd}</Text></View>
      ))}
    </View>
  );
}

/** Terms shown after sign-up. "I understand and accept" unlocks only once the reader reaches the end. */
export default function Terms() {
  const { kind = 'member', then, view } = useLocalSearchParams<{ kind?: 'member' | 'instructor'; then?: string; view?: string }>();
  const coach = kind === 'instructor';
  const colors = coach ? FORMAT.instructor.colors : FORMAT.peer.colors;
  const { signIn } = useAuth();
  const [read, setRead] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const accept = async () => {
    if (coach) {
      instructorTerms.accepted = true;
      router.replace('/coach/apply');
      return;
    }
    setBusy(true); setErr(null);
    try {
      const d = signupDraft;
      const r = await api<{ token: string }>('/auth/signup', {
        method: 'POST',
        body: { signupToken: d.signupToken, firstName: d.firstName, dateOfBirth: d.dateOfBirth, goals: d.goals, acceptTerms: true },
      });
      await signIn(r.token);
      if (d.as === 'coach') router.replace({ pathname: '/terms', params: { kind: 'instructor' } });
      else if (then === 'join') router.replace('/join');
      else router.replace('/format');
    } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };

  return (
    <Screen
      title={coach ? 'Instructor terms' : 'Member terms'}
      onScrollEnd={() => setRead(true)}
      back={!!view}
      footer={view ? undefined : (
        <View style={{ gap: 6 }}>
          <Small>{read ? 'Thanks for reading.' : 'Scroll to the end to accept.'}</Small>
          {err && <ErrorBox message={err} />}
          <Btn label="✓  I understand and accept" colors={colors} disabled={!read} busy={busy} onPress={accept} />
          <LinkBtn label="Decline" onPress={() => router.replace('/start')} />
        </View>
      )}
    >
      <Eyebrow color={colors[0]}>{coach ? 'FitCircle instructors' : 'FitCircle members'}</Eyebrow>
      <H1>Terms and conditions</H1>
      <Small>{TERMS_VERSION}</Small>
      <Card tint="#FFF2DD"><Text style={{ color: '#8A5F00', fontWeight: '700' }}>Draft for legal review. Not yet final.</Text></Card>
      <Card style={{ gap: 8 }}>
        <Text style={{ fontWeight: '800', color: C.ink }}>The key points</Text>
        {(coach ? COACH_KEY_POINTS : MEMBER_KEY_POINTS).map((k) => <Text key={k} style={{ fontSize: 14, color: C.ink }}>•  {k}</Text>)}
      </Card>
      {coach ? (
        <>
          {COACH_TERMS.map(Block)}
          <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }}>4. Your programmes and earnings</Text>
          {Seg(COACH_SEGMENT)}
          {COACH_TERMS_2.map(Block)}
        </>
      ) : (
        <>
          {MEMBER_TERMS.map(Block)}
          <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }}>4. Rules for each challenge</Text>
          <Small>Each format has its own rules. Read the ones for the challenges you join.</Small>
          {MEMBER_SEGMENTS.map(Seg)}
          {MEMBER_TERMS_2.map(Block)}
        </>
      )}
      <Small>Questions? Contact FitCircle through Help in the app before you accept.</Small>
    </Screen>
  );
}
