import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parse, signToken, verifyToken, type Ctx } from '../app.js';
import { exec, one, rows, tx } from '../db.js';
import { ApiError, badRequest, guard } from '../lib/errors.js';
import { normalizeKenyanPhone } from '../lib/phone.js';

const GOALS = ['lose_weight', 'build_strength', 'run_10k', 'consistency', 'mental_toughness', 'feel_better'] as const;
const phoneField = z.string().transform((v, c) => {
  const p = normalizeKenyanPhone(v);
  if (!p) c.addIssue({ code: 'custom', message: 'Enter a Kenyan mobile number, like 0712 345 678' });
  return p ?? '';
});

const hashCode = (ctx: Ctx, phone: string, code: string) =>
  createHash('sha256').update(`${phone}:${code}:${ctx.config.JWT_SECRET}`).digest('hex');

export const sessionToken = (ctx: Ctx, userId: number) => signToken(ctx, { purpose: 'session' }, String(userId), '30d');

export function authRoutes(app: FastifyInstance, ctx: Ctx) {
  // Step 1: text a 6-digit code
  app.post('/auth/otp', { config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } }, async (req) => {
    const { phone } = parse(z.object({ phone: phoneField }), req.body);
    const recent = await one<{ n: number }>(
      ctx.db,
      'SELECT COUNT(*) AS n FROM otp_codes WHERE phone = ? AND created_at > NOW() - INTERVAL 10 MINUTE',
      [phone],
    );
    if ((recent?.n ?? 0) >= 3) throw new ApiError(429, 'rate_limited', 'Too many codes requested. Wait 10 minutes and try again.');

    const code = String(randomInt(100000, 1000000));
    await exec(ctx.db, 'INSERT INTO otp_codes (phone, code_hash, expires_at) VALUES (?, ?, NOW() + INTERVAL 10 MINUTE)', [
      phone,
      hashCode(ctx, phone, code),
    ]);
    await ctx.sms.send(phone, `Your FitCircle code is ${code}. It expires in 10 minutes.`);
    // With console SMS (development) the code is returned so the app can be tested without a phone.
    return { sent: true, phone, ...(ctx.sms.isConsole && ctx.config.NODE_ENV !== 'production' ? { devCode: code } : {}) };
  });

  // Step 2: check the code. Existing users get a session; new numbers get a short sign-up token.
  app.post('/auth/verify', { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, async (req) => {
    const { phone, code } = parse(z.object({ phone: phoneField, code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code') }), req.body);
    const otp = await one<{ id: number; code_hash: string; attempts: number }>(
      ctx.db,
      `SELECT id, code_hash, attempts FROM otp_codes
        WHERE phone = ? AND used_at IS NULL AND expires_at > NOW() ORDER BY id DESC LIMIT 1`,
      [phone],
    );
    if (!otp) throw badRequest('That code has expired. Request a new one.');
    if (otp.attempts >= 5) throw new ApiError(429, 'rate_limited', 'Too many wrong attempts. Request a new code.');
    const ok = timingSafeEqual(Buffer.from(otp.code_hash), Buffer.from(hashCode(ctx, phone, code)));
    if (!ok) {
      await exec(ctx.db, 'UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?', [otp.id]);
      throw badRequest('That code is not right. Check the SMS and try again.');
    }
    await exec(ctx.db, 'UPDATE otp_codes SET used_at = NOW() WHERE id = ?', [otp.id]);

    const user = await one<{ id: number; status: string }>(ctx.db, 'SELECT id, status FROM users WHERE phone = ?', [phone]);
    if (user && user.status !== 'deleted') return { isNewUser: false, token: await sessionToken(ctx, user.id) };
    return { isNewUser: true, signupToken: await signToken(ctx, { purpose: 'signup', phone }, phone, '30m') };
  });

  // Current terms versions (the app shows the text and sends acceptance with sign-up / instructor application)
  app.get('/terms', async () => {
    const r = await rows<{ setting_key: string; setting_value: string }>(
      ctx.db,
      "SELECT setting_key, setting_value FROM platform_settings WHERE setting_key IN ('terms_version_member', 'terms_version_instructor')",
    );
    const v = Object.fromEntries(r.map((x) => [x.setting_key, x.setting_value]));
    return { member: v.terms_version_member, instructor: v.terms_version_instructor };
  });

  // Step 3 (new users): create the profile
  app.post('/auth/signup', async (req) => {
    const body = parse(
      z.object({
        signupToken: z.string(),
        firstName: z.string().trim().min(1).max(80),
        lastName: z.string().trim().max(80).optional(),
        email: z.string().email().optional(),
        dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
        goals: z.array(z.enum(GOALS)).max(6).default([]),
        acceptTerms: z.literal(true, { errorMap: () => ({ message: 'Read and accept the member terms to continue' }) }),
      }),
      req.body,
    );
    let phone: string;
    try {
      phone = String((await verifyToken(ctx, body.signupToken, 'signup')).phone);
    } catch {
      throw new ApiError(401, 'unauthorized', 'Your sign-up session expired. Verify your number again.');
    }
    const userId = await guard(
      () =>
        tx(ctx.db, async (conn) => {
          const res = await exec(
            conn,
            `INSERT INTO users (first_name, last_name, phone, email, date_of_birth, terms_version, terms_accepted_at)
             VALUES (?, ?, ?, ?, ?, (SELECT setting_value FROM platform_settings WHERE setting_key = 'terms_version_member'), NOW())`,
            [body.firstName, body.lastName ?? null, phone, body.email ?? null, body.dateOfBirth],
          );
          for (const g of new Set(body.goals)) await exec(conn, 'INSERT INTO user_goals (user_id, goal) VALUES (?, ?)', [res.insertId, g]);
          return res.insertId;
        }),
      'An account with this phone number or email already exists',
    );
    return { token: await sessionToken(ctx, userId), userId };
  });
}
