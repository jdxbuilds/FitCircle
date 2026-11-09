import { randomInt } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parse, requireUser, type Ctx } from '../app.js';
import { exec, one, rows, tx, type Conn } from '../db.js';
import { challengeAccess, requireHost, requireInsider } from '../lib/access.js';
import { badRequest, conflict, forbidden, guard, notFound } from '../lib/errors.js';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const money = z.number().int('Use whole shillings').positive().max(1_000_000);

const createBody = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('peer'),
    title: z.string().trim().min(2).max(160),
    startDate: date,
    weeks: z.number().int().min(1).max(12),
    sessionsPerWeek: z.number().int().min(2, 'FitCircle minimum is 2 sessions a week').max(7),
    stake: money.nullable().default(null),
    capacity: z.number().int().min(2).max(500).optional(),
  }),
  z.object({
    type: z.literal('custom75'),
    title: z.string().trim().min(2).max(160),
    startDate: date,
    mode: z.enum(['hard', 'soft']),
    tasks: z.array(z.string().trim().min(2).max(120)).min(2).max(10),
    stake: money.nullable().default(null),
    capacity: z.number().int().min(1).max(500).optional(),
  }),
  z.object({
    type: z.literal('instructor'),
    title: z.string().trim().min(2).max(160),
    description: z.string().max(4000).optional(),
    startDate: date,
    weeks: z.number().int().min(1).max(12),
    sessionsPerWeek: z.number().int().min(2).max(7),
    entryFee: money,
    capacity: z.number().int().min(1).max(1000).optional(),
  }),
]);

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const inviteCode = () => 'FC-' + Array.from({ length: 5 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('');

const SUMMARY = `
  c.id, c.type, c.title, c.status, c.start_date AS startDate, c.end_date AS endDate, c.duration_days AS durationDays,
  c.sessions_per_week AS sessionsPerWeek, c.mode_75 AS mode75, c.is_staked AS isStaked, c.stake_amount AS stake,
  c.entry_fee AS entryFee, c.currency, c.fee_pct AS feePct, c.forfeit_pct AS forfeitPct, c.capacity, c.instructor_id AS instructorId,
  ip.display_name AS instructorName,
  (SELECT COUNT(*) FROM challenge_members cm WHERE cm.challenge_id = c.id AND cm.status <> 'withdrawn') AS members`;

export async function insertChallenge(conn: Conn, userId: number, body: z.infer<typeof createBody>): Promise<number> {
  const weeks = body.type === 'custom75' ? null : body.weeks;
  const duration = body.type === 'custom75' ? 75 : weeks! * 7;
  const spw = body.type === 'custom75' ? (body.mode === 'hard' ? 7 : 6) : body.sessionsPerWeek;
  const stake = body.type === 'instructor' ? null : body.stake;
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await exec(
        conn,
        `INSERT INTO challenges (type, title, description, created_by, instructor_id, start_date, duration_days, sessions_per_week,
                                 mode_75, is_staked, stake_amount, entry_fee, capacity, invite_code)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          body.type,
          body.title,
          body.type === 'instructor' ? (body.description ?? null) : null,
          userId,
          body.type === 'instructor' ? userId : null,
          body.startDate,
          duration,
          spw,
          body.type === 'custom75' ? body.mode : null,
          stake ? 1 : 0,
          stake,
          body.type === 'instructor' ? body.entryFee : null,
          body.capacity ?? null,
          inviteCode(),
        ],
      );
      return res.insertId;
    } catch (e) {
      if ((e as { errno?: number; sqlMessage?: string }).errno === 1062 && attempt < 5 && /invite/.test(String((e as Error).message))) continue;
      throw e;
    }
  }
}

export function challengeRoutes(app: FastifyInstance, ctx: Ctx) {
  app.post('/challenges', async (req, reply) => {
    const u = await requireUser(ctx, req);
    const body = parse(createBody, req.body);
    if (body.startDate < new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10)) throw badRequest('Start date must be today or later');
    const id = await guard(() =>
      tx(ctx.db, async (conn) => {
        const id = await insertChallenge(conn, u.id, body);
        if (body.type === 'custom75')
          for (const [i, t] of body.tasks.entries()) await exec(conn, 'INSERT INTO challenge_tasks (challenge_id, title, sort_order) VALUES (?, ?, ?)', [id, t, i + 1]);
        // Peer and 75-day creators take part themselves; instructors host without joining.
        if (body.type !== 'instructor') await exec(conn, "INSERT INTO challenge_members (challenge_id, user_id, role) VALUES (?, ?, 'owner')", [id, u.id]);
        return id;
      }),
    );
    const c = await one<{ invite_code: string }>(ctx.db, 'SELECT invite_code FROM challenges WHERE id = ?', [id]);
    return reply.status(201).send({ id, inviteCode: c!.invite_code });
  });

  // Browse open instructor programmes
  app.get('/challenges/discover', async (req) => {
    await requireUser(ctx, req);
    return rows(
      ctx.db,
      `SELECT ${SUMMARY} FROM challenges c JOIN instructor_profiles ip ON ip.user_id = c.instructor_id
        WHERE c.type = 'instructor' AND c.status = 'enrolling' AND c.start_date >= CURDATE()
        ORDER BY c.start_date LIMIT 100`,
    );
  });

  // Everything I'm in or hosting
  app.get('/challenges/mine', async (req) => {
    const u = await requireUser(ctx, req);
    return rows(
      ctx.db,
      `SELECT ${SUMMARY}, m.status AS myStatus, m.amount_paid AS myAmountPaid, (c.created_by = ? OR c.instructor_id = ?) AS isHost
         FROM challenges c
         LEFT JOIN instructor_profiles ip ON ip.user_id = c.instructor_id
         LEFT JOIN challenge_members m ON m.challenge_id = c.id AND m.user_id = ?
        WHERE (m.user_id IS NOT NULL AND m.status <> 'withdrawn') OR c.instructor_id = ? OR (c.created_by = ? AND c.type = 'instructor')
        ORDER BY FIELD(c.status, 'active', 'enrolling', 'draft', 'settled', 'cancelled'), c.start_date DESC`,
      [u.id, u.id, u.id, u.id, u.id],
    );
  });

  // Preview a group from its invite code (before joining)
  app.get('/invites/:code', async (req) => {
    await requireUser(ctx, req);
    const { code } = parse(z.object({ code: z.string().max(12) }), req.params);
    const c = await one(
      ctx.db,
      `SELECT ${SUMMARY}, u.first_name AS createdByName FROM challenges c
         LEFT JOIN instructor_profiles ip ON ip.user_id = c.instructor_id JOIN users u ON u.id = c.created_by
        WHERE c.invite_code = ?`,
      [code.toUpperCase()],
    );
    if (!c) throw notFound('That invite code does not match any challenge');
    return c;
  });

  app.get('/challenges/:id', async (req) => {
    const u = await requireUser(ctx, req);
    const { id } = parse(z.object({ id: z.coerce.number().int() }), req.params);
    const a = await challengeAccess(ctx, id, u);
    const isPublic = a.challenge.type === 'instructor' && a.challenge.status === 'enrolling';
    if (!a.memberStatus && !a.isHost && !isPublic) throw forbidden('Join this challenge to see it');
    const summary = await one(
      ctx.db,
      `SELECT ${SUMMARY}, c.description, ${a.memberStatus || a.isHost ? 'c.invite_code AS inviteCode,' : ''}
              j.pool AS stakePool, j.forfeited
         FROM challenges c LEFT JOIN instructor_profiles ip ON ip.user_id = c.instructor_id
         LEFT JOIN v_stake_pools j ON j.challenge_id = c.id WHERE c.id = ?`,
      [id],
    );
    // Jackpot: a sponsor's prize, one winner (the top finisher)
    const jackpot = await one(
      ctx.db,
      `SELECT c.jackpot_prize AS prize, s.name AS sponsor, a.user_id AS winnerId, u.first_name AS winnerName,
              a.sessions, a.best_streak AS bestStreak, a.decided_by AS decidedBy, a.awarded_at AS awardedAt
         FROM challenges c JOIN sponsors s ON s.id = c.sponsor_id
         LEFT JOIN jackpot_awards a ON a.challenge_id = c.id LEFT JOIN users u ON u.id = a.user_id
        WHERE c.id = ?`,
      [id],
    );
    const tasks = await rows(ctx.db, 'SELECT id, title FROM challenge_tasks WHERE challenge_id = ? ORDER BY sort_order', [id]);
    const settlement = await one(
      ctx.db,
      `SELECT gross_amount AS gross, forfeited_amount AS forfeited, forfeit_pct AS forfeitPct, fee_amount AS fee, completers, forfeiters,
              bonus_each AS bonusEach, amount_each AS amountEach, settled_at AS settledAt
         FROM settlements WHERE challenge_id = ?`,
      [id],
    );
    return {
      ...summary,
      tasks,
      jackpot: jackpot
        ? { prize: jackpot.prize, sponsor: jackpot.sponsor,
            winner: jackpot.winnerId ? { userId: jackpot.winnerId, firstName: jackpot.winnerName, sessions: jackpot.sessions,
                                         bestStreak: jackpot.bestStreak, decidedBy: jackpot.decidedBy, awardedAt: jackpot.awardedAt } : null }
        : null,
      settlement: settlement ?? null,
      me: { status: a.memberStatus, amountPaid: a.amountPaid, isHost: a.isHost, mustPay: needsPayment(a) },
    };
  });

  app.post('/challenges/join', async (req, reply) => {
    const u = await requireUser(ctx, req);
    const { inviteCode } = parse(z.object({ inviteCode: z.string().trim().max(12) }), req.body);
    const c = await one<{ id: number }>(ctx.db, 'SELECT id FROM challenges WHERE invite_code = ?', [inviteCode.toUpperCase()]);
    if (!c) throw notFound('That invite code does not match any challenge');
    return reply.status(201).send(await join(ctx, c.id, u.id));
  });

  app.post('/challenges/:id/join', async (req, reply) => {
    const u = await requireUser(ctx, req);
    const { id } = parse(z.object({ id: z.coerce.number().int() }), req.params);
    const c = await one<{ type: string }>(ctx.db, 'SELECT type FROM challenges WHERE id = ?', [id]);
    if (!c) throw notFound('Challenge not found');
    if (c.type !== 'instructor') throw forbidden('Peer and 75-day groups are joined with an invite code');
    return reply.status(201).send(await join(ctx, id, u.id));
  });

  // Leave before the start. A paid stake or fee is refunded.
  app.post('/challenges/:id/leave', async (req) => {
    const u = await requireUser(ctx, req);
    const { id } = parse(z.object({ id: z.coerce.number().int() }), req.params);
    const a = await challengeAccess(ctx, id, u);
    if (!a.memberStatus || a.memberStatus === 'withdrawn') throw notFound('You are not in this challenge');
    await guard(() =>
      tx(ctx.db, async (conn) => {
        await exec(conn, "UPDATE challenge_members SET status = 'withdrawn' WHERE challenge_id = ? AND user_id = ?", [id, u.id]);
        if (a.amountPaid)
          await exec(conn, "INSERT INTO payouts (user_id, challenge_id, kind, amount, scheduled_for) VALUES (?, ?, 'refund', ?, CURDATE())", [
            u.id,
            id,
            a.amountPaid,
          ]);
      }),
    );
    return { ok: true, refund: a.amountPaid ?? 0 };
  });

  app.post('/challenges/:id/start', async (req) => {
    const u = await requireUser(ctx, req);
    const { id } = parse(z.object({ id: z.coerce.number().int() }), req.params);
    await requireHost(ctx, id, u);
    await guard(() => ctx.db.query('CALL start_challenge(?)', [id]));
    return { ok: true };
  });

  app.get('/challenges/:id/members', async (req) => {
    const u = await requireUser(ctx, req);
    const { id } = parse(z.object({ id: z.coerce.number().int() }), req.params);
    await requireInsider(ctx, id, u);
    return rows(
      ctx.db,
      `SELECT m.user_id AS userId, u.first_name AS firstName, m.role, m.status, (m.amount_paid IS NOT NULL) AS paid, m.joined_at AS joinedAt
         FROM challenge_members m JOIN users u ON u.id = m.user_id
        WHERE m.challenge_id = ? AND m.status <> 'withdrawn' ORDER BY m.joined_at`,
      [id],
    );
  });
}

function needsPayment(a: Awaited<ReturnType<typeof challengeAccess>>) {
  const c = a.challenge;
  return a.memberStatus === 'active' && a.amountPaid === null && (c.is_staked === 1 || c.type === 'instructor') && c.status === 'enrolling';
}

async function join(ctx: Ctx, challengeId: number, userId: number) {
  const existing = await one<{ status: string }>(ctx.db, 'SELECT status FROM challenge_members WHERE challenge_id = ? AND user_id = ?', [challengeId, userId]);
  if (existing && existing.status !== 'withdrawn') throw conflict('You are already in this challenge');
  const host = await one<{ instructor_id: number | null }>(ctx.db, 'SELECT instructor_id FROM challenges WHERE id = ?', [challengeId]);
  if (host?.instructor_id === userId) throw conflict('You host this challenge');
  // Rejoining re-inserts the row so the database's join rules (age, start date, capacity) run again.
  await guard(() =>
    tx(ctx.db, async (conn) => {
      if (existing) await exec(conn, 'DELETE FROM challenge_members WHERE challenge_id = ? AND user_id = ?', [challengeId, userId]);
      await exec(conn, 'INSERT INTO challenge_members (challenge_id, user_id) VALUES (?, ?)', [challengeId, userId]);
    }),
  );
  const c = await one<{ is_staked: number; type: string; stake_amount: number | null; entry_fee: number | null }>(
    ctx.db,
    'SELECT is_staked, type, stake_amount, entry_fee FROM challenges WHERE id = ?',
    [challengeId],
  );
  return { challengeId, mustPay: c!.is_staked === 1 || c!.type === 'instructor', amount: c!.stake_amount ?? c!.entry_fee ?? 0 };
}
