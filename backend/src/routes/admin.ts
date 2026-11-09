import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parse, requireAdmin, type Ctx } from '../app.js';
import { exec, one, rows } from '../db.js';
import { notify } from '../lib/access.js';
import { ApiError, guard, notFound } from '../lib/errors.js';
import { flagList } from './activity.js';

const idParam = z.object({ id: z.coerce.number().int() });

/** Tools for the FitCircle team: instructor verification, flag review, account status, manual settlement. */
export function adminRoutes(app: FastifyInstance, ctx: Ctx) {
  app.get('/admin/instructors', async (req) => {
    await requireAdmin(ctx, req);
    const { verification } = parse(z.object({ verification: z.enum(['pending', 'verified', 'rejected']).default('pending') }), req.query);
    const people = await rows<{ userId: number; [k: string]: unknown }>(
      ctx.db,
      `SELECT ip.user_id AS userId, ip.display_name AS displayName, ip.bio, ip.specialties, ip.verification, u.phone, ip.created_at AS appliedAt
         FROM instructor_profiles ip JOIN users u ON u.id = ip.user_id WHERE ip.verification = ? ORDER BY ip.created_at`,
      [verification],
    );
    return Promise.all(
      people.map(async (p) => {
        const docs = await rows<{ file_url: string; [k: string]: unknown }>(
          ctx.db,
          'SELECT id, doc_type AS docType, status, file_url, uploaded_at AS uploadedAt FROM instructor_documents WHERE instructor_id = ?',
          [p.userId],
        );
        return { ...p, documents: await Promise.all(docs.map(async ({ file_url, ...d }) => ({ ...d, viewUrl: await ctx.storage.viewUrl(file_url) }))) };
      }),
    );
  });

  app.post('/admin/instructor-documents/:id/review', async (req) => {
    const admin = await requireAdmin(ctx, req);
    const { id } = parse(idParam, req.params);
    const { status } = parse(z.object({ status: z.enum(['approved', 'rejected']) }), req.body);
    const res = await exec(ctx.db, 'UPDATE instructor_documents SET status = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?', [status, admin.id, id]);
    if (!res.affectedRows) throw notFound('Document not found');
    return { ok: true };
  });

  // Verify (all three documents must be approved; the database checks) or reject
  app.post('/admin/instructors/:id/decision', async (req) => {
    await requireAdmin(ctx, req);
    const { id } = parse(idParam, req.params);
    const { decision } = parse(z.object({ decision: z.enum(['verified', 'rejected']) }), req.body);
    const p = await one(ctx.db, 'SELECT user_id FROM instructor_profiles WHERE user_id = ?', [id]);
    if (!p) throw notFound('Instructor not found');
    await guard(() => exec(ctx.db, 'UPDATE instructor_profiles SET verification = ? WHERE user_id = ?', [decision, id]));
    if (decision === 'verified') {
      await exec(ctx.db, "UPDATE users SET role = 'instructor' WHERE id = ? AND role = 'member'", [id]);
      await notify(ctx.db, id, 'account_review', "You're verified", 'You can now create paid challenges on FitCircle.');
    } else {
      await notify(ctx.db, id, 'account_review', 'Verification not approved', 'Check your documents and upload them again.');
    }
    return { ok: true };
  });

  app.get('/admin/flags', async (req) => {
    await requireAdmin(ctx, req);
    return flagList(ctx, '1 = 1', []);
  });

  app.get('/admin/users/under-review', async (req) => {
    await requireAdmin(ctx, req);
    return rows(
      ctx.db,
      `SELECT u.id, u.first_name AS firstName, u.phone,
              (SELECT COUNT(*) FROM proof_flags f JOIN session_logs l ON l.id = f.session_log_id WHERE l.user_id = u.id AND f.status = 'open') AS openFlags,
              (SELECT COUNT(*) FROM proof_flags f JOIN session_logs l ON l.id = f.session_log_id WHERE l.user_id = u.id AND f.status = 'upheld') AS upheldFlags
         FROM users u WHERE u.status = 'under_review'`,
    );
  });

  app.post('/admin/users/:id/status', async (req) => {
    await requireAdmin(ctx, req);
    const { id } = parse(idParam, req.params);
    const { status } = parse(z.object({ status: z.enum(['active', 'under_review', 'suspended']) }), req.body);
    const res = await exec(ctx.db, "UPDATE users SET status = ? WHERE id = ? AND status <> 'deleted'", [status, id]);
    if (!res.affectedRows) throw notFound('User not found');
    return { ok: true };
  });

  // Sponsors pay for jackpot prizes
  app.post('/admin/sponsors', async (req, reply) => {
    await requireAdmin(ctx, req);
    const b = parse(
      z.object({
        name: z.string().trim().min(2).max(160),
        contactName: z.string().trim().max(120).optional(),
        contactPhone: z.string().trim().max(20).optional(),
        contactEmail: z.string().email().optional(),
      }),
      req.body,
    );
    const res = await guard(
      () => exec(ctx.db, 'INSERT INTO sponsors (name, contact_name, contact_phone, contact_email) VALUES (?, ?, ?, ?)', [b.name, b.contactName ?? null, b.contactPhone ?? null, b.contactEmail ?? null]),
      'A sponsor with that name already exists',
    );
    return reply.status(201).send({ id: res.insertId });
  });

  app.get('/admin/sponsors', async (req) => {
    await requireAdmin(ctx, req);
    return rows(
      ctx.db,
      `SELECT s.id, s.name, s.contact_name AS contactName, s.contact_phone AS contactPhone, s.contact_email AS contactEmail,
              (SELECT COUNT(*) FROM monthly_jackpots j WHERE j.sponsor_id = s.id) AS jackpots
         FROM sponsors s ORDER BY s.name`,
    );
  });

  // One FitCircle-wide jackpot per calendar month, paid for by a sponsor
  const monthParam = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM') });

  app.put('/admin/jackpots/:month', async (req) => {
    await requireAdmin(ctx, req);
    const { month } = parse(monthParam, req.params);
    const b = parse(z.object({ sponsorId: z.number().int(), prize: z.string().trim().min(3).max(200), valueKes: z.number().nonnegative().max(10_000_000).optional() }), req.body);
    const awarded = await one(ctx.db, 'SELECT 1 FROM jackpot_awards WHERE month = ?', [`${month}-01`]);
    if (awarded) throw new ApiError(409, 'conflict', "That month's jackpot has already been awarded");
    await guard(() =>
      exec(
        ctx.db,
        `INSERT INTO monthly_jackpots (month, sponsor_id, prize, prize_value) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE sponsor_id = VALUES(sponsor_id), prize = VALUES(prize), prize_value = VALUES(prize_value)`,
        [`${month}-01`, b.sponsorId, b.prize, b.valueKes ?? null],
      ),
    );
    return { ok: true };
  });

  app.get('/admin/jackpots', async (req) => {
    await requireAdmin(ctx, req);
    return rows(
      ctx.db,
      `SELECT DATE_FORMAT(j.month, '%Y-%m') AS month, s.name AS sponsor, j.prize, j.prize_value AS prizeValue,
              u.first_name AS winnerName, u.phone AS winnerPhone, a.sessions, a.decided_by AS decidedBy,
              a.awarded_at AS awardedAt, a.fulfilled_at AS fulfilledAt
         FROM monthly_jackpots j JOIN sponsors s ON s.id = j.sponsor_id
         LEFT JOIN jackpot_awards a ON a.month = j.month LEFT JOIN users u ON u.id = a.user_id
        ORDER BY j.month DESC`,
    );
  });

  // Normally the nightly job awards last month's jackpot on the 1st; this is the manual switch
  app.post('/admin/jackpots/:month/award', async (req) => {
    await requireAdmin(ctx, req);
    const { month } = parse(monthParam, req.params);
    await guard(() => ctx.db.query('CALL award_monthly_jackpot(?)', [`${month}-01`]));
    return one(ctx.db, 'SELECT user_id AS userId, sessions, best_streak AS bestStreak, decided_by AS decidedBy FROM jackpot_awards WHERE month = ?', [`${month}-01`]);
  });

  app.post('/admin/jackpots/:month/fulfilled', async (req) => {
    await requireAdmin(ctx, req);
    const { month } = parse(monthParam, req.params);
    const res = await exec(ctx.db, 'UPDATE jackpot_awards SET fulfilled_at = NOW() WHERE month = ? AND fulfilled_at IS NULL', [`${month}-01`]);
    if (!res.affectedRows) throw notFound('No undelivered jackpot for that month');
    return { ok: true };
  });

  app.post('/admin/challenges/:id/settle', async (req) => {
    await requireAdmin(ctx, req);
    const { id } = parse(idParam, req.params);
    await guard(() => ctx.db.query('CALL settle_challenge(?)', [id]));
    return one(ctx.db, 'SELECT * FROM settlements WHERE challenge_id = ?', [id]);
  });
}
