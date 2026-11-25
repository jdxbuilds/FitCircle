import { Text, View } from 'react-native';
import { C } from '@/lib/theme';
import type { LeaderRow } from '@/lib/types';
import { Avatar, Bar, Btn, Pill } from './ui';

/** Leaderboard rows: this week's sessions, streak, and who still needs a nudge. */
export function Leaderboard({ rows, color, limit, onNudge, nudged = {}, daily }: {
  rows: LeaderRow[];
  color: string;
  limit?: number;
  onNudge?: (r: LeaderRow) => void;
  nudged?: Record<number, boolean>;
  daily?: boolean; // 75-day: show days instead of weekly sessions
}) {
  const list = limit ? rows.slice(0, limit) : rows;
  return (
    <View style={{ gap: 8 }}>
      {list.map((r, i) => {
        const status = r.loggedToday ? <Pill label="Logged today" tone="good" /> : r.atRisk ? <Pill label="At risk" tone="bad" /> : <Pill label="Not yet" tone="warn" />;
        const canNudge = onNudge && !r.isMe && !r.loggedToday;
        return (
          <View key={r.userId} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 14, backgroundColor: r.isMe ? color + '14' : C.bg }}>
            <Text style={{ width: 22, textAlign: 'center', fontWeight: '800', color: i === 0 ? '#C08400' : C.muted }}>{i + 1}</Text>
            <Avatar name={r.firstName} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ fontWeight: '700', color: C.ink }} numberOfLines={1}>{r.firstName}{r.isMe ? ' (you)' : ''}</Text>
              {!daily && <Bar value={r.sessionsThisWeek / Math.max(1, r.weeklyTarget)} color={color} height={6} />}
              <Text style={{ fontSize: 12, color: C.muted }}>
                {daily ? `${r.streak}-day streak · best ${r.bestStreak}` : `${r.sessionsThisWeek} of ${r.weeklyTarget} this week${r.streak ? ` · ${r.streak}-day streak` : ''}`}
              </Text>
            </View>
            {canNudge ? <Btn small variant={nudged[r.userId] ? 'ghost' : 'dark'} label={nudged[r.userId] ? 'Nudged' : 'Nudge'} disabled={nudged[r.userId]} onPress={() => onNudge(r)} /> : status}
          </View>
        );
      })}
    </View>
  );
}
