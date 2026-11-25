import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Confetti } from '@/components/confetti';
import { Btn, Card, ErrorBox, Eyebrow, Field, H1, Loading, Note, P, Row, Screen, Small } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { C, FORMAT, kes } from '@/lib/theme';
import type { ChallengeDetail } from '@/lib/types';
import { useLoad } from '@/lib/use-load';

type Stage = 'choose' | 'waiting' | 'done' | 'failed';

/** Pay a stake or entry fee: M-Pesa sends a PIN prompt to the phone; cards go through Flutterwave checkout. */
export default function Pay() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const { data: c, error } = useLoad(() => api<ChallengeDetail>(`/challenges/${id}`), [id]);
  const [method, setMethod] = useState<'mpesa' | 'flutterwave'>('mpesa');
  const [phone, setPhone] = useState(me?.phone ?? '');
  const [stage, setStage] = useState<Stage>('choose');
  const [payment, setPayment] = useState<{ paymentId: number; message: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [burst, setBurst] = useState(0);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (poll.current) clearInterval(poll.current); }, []);

  const watch = (paymentId: number) => {
    const started = Date.now();
    if (poll.current) clearInterval(poll.current);
    poll.current = setInterval(async () => {
      try {
        const p = await api<{ status: string; failureReason: string | null }>(`/payments/${paymentId}`);
        if (p.status === 'succeeded') { clearInterval(poll.current!); setStage('done'); setBurst((b) => b + 1); }
        else if (p.status === 'failed') { clearInterval(poll.current!); setStage('failed'); setErr(p.failureReason ?? 'The payment did not go through.'); }
        else if (Date.now() - started > 120_000) { clearInterval(poll.current!); setStage('failed'); setErr("We didn't hear back from M-Pesa. If money left your account it will be matched automatically; otherwise try again."); }
      } catch { /* keep polling through brief network drops */ }
    }, 2500);
  };

  const pay = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api<{ paymentId: number; checkoutUrl: string | null; message: string }>(`/challenges/${id}/payments`, {
        method: 'POST', body: { provider: method, ...(method === 'mpesa' && phone !== me?.phone ? { phone } : {}) },
      });
      setPayment(r);
      setStage('waiting');
      if (r.checkoutUrl) await WebBrowser.openBrowserAsync(r.checkoutUrl);
      watch(r.paymentId);
    } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };

  // Development servers only: pretend the PIN was entered
  const simulate = async () => {
    if (!payment) return;
    try { await api(`/dev/payments/${payment.paymentId}/complete`, { method: 'POST' }); } catch (e) { setErr(errorText(e)); }
  };

  if (!c) return <Screen title="Payment">{error ? <ErrorBox message={error} /> : <Loading />}</Screen>;
  const f = FORMAT[c.type];
  const amount = c.entryFee ?? c.stake ?? 0;

  if (stage === 'done') {
    return (
      <View style={{ flex: 1 }}>
        <Screen title="Payment" back={false} footer={<Btn label="Go to my challenge  →" colors={f.colors} onPress={() => router.replace(`/challenge/${id}`)} />}>
          <View style={{ alignItems: 'center', gap: 10, paddingTop: 40 }}>
            <Text style={{ fontSize: 64 }}>🔒</Text>
            <H1>{c.type === 'instructor' ? "You're in." : 'Stake locked.'}</H1>
            <P muted style={{ textAlign: 'center' }}>
              {c.type === 'instructor' ? `${c.instructorName} will send your first plan when the programme starts.` : `${kes(amount)} is locked in the stake pool. Finish the challenge to get it back.`}
            </P>
          </View>
        </Screen>
        <Confetti fire={burst} />
      </View>
    );
  }

  if (stage === 'waiting') {
    return (
      <Screen title="Payment" back={false} footer={<Btn label="Cancel" variant="ghost" onPress={() => { if (poll.current) clearInterval(poll.current); setStage('choose'); }} />}>
        <View style={{ alignItems: 'center', gap: 14, paddingTop: 40 }}>
          <ActivityIndicator size="large" color={f.colors[0]} />
          <H1>Check your phone</H1>
          <P muted style={{ textAlign: 'center' }}>{payment?.message}</P>
          {__DEV__ && <Btn label="Development: simulate PIN entered" variant="ghost" onPress={simulate} />}
        </View>
      </Screen>
    );
  }

  const radio = (v: 'mpesa' | 'flutterwave', title: string, sub: string, badge: string, bg: string) => (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: method === v }} onPress={() => setMethod(v)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1.5, borderColor: method === v ? f.colors[0] : C.line }}>
      <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: method === v ? f.colors[0] : C.line, alignItems: 'center', justifyContent: 'center' }}>
        {method === v && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: f.colors[0] }} />}
      </View>
      <View style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontWeight: '900' }}>{badge}</Text></View>
      <View style={{ flex: 1 }}><Text style={{ fontWeight: '800', color: C.ink }}>{title}</Text><Small>{sub}</Small></View>
    </Pressable>
  );

  return (
    <Screen title="Payment" footer={<Btn label={`Pay ${kes(amount)}`} colors={f.colors} busy={busy} onPress={pay} />}>
      <Eyebrow color={f.colors[0]}>Commit</Eyebrow>
      <H1>Lock {kes(amount)} into {c.type === 'instructor' ? 'the programme' : 'the stake pool'}.</H1>
      <View style={{ gap: 10 }}>
        {radio('mpesa', 'M-Pesa', 'A PIN prompt on your phone', 'M', '#12A150')}
        {radio('flutterwave', 'Card via Flutterwave', 'Visa, Mastercard', 'F', '#E08A00')}
      </View>
      {method === 'mpesa' && <Field label="M-Pesa number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />}
      <Card style={{ gap: 4 }}>
        <Row style={{ justifyContent: 'space-between' }}><Small>{c.type === 'instructor' ? 'Entry fee' : 'Stake'}</Small><Small bold>{kes(amount)}</Small></Row>
        <Row style={{ justifyContent: 'space-between' }}><Small>Processing</Small><Small bold>KES 0</Small></Row>
        <Row style={{ justifyContent: 'space-between' }}><Text style={{ fontWeight: '800', color: C.ink }}>Total</Text><Text style={{ fontWeight: '800', color: C.ink }}>{kes(amount)}</Text></Row>
      </Card>
      {err && <ErrorBox message={err} />}
      <Note icon="🛡">FitCircle never sees your PIN. {c.type === 'instructor' ? 'Entry fees are not refunded once the programme starts.' : 'Stakes lock when the challenge starts; you can leave for a full refund before then.'}</Note>
    </Screen>
  );
}
