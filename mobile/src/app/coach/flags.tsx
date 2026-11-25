import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { Btn, ErrorBox, H1, Loading, P, Row, Screen, Small } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { C } from '@/lib/theme';
import type { Flag } from '@/lib/types';
import { useLoad } from '@/lib/use-load';

const REASON: Record<string, string> = { old_photo: 'Old photo', not_a_workout: 'Not a workout', someone_else: 'Someone else', other: 'Other' };

/** Review proof flagged in a programme. Upheld = the session doesn't count. Settlement waits until every flag is decided. */
export default function ReviewFlags() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, refreshing, refresh, reload } = useLoad(() => api<Flag[]>(`/challenges/${id}/flags`), [id]);
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const decide = async (f: Flag, decision: 'upheld' | 'dismissed') => {
    setBusy(f.id); setErr(null);
    try { await api(`/flags/${f.id}`, { method: 'PATCH', body: { decision } }); await reload(); } catch (e) { setErr(errorText(e)); } finally { setBusy(null); }
  };

  return (
    <Screen title="Review proof" refreshing={refreshing} onRefresh={refresh}>
      <H1>Flagged sessions</H1>
      <P muted>Decide fairly and promptly. The programme can't settle until every flag is decided.</P>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {err && <ErrorBox message={err} />}
      {!data && !error && <Loading />}
      {data?.length === 0 && <Small>Nothing to review. 🎉</Small>}
      {data?.map((f) => (
        <View key={f.id} style={{ borderRadius: 20, overflow: 'hidden', backgroundColor: C.surface2 }}>
          {f.mediaType === 'photo' ? (
            <Image source={{ uri: f.mediaUrl }} style={{ width: '100%', aspectRatio: 4 / 3, backgroundColor: C.line }} resizeMode="cover" accessibilityLabel={`${f.ownerName}'s proof`} />
          ) : (
            <Pressable onPress={() => WebBrowser.openBrowserAsync(f.mediaUrl)} style={{ aspectRatio: 4 / 3, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 18 }}>▶  Play video proof</Text>
            </Pressable>
          )}
          <View style={{ padding: 14, gap: 6 }}>
            <Text style={{ fontWeight: '800', fontSize: 16, color: C.ink }}>{f.ownerName} · {f.activity ?? 'Session'} · {f.date}</Text>
            <Small>Flagged by {f.flaggedByName}: {REASON[f.reason] ?? f.reason}{f.note ? ` — “${f.note}”` : ''}</Small>
            <Row gap={8}>
              <View style={{ flex: 1 }}><Btn small label="Counts" variant="ghost" busy={busy === f.id} onPress={() => decide(f, 'dismissed')} /></View>
              <View style={{ flex: 1 }}><Btn small label="Doesn't count" variant="danger" busy={busy === f.id} onPress={() => decide(f, 'upheld')} /></View>
            </Row>
          </View>
        </View>
      ))}
    </Screen>
  );
}
