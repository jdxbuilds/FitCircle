import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parse, requireUser, type Ctx } from '../app.js';
import { exec, one, rows, tx } from '../db.js';
import { guard } from '../lib/errors.js';

const GOALS = ['lose_weight', 'build_strength', 'run_10k', 'consistency', 'mental_toughness', 'feel_better'] as const;

export function meRoutes(app: FastifyInstance, ctx: Ctx) {
  app.get('/me', async (req) => {
    const u = await requireUser(ctx, req);
    const profile = await one(
      ctx.db,
      `SELECT id, first_name AS firstName, last_name AS lastName, phone, email, date_of_birth AS dateOfBirth,
              role, status, is_premium AS isPremium, terms_version AS termsVersion, terms_accepted_at AS termsAcceptedAt, created_at AS createdAt FROM users WHERE id = ?`,
      [u.id],
    );
    const goals = (await rows<{ goal: string }>(ctx.db, 'SELECT goal FROM user_goals WHERE user_id = ?', [u.id])).map((g) => g.goal);
    const instructor = await one(
      ctx.db,
      'SELECT display_name AS displayName, verification, verified_at AS verifiedAt FROM instructor_profiles WHERE user_id = ?',
      [u.id],
    );
    return { ...profile, age: u.age, canStake: u.age >= 18, goals, instructor: instructor ?? null };
  });

  app.patch('/me', async (req) => {
    const u = await requireUser(ctx, req);
    const body = parse(
      z.object({
        firstName: z.string().trim().min(1).max(80).optional(),
        lastName: z.string().trim().max(80).nullable().optional(),
        email: z.string().email().nullable().optional(),
        goals: z.array(z.enum(GOALS)).max(6).optional(),
      }),
      req.body,
    );
    await guard(
      () =>
        tx(ctx.db, async (conn) => {
          await exec(
            conn,
            `UPDATE users SET first_name = COALESCE(?, first_name),
                    last_name = IF(?, ?, last_name), email = IF(?, ?, email) WHERE id = ?`,
            [body.firstName ?? null, body.lastName !== undefined, body.lastName ?? null, body.email !== undefined, body.email ?? null, u.id],
          );
          if (body.goals) {
            await exec(conn, 'DELETE FROM user_goals WHERE user_id = ?', [u.id]);
            for (const g of new Set(body.goals)) await exec(conn, 'INSERT INTO user_goals (user_id, goal) VALUES (?, ?)', [u.id, g]);
          }
        }),
      'That email is already used by another account',
    );
    return { ok: true };
  });

  app.get('/notifications', async (req) => {
    const u = await requireUser(ctx, req);
    const { unread } = parse(z.object({ unread: z.enum(['1', '0']).optional() }), req.query);
    return rows(
      ctx.db,
      `SELECT id, type, title, body, data, read_at AS readAt, created_at AS createdAt FROM notifications
        WHERE user_id = ? ${unread === '1' ? 'AND read_at IS NULL' : ''} ORDER BY id DESC LIMIT 100`,
      [u.id],
    );
  });

  app.post('/notifications/read', async (req) => {
    const u = await requireUser(ctx, req);
    const { ids } = parse(z.object({ ids: z.array(z.number().int()).max(200).optional() }), req.body);
    if (ids?.length) await exec(ctx.db, 'UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL AND id IN (?)', [u.id, ids]);
    else await exec(ctx.db, 'UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL', [u.id]);
    return { ok: true };
  });
}
