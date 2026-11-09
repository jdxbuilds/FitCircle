import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { jwtVerify, SignJWT } from 'jose';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import type { Config } from './config.js';
import { one, type Db } from './db.js';
import { ApiError, fromDbError } from './lib/errors.js';
import type { Sms } from './lib/sms.js';
import type { Storage } from './lib/storage.js';
import type { Payments } from './payments/providers.js';
import { authRoutes } from './routes/auth.js';
import { meRoutes } from './routes/me.js';
import { challengeRoutes } from './routes/challenges.js';
import { paymentRoutes } from './routes/payments.js';
import { activityRoutes } from './routes/activity.js';
import { instructorRoutes } from './routes/instructor.js';
import { adminRoutes } from './routes/admin.js';
import { webhookRoutes } from './routes/webhooks.js';
import { jackpotRoutes } from './routes/jackpot.js';

export interface Ctx {
  config: Config;
  db: Db;
  sms: Sms;
  storage: Storage;
  payments: Payments;
}

export interface CurrentUser {
  id: number;
  first_name: string;
  phone: string;
  email: string | null;
  role: 'member' | 'instructor' | 'admin';
  status: 'active' | 'under_review' | 'suspended' | 'deleted';
  age: number;
}

declare module 'fastify' {
  interface FastifyRequest {
    tokenUserId: number | null;
    currentUser?: CurrentUser;
  }
}

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  return schema.parse(data ?? {});
}

export async function signToken(ctx: Ctx, claims: Record<string, unknown>, subject: string, ttl: string): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime(ttl)
    .setIssuer('fitcircle')
    .sign(new TextEncoder().encode(ctx.config.JWT_SECRET));
}

export async function verifyToken(ctx: Ctx, token: string, purpose: 'session' | 'signup') {
  const { payload } = await jwtVerify(token, new TextEncoder().encode(ctx.config.JWT_SECRET), { issuer: 'fitcircle' });
  if (payload.purpose !== purpose) throw new Error('wrong token purpose');
  return payload;
}

/** The signed-in user, or a 401. Suspended and deleted accounts are refused. */
export async function requireUser(ctx: Ctx, req: FastifyRequest): Promise<CurrentUser> {
  if (req.currentUser) return req.currentUser;
  if (!req.tokenUserId) throw new ApiError(401, 'unauthorized', 'Sign in to continue');
  const user = await one<CurrentUser & { [k: string]: unknown }>(
    ctx.db,
    `SELECT id, first_name, phone, email, role, status, TIMESTAMPDIFF(YEAR, date_of_birth, CURDATE()) AS age
       FROM users WHERE id = ?`,
    [req.tokenUserId],
  );
  if (!user || user.status === 'deleted') throw new ApiError(401, 'unauthorized', 'Sign in to continue');
  if (user.status === 'suspended') throw new ApiError(403, 'suspended', 'This account is suspended. Contact FitCircle support.');
  req.currentUser = user;
  return user;
}

export async function requireAdmin(ctx: Ctx, req: FastifyRequest): Promise<CurrentUser> {
  const user = await requireUser(ctx, req);
  if (user.role !== 'admin') throw new ApiError(403, 'forbidden', 'Admins only');
  return user;
}

export async function buildApp(ctx: Ctx): Promise<FastifyInstance> {
  const app = Fastify({
    logger: ctx.config.NODE_ENV === 'test' ? false : { level: 'info', redact: ['req.headers.authorization'] },
    trustProxy: true,
    bodyLimit: 256 * 1024,
  });

  if (ctx.config.RATE_LIMIT === 'on') await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });

  app.decorateRequest('tokenUserId', null);
  app.addHook('onRequest', async (req) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return;
    try {
      const payload = await verifyToken(ctx, header.slice(7), 'session');
      req.tokenUserId = Number(payload.sub);
    } catch {
      throw new ApiError(401, 'unauthorized', 'Your session has expired. Sign in again.');
    }
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      const first = err.issues[0];
      return reply.status(400).send({ error: { code: 'bad_request', message: `${first.path.join('.') || 'body'}: ${first.message}` } });
    }
    const api = err instanceof ApiError ? err : fromDbError(err);
    if (api) return reply.status(api.status).send({ error: { code: api.code, message: api.message } });
    if ((err as { statusCode?: number }).statusCode === 429)
      return reply.status(429).send({ error: { code: 'rate_limited', message: 'Too many requests. Try again in a minute.' } });
    req.log.error(err);
    return reply.status(500).send({ error: { code: 'server_error', message: 'Something went wrong on our side' } });
  });

  app.get('/health', async () => {
    await ctx.db.query('SELECT 1');
    return { ok: true };
  });

  authRoutes(app, ctx);
  meRoutes(app, ctx);
  challengeRoutes(app, ctx);
  paymentRoutes(app, ctx);
  activityRoutes(app, ctx);
  instructorRoutes(app, ctx);
  adminRoutes(app, ctx);
  webhookRoutes(app, ctx);
  jackpotRoutes(app, ctx);

  return app;
}
