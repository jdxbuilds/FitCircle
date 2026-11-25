import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Share, Text, View } from 'react-native';
import { Confetti } from '@/components/confetti';
import { TabBar } from '@/components/tab-bar';
import { Avatar, Btn, Card, ErrorBox, H1, Loading, P, Row, Screen, Small } from '@/components/ui';
import { api } from '@/lib/api';
import { C, monthName, prettyDate } from '@/lib/theme';
import type { Jackpot } from '@/lib/types';
import { useLoad } from '@/lib/use-load';

/**
 * One sponsored jackpot a month for all of FitCircle. The top performer across every challenge that
 * calendar month wins (most sessions, then longest streak, then a recorded draw). Resets on the 1st.
 */
export default function JackpotScreen() {
  const { data, error, refreshing, refresh, reload } = useLoad(() => api<Jackpot>('/jackpot'));
  const [reveal, setReveal] = useState(false);
  const [burst, setBurst] = useState(0);
  const last = data?.pastWinners[0];
  const open = () => { setReveal(true); setBurst((b) => b + 1); };

  return (
    <View style={{ flex: 1 }}>
      <Screen tabBar={<TabBar />} refreshing={refreshing} onRefresh={refresh}>
        <H1>Monthly jackpot</H1>
        {error && <ErrorBox message={error} onRetry={reload} />}
        {!data && !error && <Loading />}
        {data && (data.current ? (
          <LinearGradient colors={['#2A1F00', '#120E22']} style={{ borderRadius: 24, padding: 20, gap: 6, borderWidth: 1, borderColor: '#F5A80066' }}>
            <Text style={{ color: C.gold, fontWeight: '800', fontSize: 12, letterSpacing: 1.2 }}>{monthName(data.current.month).toUpperCase()} JACKPOT · RESETS {prettyDate(data.current.resetsOn).toUpperCase()}</Text>
            <Text style={{ color: '#fff', fontSize: 24, fontWeight: '800' }}>{data.current.prize}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.75)' }}>Paid for by {data.current.sponsor}, never from members' stakes. One winner: the top performer on FitCircle this month.</Text>
            {data.me && <Text style={{ color: C.gold, fontWeight: '800', fontSize: 16, marginTop: 6 }}>You're #{data.me.rank} with {data.me.sessions} sessions</Text>}
          </LinearGradient>
        ) : <Card><P muted>No jackpot is running this month. Keep logging: the next sponsor's prize starts on the 1st.</P></Card>)}
        {last && <Btn label={`👑  Reveal ${monthName(last.month)}'s winner`} variant="gold" onPress={open} />}
        {data && (
          <Card style={{ gap: 8 }}>
            <Text style={{ fontWeight: '800', fontSize: 16, color: C.ink }}>This month's ranking</Text>
            <Small>Most sessions across all your challenges. Ties: longest streak, then a recorded draw.</Small>
            {data.leaders.length === 0 && <Small>Nobody has logged this month yet. Be first.</Small>}
            {data.leaders.map((l) => (
              <Row key={`${l.rank}-${l.firstName}`} style={{ padding: 8, borderRadius: 12, backgroundColor: l.isMe ? '#FFF6DE' : 'transparent' }}>
                <Text style={{ width: 24, fontWeight: '800', color: l.rank === 1 ? '#C08400' : C.muted }}>{l.rank}</Text>
                <Avatar name={l.firstName} size={30} />
                <Text style={{ flex: 1, fontWeight: '700', color: C.ink }}>{l.firstName}{l.isMe ? ' (you)' : ''}</Text>
                <Small>{l.sessions} sessions · {l.bestStreak}-day streak</Small>
              </Row>
            ))}
          </Card>
        )}
        {data && data.pastWinners.length > 1 && (
          <Card style={{ gap: 6 }}>
            <Text style={{ fontWeight: '800', color: C.ink }}>Past winners</Text>
            {data.pastWinners.slice(1).map((w) => <Small key={w.month}>{monthName(w.month)}: {w.firstName} · {w.sessions} sessions · {w.prize}</Small>)}
          </Card>
        )}
      </Screen>
      {last && <Reveal visible={reveal} onClose={() => setReveal(false)} w={last} />}
      <Confetti fire={burst} />
    </View>
  );
}

function Reveal({ visible, onClose, w }: { visible: boolean; onClose: () => void; w: Jackpot['pastWinners'][number] }) {
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!visible) return;
    pop.setValue(0);
    Animated.spring(pop, { toValue: 1, friction: 4, tension: 60, useNativeDriver: true }).start();
  }, [visible, pop]);
  const month = monthName(w.month);
  const share = () => Share.share({ message: `${w.firstName} won FitCircle's ${month} jackpot with ${w.sessions} sessions and a ${w.bestStreak}-day streak. Prize: ${w.prize}, from ${w.sponsor}. Join a circle on FitCircle.` });
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(12,10,23,0.85)', justifyContent: 'center', padding: 20 }}>
        <LinearGradient colors={['#3A2A00', '#120E22']} style={{ borderRadius: 28, padding: 24, alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#F5A80088' }} accessibilityViewIsModal>
          <Animated.Text style={{ fontSize: 72, transform: [{ scale: pop }, { rotate: pop.interpolate({ inputRange: [0, 1], outputRange: ['-25deg', '0deg'] }) }] }}>👑</Animated.Text>
          <Text style={{ color: C.gold, fontWeight: '800', letterSpacing: 1.4, fontSize: 12 }}>🏆 {month.toUpperCase()} JACKPOT WINNER</Text>
          <Text style={{ color: '#fff', fontSize: 32, fontWeight: '800' }}>{w.firstName}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.75)', textAlign: 'center' }}>Top performer on FitCircle in {month}, across every challenge{w.decidedBy === 'draw' ? ' (tie decided by a recorded draw)' : ''}</Text>
          <View style={{ alignSelf: 'stretch', marginVertical: 8, padding: 14, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center' }}>
            <Text style={{ color: C.gold, fontSize: 11, fontWeight: '800', letterSpacing: 1 }}>THE PRIZE</Text>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800', textAlign: 'center' }}>{w.prize}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>Paid for by {w.sponsor}, never from members' stakes</Text>
          </View>
          <Row gap={8} style={{ alignSelf: 'stretch' }}>
            {[[w.sessions, 'sessions'], [w.bestStreak, 'day streak'], ['#1', 'on FitCircle']].map(([v, l]) => (
              <View key={String(l)} style={{ flex: 1, padding: 10, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center' }}>
                <Text style={{ color: C.gold, fontSize: 20, fontWeight: '800' }}>{v}</Text>
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>{l}</Text>
              </View>
            ))}
          </Row>
          <View style={{ alignSelf: 'stretch', gap: 8, marginTop: 8 }}>
            <Btn label="Share the result" variant="gold" onPress={share} />
            <Btn label="Close" variant="dark" onPress={onClose} />
          </View>
        </LinearGradient>
      </View>
    </Modal>
  );
}
