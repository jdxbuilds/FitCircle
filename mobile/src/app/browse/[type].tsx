import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { ErrorBox, H1, Loading, P, Pill, Row, Screen, Small } from '@/components/ui';
import { api } from '@/lib/api';
import { C, FORMAT, kes, prettyDate } from '@/lib/theme';
import type { ChallengeSummary } from '@/lib/types';
import { useLoad } from '@/lib/use-load';

/** Open instructor programmes or FitCircle Challenges that anyone can join before they start. */
export default function Browse() {
  const { type = 'fitcircle' } = useLocalSearchParams<{ type: 'instructor' | 'fitcircle' }>();
  const f = FORMAT[type];
  const { data, error, refreshing, refresh, reload } = useLoad(() => api<ChallengeSummary[]>(`/challenges/discover?type=${type}`), [type]);
  return (
    <Screen title={type === 'instructor' ? 'Instructor challenges' : 'FitCircle Challenges'} refreshing={refreshing} onRefresh={refresh}>
      <H1>{type === 'instructor' ? 'Train with a verified coach.' : 'Open challenges. Anyone can join.'}</H1>
      <P muted>{type === 'instructor' ? 'Every instructor is checked: certification, ID and a demo video.' : 'Run by FitCircle. One stake for everyone, the same rules as Peer Groups.'}</P>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data?.length === 0 && <Small>Nothing open right now. New ones are added every week.</Small>}
      {data?.map((c) => (
        <Pressable key={c.id} accessibilityRole="button" onPress={() => router.push(`/challenge/${c.id}`)}
          style={{ padding: 16, borderRadius: 20, borderWidth: 1.5, borderColor: C.line, gap: 8 }}>
          <Row>
            <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: f.colors[0], alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 20 }}>{type === 'instructor' ? '🏅' : '🏆'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '800', fontSize: 16, color: C.ink }}>{c.title}</Text>
              <Small>{type === 'instructor' ? `${c.instructorName} · ✓ Verified` : `Starts ${prettyDate(c.startDate)}`}</Small>
            </View>
          </Row>
          <Row gap={6} style={{ flexWrap: 'wrap' }}>
            <Pill label={`${c.durationDays / 7} weeks`} />
            <Pill label={`${c.sessionsPerWeek}× a week`} />
            {c.entryFee ? <Pill tone="gold" label={kes(c.entryFee)} /> : c.stake ? <Pill tone="gold" label={`${kes(c.stake)} stake`} /> : <Pill label="No stake" />}
            <Small>{c.members} joined</Small>
          </Row>
        </Pressable>
      ))}
    </Screen>
  );
}
