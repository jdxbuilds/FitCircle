import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { JackpotCard } from '@/components/jackpot-card';
import { TabBar } from '@/components/tab-bar';
import { Btn, ErrorBox, H1, Loading, Pill, Row, Screen, Small } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { C, FORMAT, kes, prettyDate } from '@/lib/theme';
import type { ChallengeSummary, Jackpot, Notice } from '@/lib/types';
import { useLoad } from '@/lib/use-load';

const STATUS: Record<string, { label: string; tone: 'good' | 'warn' | 'muted' | 'bad' | 'gold' }> = {
  active: { label: 'Running', tone: 'good' },
  enrolling: { label: 'Starts soon', tone: 'warn' },
  settled: { label: 'Finished', tone: 'muted' },
  cancelled: { label: 'Cancelled', tone: 'bad' },
  draft: { label: 'Draft', tone: 'muted' },
};

function ChallengeCard({ c }: { c: ChallengeSummary }) {
  const f = FORMAT[c.type];
  const st = c.myStatus === 'forfeited' ? { label: 'Out', tone: 'bad' as const } : c.myStatus === 'completed' ? { label: 'Completed', tone: 'good' as const } : STATUS[c.status];
  const money = c.entryFee ? kes(c.entryFee) + ' entry' : c.stake ? kes(c.stake) + ' stake' : 'No stake';
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push(`/challenge/${c.id}`)} style={{ borderRadius: 20, overflow: 'hidden', backgroundColor: C.surface2 }}>
      <LinearGradient colors={f.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 6 }} />
      <View style={{ padding: 16, gap: 6 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Small bold color={f.colors[0]}>{f.name.toUpperCase()}</Small>
          <Pill label={st.label} tone={st.tone} />
        </Row>
        <Text style={{ fontSize: 18, fontWeight: '800', color: C.ink }}>{c.title}</Text>
        <Small>{c.status === 'enrolling' ? `Starts ${prettyDate(c.startDate)}` : `${prettyDate(c.startDate)} – ${prettyDate(c.endDate)}`} · {c.members} in · {money}</Small>
        {c.status === 'enrolling' && c.myAmountPaid == null && (c.stake || c.entryFee) && c.myStatus === 'active' ? <Small bold color={C.bad}>Pay to lock your place →</Small> : null}
      </View>
    </Pressable>
  );
}

export default function Home() {
  const { me } = useAuth();
  const { data, error, refreshing, refresh, reload } = useLoad(async () => {
    const [mine, jackpot, unread] = await Promise.all([
      api<ChallengeSummary[]>('/challenges/mine'),
      api<Jackpot>('/jackpot').catch(() => null),
      api<Notice[]>('/notifications?unread=1').catch(() => []),
    ]);
    return { mine, jackpot, unread: unread.length };
  });

  const running = data?.mine.filter((c) => c.status === 'active' || c.status === 'enrolling') ?? [];
  const done = data?.mine.filter((c) => c.status === 'settled' || c.status === 'cancelled') ?? [];

  return (
    <Screen tabBar={<TabBar unread={data?.unread} />} refreshing={refreshing} onRefresh={refresh}>
      <View>
        <Small>Habari, {me?.firstName}</Small>
        <H1>Your circles</H1>
      </View>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data && <JackpotCard jackpot={data.jackpot} />}
      {running.map((c) => <ChallengeCard key={c.id} c={c} />)}
      {data && running.length === 0 && (
        <View style={{ gap: 10, paddingVertical: 8 }}>
          <Text style={{ fontSize: 16, color: C.muted }}>You're not in a challenge yet. Start one with friends or join an open one.</Text>
          <Btn label="Start or join a challenge  →" colors={FORMAT.peer.colors} onPress={() => router.push('/discover')} />
        </View>
      )}
      {done.length > 0 && <Small bold>FINISHED</Small>}
      {done.map((c) => <ChallengeCard key={c.id} c={c} />)}
    </Screen>
  );
}
