import * as ImagePicker from 'expo-image-picker';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Btn, Card, Chips, ErrorBox, Eyebrow, Field, H1, Loading, Note, P, Pill, Screen, Small } from '@/components/ui';
import { api, errorText, uploadFile, type UploadTicket } from '@/lib/api';
import { instructorTerms, useAuth } from '@/lib/auth';
import { C, FORMAT } from '@/lib/theme';
import type { Dashboard } from '@/lib/types';
import { useLoad } from '@/lib/use-load';

const COLORS = FORMAT.instructor.colors;
const SPECIALTIES = ['Running', 'Strength', 'HIIT', 'Yoga', 'Football', 'Dance', 'Boxing'];
const DOCS = [
  { key: 'certification', title: 'Fitness certification', desc: 'Photo of your certificate', video: false },
  { key: 'national_id', title: 'National ID or passport', desc: 'Matched to your M-Pesa name', video: false },
  { key: 'demo_video', title: '60-second demo video', desc: 'Coach a short session on camera', video: true },
] as const;
const DOC_LABEL: Record<string, { label: string; tone: 'good' | 'warn' | 'bad' }> = {
  approved: { label: 'Approved', tone: 'good' }, pending: { label: 'Uploaded · in review', tone: 'warn' }, rejected: { label: 'Rejected · upload again', tone: 'bad' },
};

/** Become an instructor: profile (after accepting the instructor terms), then three verification documents. */
export default function Apply() {
  const { me, refresh } = useAuth();
  const [name, setName] = useState(me ? `Coach ${me.firstName}` : '');
  const [specs, setSpecs] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { data, reload } = useLoad(() => (me?.instructor ? api<Dashboard>('/instructor/dashboard') : Promise.resolve(null)), [me?.instructor]);

  if (!me) return <Redirect href="/welcome" />;
  if (!me.instructor && !instructorTerms.accepted) return <Redirect href={{ pathname: '/terms', params: { kind: 'instructor' } }} />;

  const createProfile = async () => {
    setBusy('profile'); setErr(null);
    try {
      await api('/instructor/profile', { method: 'POST', body: { displayName: name.trim(), specialties: specs.join(', ') || undefined, acceptInstructorTerms: true } });
      await refresh();
    } catch (e) { setErr(errorText(e)); } finally { setBusy(null); }
  };

  const upload = async (doc: (typeof DOCS)[number]) => {
    setErr(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { setErr('Allow photo access in Settings to upload documents.'); return; }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: doc.video ? ['videos'] : ['images'], quality: 0.8 });
    if (r.canceled) return;
    const a = r.assets[0];
    let type = a.mimeType ?? (doc.video ? 'video/mp4' : 'image/jpeg');
    if (type === 'image/jpg') type = 'image/jpeg';
    if (!['image/jpeg', 'image/png', 'video/mp4', 'video/quicktime'].includes(type)) { setErr('Use a JPG or PNG photo, or an MP4 or MOV video.'); return; }
    setBusy(doc.key);
    try {
      const ticket = await api<UploadTicket>('/instructor/uploads', { method: 'POST', body: { purpose: doc.key, contentType: type } });
      await uploadFile(ticket, { uri: a.uri, mimeType: type, name: `${doc.key}.${type.split('/')[1].replace('quicktime', 'mov').replace('jpeg', 'jpg')}` });
      await api('/instructor/documents', { method: 'POST', body: { docType: doc.key, key: ticket.key } });
      await reload();
    } catch (e) { setErr(errorText(e)); } finally { setBusy(null); }
  };

  if (!me.instructor) {
    return (
      <Screen title="Become an instructor" footer={<Btn label="Continue  →" colors={COLORS} busy={busy === 'profile'} disabled={name.trim().length < 2} onPress={createProfile} />}>
        <Eyebrow color={COLORS[0]}>For certified trainers</Eyebrow>
        <H1>Run paid challenges. Keep 65% of every fee.</H1>
        <Field label="Name members will see" value={name} onChangeText={setName} maxLength={120} />
        <View style={{ gap: 8 }}>
          <Small bold>What do you coach?</Small>
          <Chips multi color={COLORS[0]} value={specs} onChange={(s) => setSpecs((S) => (S.includes(s) ? S.filter((x) => x !== s) : [...S, s]))} options={SPECIALTIES.map((s) => ({ value: s, label: s }))} />
        </View>
        <Note icon="💸">Earnings are paid by M-Pesa to {me.phone} the day after each programme settles.</Note>
        {err && <ErrorBox message={err} />}
      </Screen>
    );
  }

  if (!data) return <Screen title="Verification"><Loading /></Screen>;
  const verified = data.profile.verification === 'verified';
  const docStatus = (k: string) => data.documents.find((d) => d.docType === k)?.status;
  const allIn = DOCS.every((d) => docStatus(d.key) && docStatus(d.key) !== 'rejected');

  return (
    <Screen title="Verification" footer={<Btn label={verified ? 'Open my dashboard  →' : allIn ? 'Done for now' : 'Upload the remaining items'} colors={COLORS} disabled={!verified && !allIn} onPress={() => router.replace('/coach')} />}>
      <H1>{verified ? "You're verified." : 'Three checks before you go live'}</H1>
      <P muted>{verified ? 'Members can now find and join your programmes.' : 'Most trainers are verified within 24 hours of uploading all three.'}</P>
      {DOCS.map((d) => {
        const st = docStatus(d.key);
        return (
          <Pressable key={d.key} accessibilityRole="button" disabled={st === 'approved' || busy !== null} onPress={() => upload(d)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: C.surface2 }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: st === 'approved' ? C.good : C.bg, alignItems: 'center', justifyContent: 'center', borderWidth: st ? 0 : 1.5, borderColor: C.line, borderStyle: 'dashed' }}>
              <Text style={{ color: st === 'approved' ? '#fff' : C.ink, fontWeight: '900' }}>{st === 'approved' ? '✓' : busy === d.key ? '…' : '+'}</Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontWeight: '800', color: C.ink }}>{d.title}</Text>
              {st ? <Pill label={DOC_LABEL[st]?.label ?? st} tone={DOC_LABEL[st]?.tone ?? 'warn'} /> : <Small>{d.desc}</Small>}
            </View>
          </Pressable>
        );
      })}
      {err && <ErrorBox message={err} />}
      {!verified && allIn && <Card><Small>All three are in. We'll notify you when the FitCircle team has checked them.</Small></Card>}
    </Screen>
  );
}
