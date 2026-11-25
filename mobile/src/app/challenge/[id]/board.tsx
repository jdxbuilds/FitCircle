import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Image, Modal, Pressable, Text, View } from 'react-native';
import { Leaderboard } from '@/components/leaderboard';
import { Avatar, Btn, Card, Chips, ErrorBox, Field, Loading, Note, Pill, Row, Screen, Small } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { C, FORMAT } from '@/lib/theme';
import type { ChallengeDetail, FeedItem, LeaderRow } from '@/lib/types';
import { useLoad } from '@/lib/use-load';

const REASONS = [
  { value: 'old_photo', label: 'Old photo' },
  { value: 'not_a_workout', label: 'Not a workout' },
  { value: 'someone_else', label: 'Someone else' },
  { value: 'other', label: 'Other' },
];

/** The circle: live leaderboard with nudges, and today's proof feed with flagging. */
export default function Board() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const [tab, setTab] = useState<'board' | 'feed'>('board');
  const { data, error, refreshing, refresh, reload } = useLoad(async () => {
    const [c, board, feed] = await Promise.all([
      api<ChallengeDetail>(`/challenges/${id}`),
      api<LeaderRow[]>(`/challenges/${id}/leaderboard`),
      api<FeedItem[]>(`/challenges/${id}/feed`),
    ]);
    return { c, board, feed };
  }, [id]);
  const [nudged, setNudged] = useState<Record<number, boolean>>({});
  const [flagging, setFlagging] = useState<FeedItem | null>(null);
  const [reason, setReason] = useState('old_photo');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (!data) return <Screen title="Your circle">{error ? <ErrorBox message={error} onRetry={reload} /> : <Loading />}</Screen>;
  const { c, board, feed } = data;
  const f = FORMAT[c.type];

  const nudge = async (r: LeaderRow) => {
    setErr(null);
    try {
      await api(`/challenges/${id}/nudges`, { method: 'POST', body: { toUserId: r.userId } });
      setNudged((n) => ({ ...n, [r.userId]: true }));
      setMsg(`Nudge sent to ${r.firstName}.`);
    } catch (e) { setErr(errorText(e)); }
  };
  const flag = async () => {
    if (!flagging) return;
    setErr(null);
    try {
      await api(`/logs/${flagging.id}/flags`, { method: 'POST', body: { reason, note: note.trim() || undefined } });
      setMsg(`Flag sent. ${flagging.firstName}'s session will be reviewed.`);
      setFlagging(null); setNote('');
      await reload();
    } catch (e) { setErr(errorText(e)); setFlagging(null); }
  };

  return (
    <Screen title={c.title} refreshing={refreshing} onRefresh={refresh}>
      <Chips color={f.colors[0]} value={tab} onChange={setTab} options={[{ value: 'board', label: 'Leaderboard' }, { value: 'feed', label: `Proof feed (${feed.length})` }]} />
      {msg && <Card tint="#E5F6EC"><Small bold color={C.good}>{msg}</Small></Card>}
      {err && <ErrorBox message={err} />}
      {tab === 'board' ? (
        <>
          <Card><Leaderboard rows={board} color={f.colors[0]} daily={c.type === 'custom75'} onNudge={c.status === 'active' ? nudge : undefined} nudged={nudged} /></Card>
          <Note icon="👋">People who haven't logged today can get a nudge from you, once a day. It's how the circle keeps everyone honest.</Note>
        </>
      ) : (
        <>
          {feed.length === 0 && <Small>No proof posted yet today.</Small>}
          {feed.map((p) => (
            <View key={p.id} style={{ borderRadius: 20, overflow: 'hidden', backgroundColor: C.surface2 }}>
              {p.mediaType === 'photo' ? (
                <Image source={{ uri: p.mediaUrl }} style={{ width: '100%', aspectRatio: 4 / 3, backgroundColor: C.line }} resizeMode="cover" accessibilityLabel={`${p.firstName}'s proof`} />
              ) : (
                <Pressable onPress={() => WebBrowser.openBrowserAsync(p.mediaUrl)} style={{ aspectRatio: 4 / 3, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>▶  Play video proof</Text>
                </Pressable>
              )}
              <View style={{ padding: 12, gap: 4 }}>
                <Row>
                  <Avatar name={p.firstName} size={30} />
                  <Text style={{ flex: 1, fontWeight: '800', color: C.ink }}>{p.firstName}</Text>
                  {p.status === 'flagged' ? <Pill label="Under review" tone="warn" /> : p.status === 'rejected' ? <Pill label="Didn't count" tone="bad" /> : <Pill label="Counted" tone="good" />}
                  {!p.flaggedByMe && p.status === 'counted' && p.userId !== me?.id && <Btn small variant="ghost" label="⚑ Flag" onPress={() => setFlagging(p)} />}
                </Row>
                <Small>{[p.activity, p.caption].filter(Boolean).join(' · ') || 'Session logged'} · {p.loggedAt.slice(11, 16)}</Small>
              </View>
            </View>
          ))}
        </>
      )}
      <Modal visible={!!flagging} transparent animationType="slide" onRequestClose={() => setFlagging(null)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ backgroundColor: C.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, gap: 12 }}>
            <Text style={{ fontSize: 19, fontWeight: '800', color: C.ink }}>Flag {flagging?.firstName}'s proof?</Text>
            <Small>{c.type === 'instructor' ? 'The instructor' : 'The FitCircle team'} will review it. If it's fake the session won't count. You can't flag your own proof.</Small>
            <Chips value={reason} onChange={setReason} options={REASONS} />
            <Field label="Note (optional)" value={note} onChangeText={setNote} maxLength={280} placeholder="Same photo as last Tuesday" />
            <Btn label="⚑  Send for review" variant="dark" onPress={flag} />
            <Btn label="Cancel" variant="ghost" onPress={() => setFlagging(null)} />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
