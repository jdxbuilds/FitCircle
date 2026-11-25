import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Confetti } from '@/components/confetti';
import { Btn, Chips, ErrorBox, Field, H1, Loading, Note, P, Screen, Small } from '@/components/ui';
import { api, errorText, uploadFile, type PickedFile, type UploadTicket } from '@/lib/api';
import { C, FORMAT } from '@/lib/theme';
import type { ChallengeDetail } from '@/lib/types';
import { useLoad } from '@/lib/use-load';

const ALLOWED = ['image/jpeg', 'image/png', 'image/heic', 'video/mp4', 'video/quicktime'];
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic', 'video/mp4': 'mp4', 'video/quicktime': 'mov' };
const ACTIVITIES = ['Run', 'Gym', 'HIIT', 'Yoga', 'Walk', 'Football', 'Cycling', 'Other'];

function toFile(a: ImagePicker.ImagePickerAsset): PickedFile | null {
  let type = a.mimeType ?? (a.type === 'video' ? 'video/mp4' : 'image/jpeg');
  if (type === 'image/jpg') type = 'image/jpeg';
  if (!ALLOWED.includes(type)) return null;
  return { uri: a.uri, mimeType: type, name: `proof.${EXT[type]}` };
}

/** Log today's session: same-day photo or short video, uploaded straight to storage, then counted. */
export default function LogSession() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: c, error } = useLoad(() => api<ChallengeDetail>(`/challenges/${id}`), [id]);
  const [file, setFile] = useState<PickedFile | null>(null);
  const [activity, setActivity] = useState('Run');
  const [caption, setCaption] = useState('');
  const [done, setDone] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ streak: number; sessionsThisWeek: number; weeklyTarget: number | null } | null>(null);
  const [burst, setBurst] = useState(0);

  const pick = async (camera: boolean) => {
    setErr(null);
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { setErr(camera ? 'Allow camera access in Settings to take proof.' : 'Allow photo access in Settings to pick proof.'); return; }
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images', 'videos'], quality: 0.7, videoMaxDuration: 30 };
    const r = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (r.canceled) return;
    const f = toFile(r.assets[0]);
    if (!f) { setErr('Use a JPG, PNG or HEIC photo, or an MP4 or MOV video.'); return; }
    setFile(f);
  };

  const submit = async () => {
    if (!file) return;
    setBusy(true); setErr(null);
    try {
      const ticket = await api<UploadTicket>(`/challenges/${id}/uploads`, { method: 'POST', body: { contentType: file.mimeType } });
      await uploadFile(ticket, file);
      const r = await api<{ streak: number; sessionsThisWeek: number; weeklyTarget: number | null }>(`/challenges/${id}/logs`, {
        method: 'POST', body: { key: ticket.key, activity, caption: caption.trim() || undefined, taskIds: done },
      });
      setResult(r);
      setBurst((b) => b + 1);
    } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };

  if (!c) return <Screen title="Log a session">{error ? <ErrorBox message={error} /> : <Loading />}</Screen>;
  const f = FORMAT[c.type];

  if (result) {
    return (
      <View style={{ flex: 1 }}>
        <Screen title="" back={false} bg={f.colors[0]} footer={<Btn label="Back to the circle" variant="dark" onPress={() => router.replace(`/challenge/${id}`)} />}>
          <View style={{ alignItems: 'center', gap: 8, paddingTop: 50 }}>
            <Text style={{ fontSize: 70 }}>🔥</Text>
            <Text style={{ fontSize: 76, fontWeight: '900', color: '#fff' }}>{result.streak}</Text>
            <Text style={{ fontSize: 20, fontWeight: '800', color: '#fff' }}>day streak</Text>
            <Text style={{ color: '#fff', fontSize: 16, textAlign: 'center', marginTop: 8 }}>
              {c.type === 'custom75' ? 'Today counts when every task is ticked.' : result.weeklyTarget ? `${result.sessionsThisWeek} of ${result.weeklyTarget} this week. ${result.sessionsThisWeek >= result.weeklyTarget ? 'Weekly target hit.' : `${result.weeklyTarget - result.sessionsThisWeek} more to hit your target.`}` : ''}
              {'\n'}Your circle can see it now.
            </Text>
          </View>
        </Screen>
        <Confetti fire={burst} />
      </View>
    );
  }

  return (
    <Screen title="Log a session" footer={<Btn label="✓  Post proof to the circle" colors={f.colors} busy={busy} disabled={!file} onPress={submit} />}>
      <Pressable accessibilityRole="button" accessibilityLabel="Take proof with the camera" onPress={() => pick(true)}
        style={{ height: 300, borderRadius: 22, borderWidth: 2, borderStyle: 'dashed', borderColor: C.line, backgroundColor: C.surface2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        {file?.mimeType.startsWith('image') ? (
          <Image source={{ uri: file.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors />
        ) : file ? (
          <Text style={{ fontSize: 18, fontWeight: '800', color: C.ink }}>🎬 Video ready</Text>
        ) : (
          <>
            <Text style={{ fontSize: 40 }}>📷</Text>
            <Text style={{ fontWeight: '800', fontSize: 16, color: C.ink }}>Take a photo or short video</Text>
            <Small>Taken today. Proof from earlier days won't count.</Small>
          </>
        )}
      </Pressable>
      <Btn small label="Choose from today's photos instead" variant="ghost" onPress={() => pick(false)} />
      <View style={{ gap: 8 }}>
        <Small bold>What did you do?</Small>
        <Chips color={f.colors[0]} value={activity} onChange={setActivity} options={ACTIVITIES.map((a) => ({ value: a, label: a }))} />
      </View>
      {c.tasks.length > 0 && (
        <View style={{ gap: 8 }}>
          <Small bold>Tick today's tasks</Small>
          <Chips multi color={f.colors[0]} value={done} onChange={(t) => setDone((D) => (D.includes(t) ? D.filter((x) => x !== t) : [...D, t]))}
            options={c.tasks.map((t) => ({ value: t.id, label: t.title }))} />
          {done.length < c.tasks.length && <Note icon="⚠️">The day counts only when every task is ticked.</Note>}
        </View>
      )}
      <Field label="Caption (optional)" value={caption} onChangeText={setCaption} placeholder="Morning run, 6.2 km" maxLength={280} />
      {err && <ErrorBox message={err} />}
      <P muted>👥 Your circle sees this. Anyone can flag proof that looks fake.</P>
    </Screen>
  );
}
