import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parse, requireAdmin, type Ctx } from '../app.js';
import { exec, one, rows } from '../db.js';
import { notify } from '../lib/access.js';
import { guard, notFound } from '../lib/errors.js';
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
              (SELECT COUNT(*) FROM challenges c WHERE c.sponsor_id = s.id) AS jackpots
         FROM sponsors s ORDER BY s.name`,
    );
  });

  // Attach a sponsor's prize to a challenge before it is settled
  app.put('/admin/challenges/:id/jackpot', async (req) => {
    await requireAdmin(ctx, req);
    const { id } = parse(idParam, req.params);
    const b = parse(z.object({ sponsorId: z.number().int(), prize: z.string().trim().min(3).max(200), valueKes: z.number().nonnegative().max(10_000_000).optional() }), req.body);
    const res = await guard(() =>
      exec(ctx.db, "UPDATE challenges SET sponsor_id = ?, jackpot_prize = ?, jackpot_value = ? WHERE id = ? AND status IN ('draft', 'enrolling', 'active')", [b.sponsorId, b.prize, b.valueKes ?? null, id]),
    );
    if (!res.affectedRows) throw notFound('No open challenge with that id');
    return { ok: true };
  });

  // Unclaimed jackpots, and marking one as delivered by the sponsor
  app.get('/admin/jackpots', async (req) => {
    await requireAdmin(ctx, req);
    return rows(
      ctx.db,
      `SELECT a.challenge_id AS challengeId, c.title, s.name AS sponsor, a.prize, u.first_name AS winnerName, u.phone AS winnerPhone,
              a.decided_by AS decidedBy, a.awarded_at AS awardedAt, a.fulfilled_at AS fulfilledAt
         FROM jackpot_awards a JOIN challenges c ON c.id = a.challenge_id JOIN sponsors s ON s.id = a.sponsor_id JOIN users u ON u.id = a.user_id
        ORDER BY a.fulfilled_at IS NULL DESC, a.awarded_at DESC`,
    );
  });

  app.post('/admin/jackpots/:id/fulfilled', async (req) => {
    await requireAdmin(ctx, req);
    const { id } = parse(idParam, req.params);
    const res = await exec(ctx.db, 'UPDATE jackpot_awards SET fulfilled_at = NOW() WHERE challenge_id = ? AND fulfilled_at IS NULL', [id]);
    if (!res.affectedRows) throw notFound('No undelivered jackpot for that challenge');
    return { ok: true };
  });

  app.post('/admin/challenges/:id/settle', async (req) => {
    await requireAdmin(ctx, req);
    const { id } = parse(idParam, req.params);
    await guard(() => ctx.db.query('CALL settle_challenge(?)', [id]));
    return one(ctx.db, 'SELECT * FROM settlements WHERE challenge_id = ?', [id]);
  });
}
