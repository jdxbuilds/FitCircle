import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parse, requireUser, type Ctx } from '../app.js';
import { exec, one, rows } from '../db.js';
import { challengeAccess } from '../lib/access.js';
import { badRequest, conflict, forbidden, guard, notFound } from '../lib/errors.js';
import { normalizeKenyanPhone } from '../lib/phone.js';
import { DOC_TYPES } from '../lib/storage.js';

const DOC_KINDS = ['certification', 'national_id', 'demo_video'] as const;

export function instructorRoutes(app: FastifyInstance, ctx: Ctx) {
  // Apply to become an instructor
  app.post('/instructor/profile', async (req, reply) => {
    const u = await requireUser(ctx, req);
    const body = parse(
      z.object({
        displayName: z.string().trim().min(2).max(120),
        bio: z.string().trim().max(2000).optional(),
        specialties: z.string().trim().max(255).optional(),
        payoutPhone: z.string().optional(),
        acceptInstructorTerms: z.literal(true, { errorMap: () => ({ message: 'Read and accept the instructor terms to continue' }) }),
      }),
      req.body,
    );
    const payoutPhone = body.payoutPhone ? normalizeKenyanPhone(body.payoutPhone) : u.phone;
    if (!payoutPhone) throw badRequest('Enter a Kenyan mobile number for payouts');
    await exec(
      ctx.db,
      `INSERT INTO instructor_profiles (user_id, display_name, bio, specialties, payout_phone, terms_version, terms_accepted_at)
       VALUES (?, ?, ?, ?, ?, (SELECT setting_value FROM platform_settings WHERE setting_key = 'terms_version_instructor'), NOW())
       ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), bio = VALUES(bio), specialties = VALUES(specialties),
                               payout_phone = VALUES(payout_phone), terms_version = VALUES(terms_version), terms_accepted_at = NOW()`,
      [u.id, body.displayName, body.bio ?? null, body.specialties ?? null, payoutPhone],
    );
    return reply.status(201).send({ ok: true });
  });

  // Upload tickets for verification documents and voice notes
  app.post('/instructor/uploads', async (req) => {
    const u = await requireUser(ctx, req);
    const body = parse(
      z.object({ purpose: z.enum([...DOC_KINDS, 'voice_note']), contentType: z.enum(Object.keys(DOC_TYPES) as [string, ...string[]]) }),
      req.body,
    );
    const profile = await one(ctx.db, 'SELECT user_id FROM instructor_profiles WHERE user_id = ?', [u.id]);
    if (!profile) throw badRequest('Create your instructor profile first');
    const t = DOC_TYPES[body.contentType];
    const folder = body.purpose === 'voice_note' ? 'voice' : 'docs';
    const key = `${folder}/${u.id}/${body.purpose}/${randomUUID()}.${t.ext}`;
    return ctx.storage.presignUpload(key, body.contentType, t.maxBytes);
  });

  app.post('/instructor/documents', async (req, reply) => {
    const u = await requireUser(ctx, req);
    const body = parse(z.object({ docType: z.enum(DOC_KINDS), key: z.string().max(400) }), req.body);
    if (!body.key.startsWith(`docs/${u.id}/${body.docType}/`)) throw badRequest('Upload the document first');
    const profile = await one<{ verification: string }>(ctx.db, 'SELECT verification FROM instructor_profiles WHERE user_id = ?', [u.id]);
    if (!profile) throw badRequest('Create your instructor profile first');
    if (profile.verification === 'verified') throw conflict('You are already verified');
    if (!(await ctx.storage.exists(body.key))) throw badRequest('We could not find your upload. Try again.');
    await exec(
      ctx.db,
      `INSERT INTO instructor_documents (instructor_id, doc_type, file_url) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE file_url = VALUES(file_url), status = 'pending', reviewed_by = NULL, reviewed_at = NULL, uploaded_at = NOW()`,
      [u.id, body.docType, body.key],
    );
    return reply.status(201).send({ ok: true });
  });

  app.get('/instructor/dashboard', async (req) => {
    const u = await requireUser(ctx, req);
    const profile = await one(
      ctx.db,
      'SELECT display_name AS displayName, verification, verified_at AS verifiedAt, payout_phone AS payoutPhone FROM instructor_profiles WHERE user_id = ?',
      [u.id],
    );
    if (!profile) throw notFound('You do not have an instructor profile yet');
    const documents = await rows(ctx.db, 'SELECT doc_type AS docType, status, uploaded_at AS uploadedAt FROM instructor_documents WHERE instructor_id = ?', [u.id]);
    const programmes = await rows(
      ctx.db,
      `SELECT challenge_id AS challengeId, title, status, start_date AS startDate, end_date AS endDate, participants,
              fees_collected AS feesCollected, instructor_share AS yourShare, logged_today AS loggedToday, at_risk AS atRisk, open_flags AS openFlags
         FROM v_instructor_dashboard WHERE instructor_id = ? ORDER BY FIELD(status, 'active', 'enrolling', 'draft', 'settled', 'cancelled'), start_date DESC`,
      [u.id],
    );
    const monthly = await rows(
      ctx.db,
      `SELECT DATE_FORMAT(scheduled_for, '%Y-%m') AS month, SUM(amount) AS amount FROM payouts
        WHERE user_id = ? AND kind = 'instructor_earning' GROUP BY month ORDER BY month DESC LIMIT 12`,
      [u.id],
    );
    const payouts = await rows(
      ctx.db,
      `SELECT p.id, p.challenge_id AS challengeId, c.title, p.amount, p.status, p.scheduled_for AS scheduledFor, p.sent_at AS sentAt
         FROM payouts p JOIN challenges c ON c.id = p.challenge_id
        WHERE p.user_id = ? AND p.kind = 'instructor_earning' ORDER BY p.scheduled_for DESC LIMIT 20`,
      [u.id],
    );
    const totals = await one<{ earned: number; pending: number }>(
      ctx.db,
      `SELECT COALESCE((SELECT SUM(amount) FROM payouts WHERE user_id = ? AND kind = 'instructor_earning'), 0) AS earned,
              COALESCE((SELECT SUM(instructor_share) FROM v_instructor_dashboard WHERE instructor_id = ? AND status IN ('enrolling', 'active')), 0) AS pending`,
      [u.id, u.id],
    );
    return { profile, documents, programmes, earnings: { ...totals, monthly }, payouts };
  });

  // Post today's plan (or a future day's) to everyone in the programme
  app.post('/challenges/:id/plans', async (req, reply) => {
    const u = await requireUser(ctx, req);
    const { id } = parse(z.object({ id: z.coerce.number().int() }), req.params);
    const body = parse(
      z.object({
        planDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        title: z.string().trim().min(2).max(120),
        instructions: z.string().trim().max(4000).optional(),
        sessionType: z.enum(['run', 'strength', 'hiit', 'mobility', 'rest']),
        voiceNoteKey: z.string().max(400).optional(),
      }),
      req.body,
    );
    const a = await challengeAccess(ctx, id, u);
    if (a.challenge.instructor_id !== u.id) throw forbidden('Only the instructor can post plans');
    if (!['enrolling', 'active'].includes(a.challenge.status)) throw badRequest('This programme has finished');
    if (body.voiceNoteKey && !body.voiceNoteKey.startsWith(`voice/${u.id}/`)) throw badRequest('Upload the voice note first');
    await guard(() =>
      exec(
        ctx.db,
        `INSERT INTO daily_plans (challenge_id, plan_date, title, instructions, session_type, voice_note_url, sent_at)
         VALUES (?, COALESCE(?, CURDATE()), ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE title = VALUES(title), instructions = VALUES(instructions), session_type = VALUES(session_type),
                                 voice_note_url = VALUES(voice_note_url), sent_at = NOW()`,
        [id, body.planDate ?? null, body.title, body.instructions ?? null, body.sessionType, body.voiceNoteKey ?? null],
      ),
    );
    const sent = await exec(
      ctx.db,
      `INSERT INTO notifications (user_id, type, title, body, data)
       SELECT user_id, 'daily_plan', ?, ?, JSON_OBJECT('challengeId', ?) FROM challenge_members WHERE challenge_id = ? AND status = 'active'`,
      [`Today: ${body.title}`, (body.instructions ?? '').slice(0, 280) || null, id, id],
    );
    return reply.status(201).send({ sentTo: sent.affectedRows });
  });
}
