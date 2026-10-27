import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parse, requireUser, type Ctx } from '../app.js';
import { exec, one } from '../db.js';
import { challengeAccess } from '../lib/access.js';
import { ApiError, badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { normalizeKenyanPhone } from '../lib/phone.js';
import { completePayment, failPayment } from '../payments/ledger.js';

export function paymentRoutes(app: FastifyInstance, ctx: Ctx) {
  // Pay a stake or an entry fee. M-Pesa sends a PIN prompt to the phone; Flutterwave returns a checkout link.
  app.post('/challenges/:id/payments', { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const u = await requireUser(ctx, req);
    const { id } = parse(z.object({ id: z.coerce.number().int() }), req.params);
    const body = parse(z.object({ provider: z.enum(['mpesa', 'flutterwave']), phone: z.string().optional() }), req.body);
    const a = await challengeAccess(ctx, id, u);
    const c = a.challenge;
    if (!a.isMember) throw forbidden('Join this challenge first');
    if (c.status !== 'enrolling') throw new ApiError(422, 'rule_violation', 'This challenge has already started. Stakes are locked.');
    if (a.amountPaid !== null) throw conflict('You have already paid for this challenge');
    const kind = c.type === 'instructor' ? 'entry_fee' : c.is_staked ? 'stake' : null;
    if (!kind) throw badRequest('This challenge runs without stakes. Nothing to pay.');
    if (kind === 'stake' && u.age < 18) throw new ApiError(422, 'rule_violation', 'Staked challenges are for ages 18 and up');
    const amount = Number(kind === 'stake' ? c.stake_amount : c.entry_fee);
    const phone = body.phone ? normalizeKenyanPhone(body.phone) : u.phone;
    if (!phone) throw badRequest('Enter a Kenyan mobile number, like 0712 345 678');

    // A new attempt replaces any earlier unfinished one.
    await exec(
      ctx.db,
      "UPDATE payments SET status = 'failed', failure_reason = 'Replaced by a new attempt', completed_at = NOW() WHERE user_id = ? AND challenge_id = ? AND status = 'pending'",
      [u.id, id],
    );
    const res = await exec(ctx.db, 'INSERT INTO payments (user_id, challenge_id, kind, provider, amount) VALUES (?, ?, ?, ?, ?)', [
      u.id,
      id,
      kind,
      body.provider,
      amount,
    ]);
    const paymentId = res.insertId;
    try {
      const out = await ctx.payments.collect({
        paymentId,
        provider: body.provider,
        amount,
        phone,
        name: u.first_name,
        email: u.email,
        description: kind === 'stake' ? 'FitCircle stake' : 'FitCircle entry',
      });
      await exec(ctx.db, 'UPDATE payments SET checkout_ref = ? WHERE id = ?', [out.checkoutRef, paymentId]);
      return reply.status(201).send({
        paymentId,
        status: 'pending',
        amount,
        checkoutUrl: out.checkoutUrl ?? null,
        message: body.provider === 'mpesa' ? `Check ${phone} and enter your M-Pesa PIN to pay KES ${amount}.` : 'Open the checkout link to pay by card.',
      });
    } catch (e) {
      req.log.error(e);
      await failPayment(ctx, paymentId, 'Could not reach the payment provider');
      throw new ApiError(502, 'payment_provider_error', 'We could not start the payment. Try again in a moment.');
    }
  });

  app.get('/payments/:id', async (req) => {
    const u = await requireUser(ctx, req);
    const { id } = parse(z.object({ id: z.coerce.number().int() }), req.params);
    const p = await one(
      ctx.db,
      `SELECT id, challenge_id AS challengeId, kind, provider, amount, currency, status, provider_ref AS receipt,
              failure_reason AS failureReason, created_at AS createdAt, completed_at AS completedAt
         FROM payments WHERE id = ? AND user_id = ?`,
      [id, u.id],
    );
    if (!p) throw notFound('Payment not found');
    return p;
  });

  // Development only: pretend the person entered their PIN.
  if (ctx.payments.isFake && ctx.config.NODE_ENV !== 'production') {
    app.post('/dev/payments/:id/complete', async (req) => {
      const u = await requireUser(ctx, req);
      const { id } = parse(z.object({ id: z.coerce.number().int() }), req.params);
      const p = await one<{ amount: number }>(ctx.db, 'SELECT amount FROM payments WHERE id = ? AND user_id = ?', [id, u.id]);
      if (!p) throw notFound('Payment not found');
      return { result: await completePayment(ctx, id, `DEV${id}`, p.amount) };
    });
  }
}
