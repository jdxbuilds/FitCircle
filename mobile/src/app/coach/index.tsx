import { Redirect, router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { Btn, Card, ErrorBox, Eyebrow, H1, Hero, Loading, Pill, Row, Screen, Small } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { C, FORMAT, kes, monthName, prettyDate } from '@/lib/theme';
import type { Dashboard } from '@/lib/types';
import { useLoad } from '@/lib/use-load';

const COLORS = FORMAT.instructor.colors;

/** Instructor dashboard: today at a glance, programmes, flags to review and earnings. */
export default function CoachDashboard() {
  const { me, signOut } = useAuth();
  const { data, error, refreshing, refresh, reload } = useLoad(() => api<Dashboard>('/instructor/dashboard'));
  if (!me) return <Redirect href="/welcome" />;
  if (!me.instructor) return <Redirect href="/coach/apply" />;

  const verified = data?.profile.verification === 'verified';
  const live = data?.programmes.filter((p) => p.status === 'active' || p.status === 'enrolling') ?? [];
  const flags = live.reduce((n, p) => n + p.openFlags, 0);
  const maxMonth = Math.max(1, ...(data?.earnings.monthly.map((m) => m.amount) ?? [1]));

  return (
    <Screen title="Instructor" back={false} refreshing={refreshing} onRefresh={refresh}
      right={<Pressable accessibilityRole="button" onPress={() => router.push('/home')}><Small bold>Member app</Small></Pressable>}>
      <View><Small>Habari, {data?.profile.displayName ?? me.instructor.displayName}</Small><H1>Today</H1></View>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data && !verified && (
        <Card tint="#FFF2DD" style={{ gap: 8 }}>
          <Small bold color="#8A5F00">Verification {data.profile.verification === 'rejected' ? 'was not approved' : 'in progress'}</Small>
          <Small>Upload your certification, ID and a 60-second demo video. You can host once all three are approved.</Small>
          <Btn small label="Open verification" variant="dark" onPress={() => router.push('/coach/apply')} />
        </Card>
      )}
      {data && (
        <Hero colors={COLORS}>
          <Eyebrow color="rgba(255,255,255,0.9)">Your 65% share</Eyebrow>
          <Text style={{ color: '#fff', fontSize: 38, fontWeight: '800', letterSpacing: -1 }}>{kes(data.earnings.earned)}</Text>
          <Text style={{ color: '#fff' }}>earned so far · {kes(data.earnings.pending)} more from running programmes</Text>
          {flags > 0 && <Text style={{ color: '#fff', fontWeight: '800', marginTop: 8 }}>⚑ {flags} flagged session{flags === 1 ? '' : 's'} to review</Text>}
        </Hero>
      )}
      {data && verified && <Btn label="＋  New programme" colors={COLORS} onPress={() => router.push('/coach/new')} />}
      {data && (
        <>
          <Small bold>PROGRAMMES</Small>
          {data.programmes.length === 0 && <Small>No programmes yet.</Small>}
          {data.programmes.map((p) => (
            <Card key={p.challengeId} style={{ gap: 8 }}>
              <Pressable onPress={() => router.push(`/challenge/${p.challengeId}`)} style={{ gap: 4 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text style={{ flex: 1, fontWeight: '800', fontSize: 16, color: C.ink }}>{p.title}</Text>
                  <Pill label={p.status === 'active' ? 'Active' : p.status === 'enrolling' ? 'Enrolling' : p.status === 'settled' ? 'Finished' : p.status} tone={p.status === 'active' ? 'good' : p.status === 'enrolling' ? 'warn' : 'muted'} />
                </Row>
                <Small>{prettyDate(p.startDate)} – {prettyDate(p.endDate)} · {p.participants} people · {kes(p.feesCollected)} in fees · your share {kes(p.yourShare)}</Small>
                {p.status === 'active' && <Small bold color={p.atRisk ? C.bad : C.good}>{p.loggedToday} logged today · {p.atRisk} at risk</Small>}
              </Pressable>
              {(p.status === 'active' || p.status === 'enrolling') && (
                <Row gap={8}>
                  <View style={{ flex: 1 }}><Btn small label="Post today's plan" variant="dark" onPress={() => router.push({ pathname: '/coach/plan', params: { id: p.challengeId } })} /></View>
                  {p.openFlags > 0 && <View style={{ flex: 1 }}><Btn small label={`Review ${p.openFlags} flag${p.openFlags === 1 ? '' : 's'}`} variant="danger" onPress={() => router.push({ pathname: '/coach/flags', params: { id: p.challengeId } })} /></View>}
                </Row>
              )}
            </Card>
          ))}
          {data.earnings.monthly.length > 0 && (
            <Card style={{ gap: 10 }}>
              <Small bold>Monthly earnings</Small>
              <Row gap={8} style={{ alignItems: 'flex-end', height: 120 }}>
                {[...data.earnings.monthly].reverse().map((m) => (
                  <View key={m.month} style={{ flex: 1, alignItems: 'center', gap: 4 }} accessible accessibilityLabel={`${monthName(m.month)}: ${kes(m.amount)}`}>
                    <View style={{ width: '70%', height: Math.max(4, (m.amount / maxMonth) * 90), backgroundColor: COLORS[0], borderRadius: 6 }} />
                    <Text style={{ fontSize: 11, color: C.muted }}>{monthName(m.month).slice(0, 3)}</Text>
                  </View>
                ))}
              </Row>
            </Card>
          )}
          {data.payouts.length > 0 && (
            <Card style={{ gap: 6 }}>
              <Small bold>Payouts to {data.profile.payoutPhone}</Small>
              {data.payouts.map((p) => (
                <Row key={p.id} style={{ justifyContent: 'space-between' }}>
                  <Small>{p.title} · {prettyDate(p.scheduledFor)}</Small>
                  <Small bold color={p.status === 'sent' ? C.good : C.muted}>{kes(p.amount)} · {p.status}</Small>
                </Row>
              ))}
            </Card>
          )}
        </>
      )}
      <Btn label="Sign out" variant="ghost" onPress={async () => { await signOut(); router.replace('/welcome'); }} />
    </Screen>
  );
}
