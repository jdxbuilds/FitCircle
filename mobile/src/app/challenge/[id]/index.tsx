import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Platform, Share, Text, View } from 'react-native';
import { Confetti } from '@/components/confetti';
import { Leaderboard } from '@/components/leaderboard';
import { Bar, Btn, Card, ErrorBox, Eyebrow, Hero, LinkBtn, Loading, Note, P, Pill, Row, Screen, Small } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { C, FORMAT, MAX_MISSED, kes, nairobiDate, prettyDate } from '@/lib/theme';
import type { ChallengeDetail, LeaderRow } from '@/lib/types';
import { useLoad } from '@/lib/use-load';

const W = { color: '#fff' } as const;
const confirm = (title: string, msg: string, ok: () => void) => {
  if (Platform.OS === 'web') { if (globalThis.confirm?.(`${title}\n\n${msg}`)) ok(); return; }
  Alert.alert(title, msg, [{ text: 'Cancel', style: 'cancel' }, { text: 'Yes', style: 'destructive', onPress: ok }]);
};

export default function ChallengeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, refreshing, refresh, reload } = useLoad(async () => {
    const c = await api<ChallengeDetail>(`/challenges/${id}`);
    const insider = !!c.me.status || c.me.isHost;
    const [board, plan] = await Promise.all([
      insider && c.status !== 'enrolling' ? api<LeaderRow[]>(`/challenges/${id}/leaderboard`) : Promise.resolve([] as LeaderRow[]),
      insider && c.type === 'instructor' && c.status === 'active' ? api<{ title: string; instructions: string | null } | null>(`/challenges/${id}/plans/today`).catch(() => null) : Promise.resolve(null),
    ]);
    return { c, board, plan };
  }, [id]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [burst, setBurst] = useState(0);
  const celebrated = useRef(false);

  // Confetti when a finished challenge shows its winner
  useEffect(() => {
    if (data?.c.status === 'settled' && data.c.winner && !celebrated.current) { celebrated.current = true; setBurst((b) => b + 1); }
  }, [data]);

  if (!data) return <Screen title="Challenge">{error ? <ErrorBox message={error} onRetry={reload} /> : <Loading />}</Screen>;
  const { c, board, plan } = data;
  const f = FORMAT[c.type];
  const meRow = board.find((r) => r.isMe);
  const member = !!c.me.status && c.me.status !== 'withdrawn';
  const pricePer = c.entryFee ?? c.stake;
  const dayNo = Math.max(1, Math.min(c.durationDays, Math.floor((Date.parse(nairobiDate()) - Date.parse(c.startDate)) / 86_400_000) + 1));

  const act = async (fn: () => Promise<void>) => {
    setBusy(true); setErr(null);
    try { await fn(); } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };
  const join = () => act(async () => {
    const r = await api<{ mustPay: boolean }>(`/challenges/${id}/join`, { method: 'POST' });
    if (r.mustPay) router.push(`/challenge/${id}/pay`); else await reload();
  });
  const startNow = () => confirm('Start now?', 'Members who have not paid their stake will be removed.', () => act(async () => { await api(`/challenges/${id}/start`, { method: 'POST' }); await reload(); }));
  const leave = () => confirm('Leave this challenge?', c.me.amountPaid ? `Your ${kes(c.me.amountPaid)} will be refunded to M-Pesa.` : 'You can rejoin before it starts.', () => act(async () => { await api(`/challenges/${id}/leave`, { method: 'POST' }); router.replace('/home'); }));
  const share = () => Share.share({ message: `Join my FitCircle ${c.type === 'custom75' ? '75-day squad' : 'group'} "${c.title}". Download FitCircle and enter code ${c.inviteCode}.` });

  // ---------- footer: the one main action for this state ----------
  let footer: React.ReactNode = null;
  if (!member && !c.me.isHost && c.status === 'enrolling') footer = <Btn label={pricePer ? `Join for ${kes(pricePer)}  →` : 'Join  →'} colors={f.colors} busy={busy} onPress={join} />;
  else if (c.me.mustPay) footer = <Btn label={`🔒  Pay ${kes(pricePer)} to lock your place`} colors={f.colors} onPress={() => router.push(`/challenge/${id}/pay`)} />;
  else if (c.status === 'active' && c.me.status === 'active') {
    footer = meRow?.loggedToday
      ? <Btn label="✓  Logged today · see your circle" variant="ghost" onPress={() => router.push(`/challenge/${id}/board`)} />
      : <Btn label="📷  Log today's session" colors={f.colors} onPress={() => router.push(`/challenge/${id}/log`)} />;
  }

  return (
    <View style={{ flex: 1 }}>
      <Screen title={f.name} footer={footer} refreshing={refreshing} onRefresh={refresh}>
        {/* ---------- hero ---------- */}
        <Hero colors={f.colors}>
          <Eyebrow color="rgba(255,255,255,0.9)">
            {c.status === 'enrolling' ? `Starts ${prettyDate(c.startDate)}` : c.status === 'active' ? (c.type === 'custom75' ? `Day ${dayNo} of 75` : `Week ${meRow?.week ?? 1} of ${c.durationDays / 7}`) : c.status === 'settled' ? 'Finished' : c.status}
            {c.instructorName ? ` · ${c.instructorName}` : ''}
          </Eyebrow>
          <Text style={{ ...W, fontSize: 28, fontWeight: '800', letterSpacing: -0.5, marginTop: 6 }}>{c.title}</Text>
          {c.stakePool != null && c.isStaked ? (
            <Text style={{ ...W, fontSize: 40, fontWeight: '800', letterSpacing: -1, marginTop: 4 }}><Text style={{ fontSize: 18 }}>KES </Text>{Math.round(c.stakePool).toLocaleString('en-KE')}</Text>
          ) : null}
          <Row gap={14} style={{ flexWrap: 'wrap', marginTop: 6 }}>
            {c.isStaked ? <Text style={W}>Stake pool</Text> : null}
            <Text style={W}>{c.members} {c.members === 1 ? 'person' : 'people'}</Text>
            <Text style={W}>{c.type === 'custom75' ? `75 ${c.mode75 === 'hard' ? 'Hard' : 'Soft'}` : `${c.sessionsPerWeek} sessions a week`}</Text>
            {c.entryFee ? <Text style={W}>{kes(c.entryFee)} entry</Text> : null}
          </Row>
          {meRow && c.status === 'active' && c.type !== 'custom75' && (
            <View style={{ marginTop: 14, gap: 6 }}>
              <Bar value={meRow.sessionsThisWeek / meRow.weeklyTarget} color="#fff" track="rgba(255,255,255,0.3)" />
              <Text style={W}>You: {meRow.sessionsThisWeek} of {meRow.weeklyTarget} sessions this week · {meRow.streak}-day streak</Text>
            </View>
          )}
          {c.status === 'active' && c.type === 'custom75' && (
            <View style={{ marginTop: 14 }}><Bar value={dayNo / 75} color="#fff" track="rgba(255,255,255,0.3)" /></View>
          )}
        </Hero>

        {err && <ErrorBox message={err} />}

        {/* ---------- before it starts ---------- */}
        {c.status === 'enrolling' && (
          <>
            {c.description ? <Card><P>{c.description}</P></Card> : null}
            {c.me.mustPay && <Card tint="#FFF2DD"><Small bold color="#8A5F00">Pay before {prettyDate(c.startDate)} or you'll be removed when the challenge starts.</Small></Card>}
            {c.inviteCode && (c.type === 'peer' || c.type === 'custom75') && (
              <Card style={{ gap: 8 }}>
                <Small>Invite code</Small>
                <Text style={{ fontSize: 28, fontWeight: '800', letterSpacing: 3, color: f.colors[0] }}>{c.inviteCode}</Text>
                <Btn small label="Share the invite" variant="dark" onPress={share} />
              </Card>
            )}
            <RulesCard c={c} />
            {c.me.isHost && (c.type === 'peer' || c.type === 'custom75') && <LinkBtn label="Start now instead of waiting" onPress={startNow} />}
            {member && <LinkBtn label="Leave this challenge" color={C.bad} onPress={leave} />}
          </>
        )}

        {/* ---------- running ---------- */}
        {c.status === 'active' && (
          <>
            {c.me.status === 'forfeited' && <Card tint="#FCE9E9"><Small bold color={C.bad}>You're out of this challenge: you missed {MAX_MISSED} sessions in a week. You can still cheer your circle on.</Small></Card>}
            {plan && (
              <Card tint={f.colors[0] + '14'} style={{ gap: 4 }}>
                <Small bold color={f.colors[0]}>TODAY'S PLAN FROM {c.instructorName?.toUpperCase()}</Small>
                <Text style={{ fontSize: 17, fontWeight: '800', color: C.ink }}>{plan.title}</Text>
                {plan.instructions ? <P>{plan.instructions}</P> : null}
              </Card>
            )}
            {c.tasks.length > 0 && <Card style={{ gap: 4 }}><Small bold>Daily tasks</Small>{c.tasks.map((t) => <P key={t.id}>•  {t.title}</P>)}</Card>}
            <Card style={{ gap: 10 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={{ fontWeight: '800', fontSize: 16, color: C.ink }}>Leaderboard</Text>
                <LinkBtn label="See all  →" onPress={() => router.push(`/challenge/${id}/board`)} />
              </Row>
              <Leaderboard rows={board} color={f.colors[0]} limit={5} daily={c.type === 'custom75'} />
            </Card>
            {c.me.isHost && c.type === 'instructor' && <Btn label="Post today's plan" variant="dark" onPress={() => router.push({ pathname: '/coach/plan', params: { id } })} />}
          </>
        )}

        {/* ---------- finished ---------- */}
        {c.status === 'settled' && <Settled c={c} />}
      </Screen>
      <Confetti fire={burst} />
    </View>
  );
}

function RulesCard({ c }: { c: ChallengeDetail }) {
  if (c.type === 'instructor') {
    return (
      <Card style={{ gap: 6 }}>
        <Small bold>Where your {kes(c.entryFee)} goes</Small>
        <Small>{100 - c.feePct}% to your instructor, {c.feePct}% to FitCircle. Miss {MAX_MISSED} sessions in a week and you're removed. Entry fees are not refunded once the programme starts.</Small>
      </Card>
    );
  }
  if (!c.isStaked) return <Note icon="🏳️">No money on the line. You still log proof every session and appear on the leaderboard.</Note>;
  if (c.type === 'custom75') return <Card><Small>Finish the 75 days and get your full {kes(c.stake)} back. Miss 3 days and you're out: FitCircle keeps 100% of your stake.</Small></Card>;
  return (
    <Card style={{ gap: 6 }}>
      <Small bold color={C.good}>Show up</Small>
      <Small>Get your full {kes(c.stake)} back plus an equal share of {100 - c.forfeitPct}% of every forfeited stake.</Small>
      <Small bold color={C.bad}>Miss {MAX_MISSED} in a week</Small>
      <Small>You're out. {c.forfeitPct}% of your stake goes to FitCircle, {100 - c.forfeitPct}% to the finishers.</Small>
    </Card>
  );
}

function Settled({ c }: { c: ChallengeDetail }) {
  const s = c.settlement;
  const f = FORMAT[c.type];
  const mine = c.me.status === 'completed' ? (s?.amountEach ?? 0) : 0;
  return (
    <>
      {c.winner && (
        <Hero colors={f.colors} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={{ fontSize: 34 }}>👑</Text>
          <View style={{ flex: 1 }}>
            <Eyebrow color="rgba(255,255,255,0.9)">Challenge winner · top performer</Eyebrow>
            <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>{c.winner.firstName}</Text>
            <Text style={{ color: '#fff' }}>{c.winner.sessions} sessions · {c.winner.bestStreak}-day best streak</Text>
          </View>
        </Hero>
      )}
      <Card style={{ gap: 6 }}>
        <Small bold>Your result</Small>
        {c.me.status === 'completed' && <Pill tone="good" label="Completed" />}
        {c.me.status === 'forfeited' && <Pill tone="bad" label="Out" />}
        {s && c.isStaked && c.me.status === 'completed' && <Text style={{ fontSize: 30, fontWeight: '800', color: C.good }}>{kes(mine)}</Text>}
        {s && c.isStaked && c.me.status === 'completed' && <Small>Paid to your M-Pesa the day after settlement.</Small>}
      </Card>
      {s && c.isStaked ? (
        <Card style={{ gap: 4 }}>
          <Row style={{ justifyContent: 'space-between' }}><Small>Stake pool</Small><Small bold>{kes(s.gross)}</Small></Row>
          <Row style={{ justifyContent: 'space-between' }}><Small>{s.completers} finished · {s.forfeiters} out</Small><Small bold>{kes(s.forfeited)} forfeited</Small></Row>
          <Row style={{ justifyContent: 'space-between' }}><Small>FitCircle keeps ({s.forfeitPct}% + rounding)</Small><Small bold>{kes(s.fee)}</Small></Row>
          {s.forfeitPct < 100 && <Row style={{ justifyContent: 'space-between' }}><Small>Shared by finishers ({100 - s.forfeitPct}%)</Small><Small bold>{kes(s.bonusEach)} each</Small></Row>}
          <Row style={{ justifyContent: 'space-between', marginTop: 6 }}><Text style={{ fontWeight: '800', color: C.ink }}>Each finisher receives</Text><Text style={{ fontWeight: '800', color: C.good }}>{kes(s.amountEach)}</Text></Row>
        </Card>
      ) : null}
      <Note icon="🏆">Every session you logged here also counted towards FitCircle's monthly jackpot.</Note>
      <Btn label="Start the next one  →" colors={f.colors} onPress={() => router.push('/discover')} />
    </>
  );
}
