import { router } from 'expo-router';
import { Text } from 'react-native';
import { TabBar } from '@/components/tab-bar';
import { Avatar, Btn, Card, H1, LinkBtn, Pill, Row, Screen, Small } from '@/components/ui';
import { TERMS_VERSION } from '@/content/terms';
import { API_URL } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { C, FORMAT } from '@/lib/theme';

const GOAL: Record<string, string> = {
  lose_weight: 'Lose weight', build_strength: 'Build strength', run_10k: 'Run a 10K', consistency: 'Consistency', mental_toughness: 'Mental toughness', feel_better: 'Feel better',
};

export default function Profile() {
  const { me, signOut } = useAuth();
  if (!me) return null;
  return (
    <Screen tabBar={<TabBar />}>
      <Row gap={14}>
        <Avatar name={me.firstName} size={60} />
        <Text style={{ flex: 1, fontSize: 24, fontWeight: '800', color: C.ink }}>{me.firstName} {me.lastName ?? ''}</Text>
      </Row>
      <Card style={{ gap: 6 }}>
        <Small>Phone (M-Pesa payouts)</Small>
        <Text style={{ fontWeight: '800', color: C.ink }}>{me.phone}</Text>
        <Small>{me.canStake ? 'You can join staked challenges.' : 'Staked challenges open when you turn 18.'}</Small>
      </Card>
      {me.goals.length > 0 && (
        <Card style={{ gap: 8 }}>
          <Small>Goals</Small>
          <Row gap={6} style={{ flexWrap: 'wrap' }}>{me.goals.map((g) => <Pill key={g} label={GOAL[g] ?? g} />)}</Row>
        </Card>
      )}
      {me.instructor ? (
        <Btn label="Instructor dashboard  →" colors={FORMAT.instructor.colors} onPress={() => router.push('/coach')} />
      ) : (
        <Btn label="I'm a fitness trainer. Host a challenge  →" variant="ghost" onPress={() => router.push({ pathname: '/terms', params: { kind: 'instructor' } })} />
      )}
      <Card style={{ gap: 4 }}>
        <Small>Member terms accepted: {me.termsVersion ?? '—'} (current: {TERMS_VERSION})</Small>
        <LinkBtn label="Read the member terms" onPress={() => router.push({ pathname: '/terms', params: { kind: 'member', view: '1' } })} />
      </Card>
      <Btn label="Sign out" variant="ghost" onPress={async () => { await signOut(); router.replace('/welcome'); }} />
      <Small>Help: contact FitCircle through Help in the app. Server: {API_URL}</Small>
    </Screen>
  );
}
