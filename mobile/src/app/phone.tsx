import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Btn, Eyebrow, Field, H1, LinkBtn, Note, P, Screen } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { signupDraft, useAuth } from '@/lib/auth';
import { FORMAT } from '@/lib/theme';

/** Sign in or sign up with a 6-digit SMS code. No passwords. */
export default function Phone() {
  const { as = 'member', then } = useLocalSearchParams<{ as?: 'member' | 'coach'; then?: string }>();
  const coach = as === 'coach';
  const colors = coach ? FORMAT.instructor.colors : FORMAT.peer.colors;
  const { signIn } = useAuth();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const send = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api<{ phone: string; devCode?: string }>('/auth/otp', { method: 'POST', body: { phone } });
      setSent(true);
      setPhone(r.phone);
      if (r.devCode) { setDevCode(r.devCode); setCode(r.devCode); }
    } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };

  const verify = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api<{ isNewUser: boolean; token?: string; signupToken?: string }>('/auth/verify', { method: 'POST', body: { phone, code } });
      if (r.isNewUser) {
        Object.assign(signupDraft, { as, phone, signupToken: r.signupToken!, firstName: '', dateOfBirth: '', goals: [] });
        router.replace({ pathname: '/signup', params: then ? { then } : {} });
        return;
      }
      const me = await signIn(r.token!);
      if (then === 'join') router.replace('/join');
      else if (coach && !me.instructor) router.replace({ pathname: '/terms', params: { kind: 'instructor' } });
      else router.replace('/');
    } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };

  return (
    <Screen
      title={coach ? 'Instructor' : 'Member'}
      footer={<Btn label={sent ? 'Continue  →' : 'Send code'} colors={colors} busy={busy} disabled={sent ? code.length !== 6 : phone.replace(/\D/g, '').length < 9} onPress={sent ? verify : send} />}
    >
      <Eyebrow color={colors[0]}>{coach ? 'FitCircle instructors' : 'FitCircle members'}</Eyebrow>
      <H1>{sent ? 'Enter your code' : 'What is your phone number?'}</H1>
      <P muted>{sent ? `We texted a 6-digit code to ${phone}.` : "We'll text you a 6-digit code. No password needed. This is also the number M-Pesa payouts go to."}</P>
      <Field label="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" placeholder="0712 345 678" editable={!sent} error={!sent ? err : null} />
      {sent && (
        <>
          <Field label="6-digit code" value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" autoComplete="sms-otp" textContentType="oneTimeCode" maxLength={6}
            style={{ letterSpacing: 8, fontSize: 22, fontWeight: '800' }} error={err} />
          {devCode && <Note icon="🛠">Development server: the code is filled in for you.</Note>}
          <LinkBtn label="Didn't get it? Send again" onPress={send} />
        </>
      )}
    </Screen>
  );
}
