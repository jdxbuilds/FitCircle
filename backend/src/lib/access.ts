import type { Ctx, CurrentUser } from '../app.js';
import { one } from '../db.js';
import { forbidden, notFound } from './errors.js';

export interface ChallengeRow {
  id: number;
  type: 'peer' | 'instructor' | 'custom75';
  title: string;
  status: 'draft' | 'enrolling' | 'active' | 'settled' | 'cancelled';
  created_by: number;
  instructor_id: number | null;
  start_date: string;
  end_date: string;
  is_staked: number;
  stake_amount: number | null;
  entry_fee: number | null;
  fee_pct: number;
  sessions_per_week: number;
  invite_code: string;
}

export interface Access {
  challenge: ChallengeRow;
  memberStatus: string | null;
  amountPaid: number | null;
  isMember: boolean; // active member who can log
  isHost: boolean; // creator, instructor or admin
}

export async function challengeAccess(ctx: Ctx, challengeId: number, user: CurrentUser): Promise<Access> {
  const challenge = await one<ChallengeRow>(ctx.db, 'SELECT * FROM challenges WHERE id = ?', [challengeId]);
  if (!challenge) throw notFound('Challenge not found');
  const m = await one<{ status: string; amount_paid: number | null }>(
    ctx.db,
    'SELECT status, amount_paid FROM challenge_members WHERE challenge_id = ? AND user_id = ?',
    [challengeId, user.id],
  );
  const isHost = user.role === 'admin' || challenge.created_by === user.id || challenge.instructor_id === user.id;
  return {
    challenge,
    memberStatus: m?.status ?? null,
    amountPaid: m?.amount_paid ?? null,
    isMember: m?.status === 'active',
    isHost,
  };
}

/** Members (any status), hosts and admins can see a challenge's people and proof. */
export async function requireInsider(ctx: Ctx, challengeId: number, user: CurrentUser): Promise<Access> {
  const a = await challengeAccess(ctx, challengeId, user);
  if (!a.memberStatus && !a.isHost) throw forbidden('Join this challenge to see it');
  return a;
}

export async function requireHost(ctx: Ctx, challengeId: number, user: CurrentUser): Promise<Access> {
  const a = await challengeAccess(ctx, challengeId, user);
  if (!a.isHost) throw forbidden('Only the challenge host can do this');
  return a;
}

export async function notify(
  db: Ctx['db'],
  userId: number,
  type: string,
  title: string,
  body: string | null,
  data: Record<string, unknown> | null = null,
) {
  await db.query('INSERT INTO notifications (user_id, type, title, body, data) VALUES (?, ?, ?, ?, ?)', [
    userId,
    type,
    title,
    body,
    data ? JSON.stringify(data) : null,
  ]);
}
