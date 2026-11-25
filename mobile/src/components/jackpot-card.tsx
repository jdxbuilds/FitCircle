import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { C, monthName } from '@/lib/theme';
import type { Jackpot } from '@/lib/types';

/** The month's sponsored jackpot. Tapping opens the jackpot screen (ranking and last month's winner). */
export function JackpotCard({ jackpot, note }: { jackpot: Jackpot | null; note?: string }) {
  const cur = jackpot?.current;
  if (!cur) return null;
  const rank = jackpot?.me?.rank;
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push('/jackpot')}
      style={{ flexDirection: 'row', gap: 12, alignItems: 'center', padding: 16, borderRadius: 20, backgroundColor: C.goldSoft, borderWidth: 1, borderColor: '#F7D88A' }}>
      <Text style={{ fontSize: 28 }}>🏆</Text>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 1, color: '#8A5F00' }}>{monthName(cur.month).toUpperCase()} JACKPOT · RESETS ON THE 1ST</Text>
        <Text style={{ fontSize: 15, fontWeight: '800', color: C.ink }}>{cur.prize}</Text>
        <Text style={{ fontSize: 12.5, color: C.muted }}>
          {note ?? (rank ? `You're #${rank} on FitCircle this month. Most sessions wins.` : 'Log a session to get on the ranking. Most sessions wins.')}{' '}
          Paid for by {cur.sponsor}, never from members' stakes.
        </Text>
        <Text style={{ fontSize: 12, fontWeight: '800', color: '#8A5F00', marginTop: 2 }}>See the ranking and last month's winner →</Text>
      </View>
    </Pressable>
  );
}
