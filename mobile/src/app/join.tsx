import { router } from 'expo-router';
import { useState } from 'react';
import { Btn, Card, ErrorBox, Field, H1, P, Screen, Small } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { FORMAT, kes, prettyDate } from '@/lib/theme';
import type { ChallengeSummary } from '@/lib/types';

/** Join a Peer Group or a 75-day squad with the invite code a friend shared. */
export default function Join() {
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<(ChallengeSummary & { createdByName: string }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const look = async () => {
    setBusy(true); setErr(null);
    try { setPreview(await api(`/invites/${encodeURIComponent(code.trim().toUpperCase())}`)); } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };
  const join = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api<{ challengeId: number; mustPay: boolean }>('/challenges/join', { method: 'POST', body: { inviteCode: code.trim().toUpperCase() } });
      router.replace(r.mustPay ? `/challenge/${r.challengeId}/pay` : `/challenge/${r.challengeId}`);
    } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };

  const colors = preview ? FORMAT[preview.type].colors : FORMAT.peer.colors;
  return (
    <Screen title="Invite code" footer={preview ? <Btn label="Join the group  →" colors={colors} busy={busy} onPress={join} /> : <Btn label="Find the group" colors={colors} busy={busy} disabled={code.trim().length < 4} onPress={look} />}>
      <H1>Got an invite?</H1>
      <P muted>Enter the code your friend shared, like FC-7Q2K.</P>
      <Field label="Invite code" value={code} onChangeText={(v) => { setCode(v.toUpperCase()); setPreview(null); }} autoCapitalize="characters" placeholder="FC-7Q2K" maxLength={12}
        style={{ letterSpacing: 3, fontWeight: '800', fontSize: 20 }} />
      {err && <ErrorBox message={err} />}
      {preview && (
        <Card style={{ gap: 4 }}>
          <Small bold color={colors[0]}>{FORMAT[preview.type].name.toUpperCase()}</Small>
          <P><P style={{ fontWeight: '800' }}>{preview.createdByName}</P> invited you to <P style={{ fontWeight: '800' }}>{preview.title}</P>.</P>
          <Small>
            {preview.members} people · {preview.type === 'custom75' ? '75 days' : `${preview.sessionsPerWeek} sessions a week for ${preview.durationDays / 7} weeks`} · starts {prettyDate(preview.startDate)}
            {preview.stake ? ` · ${kes(preview.stake)} stake` : ' · no stake'}
          </Small>
        </Card>
      )}
    </Screen>
  );
}
