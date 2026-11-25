import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { TabBar } from '@/components/tab-bar';
import { ErrorBox, H1, Loading, Screen, Small } from '@/components/ui';
import { api } from '@/lib/api';
import { C } from '@/lib/theme';
import type { Notice } from '@/lib/types';
import { useLoad } from '@/lib/use-load';

const ICON: Record<string, string> = {
  daily_reminder: '🔔', evening_reminder: '🌙', nudge: '👋', daily_plan: '🏅', stake_locked: '🔒', challenge_started: '🚀',
  challenge_settled: '🏆', removed: '⚠️', flag_raised: '⚑', flag_resolved: '🛡', payout_sent: '💸', payment_failed: '❌',
};

const when = (iso: string) => {
  const d = new Date(iso.replace(' ', 'T') + (iso.includes('Z') || iso.includes('+') ? '' : '+03:00'));
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m`;
  if (mins < 1440) return `${Math.round(mins / 60)}h`;
  return `${Math.round(mins / 1440)}d`;
};

/** Reminders, nudges, plans and results. Opening this screen marks them read. */
export default function Alerts() {
  const { data, error, refreshing, refresh, reload } = useLoad(() => api<Notice[]>('/notifications'));
  const unread = data?.filter((n) => !n.readAt).length ?? 0;
  useEffect(() => { if (unread) void api('/notifications/read', { method: 'POST', body: {} }).catch(() => {}); }, [unread]);

  return (
    <Screen tabBar={<TabBar />} refreshing={refreshing} onRefresh={refresh}>
      <H1>Alerts</H1>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data?.length === 0 && <Small>Nothing yet. Reminders arrive at 06:30, and at 19:00 if you haven't logged.</Small>}
      {data?.map((n) => {
        const cid = n.data?.challengeId;
        return (
          <Pressable key={n.id} disabled={!cid} onPress={() => cid && router.push(`/challenge/${cid}`)}
            style={{ flexDirection: 'row', gap: 12, padding: 14, borderRadius: 18, backgroundColor: n.readAt ? C.bg : C.surface2 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 18 }}>{ICON[n.type] ?? '•'}</Text></View>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <Text style={{ flex: 1, fontWeight: '800', color: C.ink }}>{n.title}</Text>
                <Small>{when(n.createdAt)}</Small>
              </View>
              {n.body ? <Text style={{ color: C.muted, fontSize: 14 }}>{n.body}</Text> : null}
            </View>
          </Pressable>
        );
      })}
    </Screen>
  );
}
