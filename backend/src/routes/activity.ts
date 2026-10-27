import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parse, requireUser, type Ctx } from '../app.js';
import { exec, one, rows, tx } from '../db.js';
import { challengeAccess, notify, requireInsider } from '../lib/access.js';
import { ApiError, badRequest, forbidden, guard, notFound } from '../lib/errors.js';
import { PROOF_TYPES } from '../lib/storage.js';

const idParam = z.object({ id: z.coerce.number().int() });
const today = async (ctx: Ctx) => (await one<{ d: string }>(ctx.db, 'SELECT CURDATE() AS d'))!.d;

export function activityRoutes(app: FastifyInstance, ctx: Ctx) {
  // 1. Ask for an upload ticket. The key carries today's date, so yesterday's ticket can't be reused.
  app.post('/challenges/:id/uploads', async (req) => {
    const u = await requireUser(ctx, req);
    const { id } = parse(idParam, req.params);
    const { contentType } = parse(z.object({ contentType: z.enum(Object.keys(PROOF_TYPES) as [string, ...string[]]) }), req.body);
    const a = await challengeAccess(ctx, id, u);
    if (!a.isMember || a.challenge.status !== 'active') throw forbidden('Only active members of a running challenge can upload proof');
    const t = PROOF_TYPES[contentType];
    const key = `proofs/${id}/${u.id}/${await today(ctx)}/${randomUUID()}.${t.ext}`;
    return { ...(await ctx.storage.presignUpload(key, contentType, t.maxBytes)), mediaType: t.media };
  });

  // 2. Log the session with the uploaded proof
  app.post('/challenges/:id/logs', async (req, reply) => {
    const u = await requireUser(ctx, req);
    const { id } = parse(idParam, req.params);
    const body = parse(
      z.object({
        key: z.string().max(400),
        activity: z.string().trim().max(40).optional(),
        caption: z.string().trim().max(280).optional(),
        taskIds: z.array(z.number().int()).max(20).default([]),
      }),
      req.body,
    );
    if (u.status === 'under_review') throw new ApiError(403, 'under_review', 'Your account is under review. You can log again once it is cleared.');
    const prefix = `proofs/${id}/${u.id}/${await today(ctx)}/`;
    if (!body.key.startsWith(prefix) || body.key.includes('..')) throw badRequest('Upload a new photo or video taken today');
    const ext = body.key.split('.').pop()!;
    const type = Object.values(PROOF_TYPES).find((t) => t.ext === ext);
    if (!type) throw badRequest('Unsupported file type');
    if (!(await ctx.storage.exists(body.key))) throw badRequest('We could not find your upload. Try uploading again.');

    const logId = await guard(
      () =>
        tx(ctx.db, async (conn) => {
          const res = await exec(
            conn,
            'INSERT INTO session_logs (challenge_id, user_id, log_date, activity, caption, media_url, media_type) VALUES (?, ?, CURDATE(), ?, ?, ?, ?)',
            [id, u.id, body.activity ?? null, body.caption ?? null, body.key, type.media],
          );
          for (const taskId of new Set(body.taskIds)) await exec(conn, 'INSERT INTO task_checkins (session_log_id, task_id) VALUES (?, ?)', [res.insertId, taskId]);
          return res.insertId;
        }),
      "You've already logged today. Come back tomorrow.",
    );
    const stats = await one<{ current_streak: number; sessions_this_week: number; weekly_target: number }>(
      ctx.db,
      'SELECT current_streak, sessions_this_week, weekly_target FROM v_leaderboard WHERE challenge_id = ? AND user_id = ?',
      [id, u.id],
    );
    return reply.status(201).send({
      logId,
      streak: stats?.current_streak ?? 1,
      sessionsThisWeek: stats?.sessions_this_week ?? 1,
      weeklyTarget: stats?.weekly_target ?? null,
    });
  });

  app.get('/challenges/:id/leaderboard', async (req) => {
    const u = await requireUser(ctx, req);
    const { id } = parse(idParam, req.params);
    await requireInsider(ctx, id, u);
    return rows(
      ctx.db,
      `SELECT user_id AS userId, first_name AS firstName, week_no AS week, sessions_this_week AS sessionsThisWeek,
              weekly_target AS weeklyTarget, logged_today AS loggedToday, current_streak AS streak, best_streak AS bestStreak,
              at_risk AS atRisk, (user_id = ?) AS isMe
         FROM v_leaderboard WHERE challenge_id = ?
        ORDER BY sessions_this_week DESC, current_streak DESC, first_name`,
      [u.id, id],
    );
  });

  // Proof feed for a day (default today), with view links
  app.get('/challenges/:id/feed', async (req) => {
    const u = await requireUser(ctx, req);
    const { id } = parse(idParam, req.params);
    const { date } = parse(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }), req.query);
    await requireInsider(ctx, id, u);
    const logs = await rows<{ media_url: string; [k: string]: unknown }>(
      ctx.db,
      `SELECT l.id, l.user_id AS userId, u.first_name AS firstName, l.log_date AS date, l.logged_at AS loggedAt, l.activity, l.caption,
              l.media_url, l.media_type AS mediaType, l.status,
              EXISTS (SELECT 1 FROM proof_flags f WHERE f.session_log_id = l.id AND f.flagged_by = ?) AS flaggedByMe
         FROM session_logs l JOIN users u ON u.id = l.user_id
        WHERE l.challenge_id = ? AND l.log_date = COALESCE(?, CURDATE()) ORDER BY l.logged_at DESC`,
      [u.id, id, date ?? null],
    );
    return Promise.all(
      logs.map(async ({ media_url, ...l }) => ({ ...l, mediaUrl: await ctx.storage.viewUrl(media_url.replace(/^s3:\/\/[^/]+\//, '')) })),
    );
  });

  app.post('/logs/:id/flags', async (req, reply) => {
    const u = await requireUser(ctx, req);
    const { id } = parse(idParam, req.params);
    const body = parse(
      z.object({ reason: z.enum(['old_photo', 'not_a_workout', 'someone_else', 'other']), note: z.string().trim().max(280).optional() }),
      req.body,
    );
    const log = await one<{ challenge_id: number; user_id: number }>(ctx.db, 'SELECT challenge_id, user_id FROM session_logs WHERE id = ?', [id]);
    if (!log) throw notFound('Session not found');
    const res = await guard(
      () => exec(ctx.db, 'INSERT INTO proof_flags (session_log_id, flagged_by, reason, note) VALUES (?, ?, ?, ?)', [id, u.id, body.reason, body.note ?? null]),
      'You already flagged this session',
    );
    // Let the host know there is something to review
    const c = await one<{ instructor_id: number | null; created_by: number }>(ctx.db, 'SELECT instructor_id, created_by FROM challenges WHERE id = ?', [log.challenge_id]);
    const reviewer = c?.instructor_id ?? null;
    if (reviewer) await notify(ctx.db, reviewer, 'flag_raised', 'Proof flagged for review', 'A participant flagged a session in your programme.', { flagId: res.insertId });
    return reply.status(201).send({ flagId: res.insertId });
  });

  // Hosts see open flags for their challenge
  app.get('/challenges/:id/flags', async (req) => {
    const u = await requireUser(ctx, req);
    const { id } = parse(idParam, req.params);
    const a = await challengeAccess(ctx, id, u);
    if (!(a.isHost && (a.challenge.instructor_id === u.id || u.role === 'admin'))) throw forbidden('Only the instructor or FitCircle can review flags');
    return flagList(ctx, 'l.challenge_id = ?', [id]);
  });

  // Instructor of the challenge, or a FitCircle admin, decides a flag
  app.patch('/flags/:id', async (req) => {
    const u = await requireUser(ctx, req);
    const { id } = parse(idParam, req.params);
    const { decision } = parse(z.object({ decision: z.enum(['upheld', 'dismissed']) }), req.body);
    const f = await one<{ status: string; owner: number; instructor_id: number | null }>(
      ctx.db,
      `SELECT f.status, l.user_id AS owner, c.instructor_id FROM proof_flags f
         JOIN session_logs l ON l.id = f.session_log_id JOIN challenges c ON c.id = l.challenge_id WHERE f.id = ?`,
      [id],
    );
    if (!f) throw notFound('Flag not found');
    if (u.role !== 'admin' && f.instructor_id !== u.id) throw forbidden('Only the instructor or FitCircle can review flags');
    if (f.status !== 'open') throw new ApiError(409, 'conflict', 'This flag was already reviewed');
    await exec(ctx.db, 'UPDATE proof_flags SET status = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?', [decision, u.id, id]);
    await notify(
      ctx.db,
      f.owner,
      'flag_resolved',
      decision === 'upheld' ? 'A session did not count' : 'Your session counts',
      decision === 'upheld' ? 'A flag on your proof was upheld after review.' : 'A flag on your proof was reviewed and dismissed.',
    );
    return { ok: true };
  });

  // Nudge someone who hasn't logged today
  app.post('/challenges/:id/nudges', async (req, reply) => {
    const u = await requireUser(ctx, req);
    const { id } = parse(idParam, req.params);
    const body = parse(z.object({ toUserId: z.number().int(), message: z.string().trim().max(140).optional() }), req.body);
    const a = await challengeAccess(ctx, id, u);
    if (!a.isMember && !a.isHost) throw forbidden('Join this challenge first');
    if (a.challenge.status !== 'active') throw badRequest('Nudges work while a challenge is running');
    const target = await one<{ status: string; logged: number }>(
      ctx.db,
      `SELECT m.status, EXISTS (SELECT 1 FROM session_logs l WHERE l.challenge_id = m.challenge_id AND l.user_id = m.user_id AND l.log_date = CURDATE()) AS logged
         FROM challenge_members m WHERE m.challenge_id = ? AND m.user_id = ?`,
      [id, body.toUserId],
    );
    if (!target || target.status !== 'active') throw notFound('That person is not in this challenge');
    if (target.logged) throw badRequest('They already logged today');
    await guard(
      () => exec(ctx.db, 'INSERT INTO nudges (challenge_id, from_user_id, to_user_id, message) VALUES (?, ?, ?, ?)', [id, u.id, body.toUserId, body.message ?? null]),
      'You already nudged them today',
    );
    await notify(ctx.db, body.toUserId, 'nudge', `${u.first_name} nudged you`, body.message ?? 'Your circle is waiting. Log your session today.', { challengeId: id });
    return reply.status(201).send({ ok: true });
  });

  app.get('/challenges/:id/plans/today', async (req) => {
    const u = await requireUser(ctx, req);
    const { id } = parse(idParam, req.params);
    await requireInsider(ctx, id, u);
    const plan = await one<{ voice_note_url: string | null; [k: string]: unknown }>(
      ctx.db,
      'SELECT id, plan_date AS date, title, instructions, session_type AS sessionType, voice_note_url, sent_at AS sentAt FROM daily_plans WHERE challenge_id = ? AND plan_date = CURDATE()',
      [id],
    );
    if (!plan) return null;
    const { voice_note_url, ...rest } = plan;
    return { ...rest, voiceNoteUrl: voice_note_url ? await ctx.storage.viewUrl(voice_note_url) : null };
  });
}

export async function flagList(ctx: Ctx, where: string, params: unknown[]) {
  const flags = await rows<{ media_url: string; [k: string]: unknown }>(
    ctx.db,
    `SELECT f.id, f.reason, f.note, f.status, f.created_at AS createdAt, l.id AS logId, l.challenge_id AS challengeId,
            l.log_date AS date, l.activity, l.media_url, l.media_type AS mediaType,
            owner.id AS ownerId, owner.first_name AS ownerName, by_u.first_name AS flaggedByName
       FROM proof_flags f JOIN session_logs l ON l.id = f.session_log_id
       JOIN users owner ON owner.id = l.user_id JOIN users by_u ON by_u.id = f.flagged_by
      WHERE f.status = 'open' AND ${where} ORDER BY f.created_at`,
    params,
  );
  return Promise.all(flags.map(async ({ media_url, ...f }) => ({ ...f, mediaUrl: await ctx.storage.viewUrl(media_url.replace(/^s3:\/\/[^/]+\//, '')) })));
}
