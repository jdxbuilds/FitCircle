import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Ctx } from '../app.js';
import { exec, one } from '../db.js';
import { notify } from '../lib/access.js';
import { completePayment, failPayment } from '../payments/ledger.js';

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

interface StkCallback {
  Body?: {
    stkCallback?: {
      CheckoutRequestID: string;
      ResultCode: number;
      ResultDesc: string;
      CallbackMetadata?: { Item: { Name: string; Value?: string | number }[] };
    };
  };
}

interface B2cResult {
  Result?: { ResultCode: number; ResultDesc: string; OriginatorConversationID: string; TransactionID?: string };
}

/**
 * Callbacks from Safaricom and Flutterwave. They carry no user session:
 * M-Pesa URLs include a secret token, Flutterwave sends a secret hash header,
 * and every Flutterwave charge is re-verified with Flutterwave before it counts.
 */
export function webhookRoutes(app: FastifyInstance, ctx: Ctx) {
  const tokenOk = (token: string) => same(token, ctx.config.MPESA_CALLBACK_TOKEN);
  const accepted = (reply: FastifyReply) => reply.send({ ResultCode: 0, ResultDesc: 'Accepted' });

  app.post<{ Params: { token: string }; Body: StkCallback }>('/webhooks/mpesa/stk/:token', { config: { rateLimit: false } }, async (req, reply) => {
    if (!tokenOk(req.params.token)) return reply.status(404).send();
    const cb = req.body?.Body?.stkCallback;
    if (!cb) return accepted(reply);
    const p = await one<{ id: number }>(ctx.db, "SELECT id FROM payments WHERE provider = 'mpesa' AND checkout_ref = ?", [cb.CheckoutRequestID]);
    if (!p) return accepted(reply);
    if (cb.ResultCode === 0) {
      const item = (n: string) => cb.CallbackMetadata?.Item.find((i) => i.Name === n)?.Value;
      await completePayment(ctx, p.id, String(item('MpesaReceiptNumber') ?? cb.CheckoutRequestID), Number(item('Amount') ?? 0));
    } else {
      // 1032 = cancelled by user, 1037 = phone unreachable, 2001 = wrong PIN
      await failPayment(ctx, p.id, cb.ResultDesc);
    }
    return accepted(reply);
  });

  app.post<{ Params: { token: string }; Body: B2cResult }>('/webhooks/mpesa/b2c/:token', { config: { rateLimit: false } }, async (req, reply) => {
    if (!tokenOk(req.params.token)) return reply.status(404).send();
    const r = req.body?.Result;
    const match = r?.OriginatorConversationID?.match(/^fcpo-(\d+)$/);
    if (!r || !match) return accepted(reply);
    const payoutId = Number(match[1]);
    if (r.ResultCode === 0) {
      const res = await exec(
        ctx.db,
        "UPDATE payouts SET status = 'sent', sent_at = NOW(), provider_ref = ? WHERE id = ? AND status = 'processing'",
        [r.TransactionID ?? r.OriginatorConversationID, payoutId],
      );
      const po = await one<{ user_id: number; amount: number }>(ctx.db, 'SELECT user_id, amount FROM payouts WHERE id = ?', [payoutId]);
      if (res.affectedRows && po) await notify(ctx.db, po.user_id, 'payout_sent', 'Money sent', `KES ${po.amount} is on its way to your M-Pesa.`);
    } else {
      await exec(ctx.db, "UPDATE payouts SET status = 'failed', failure_reason = ? WHERE id = ? AND status = 'processing'", [
        r.ResultDesc.slice(0, 255),
        payoutId,
      ]);
    }
    return accepted(reply);
  });

  app.post<{ Params: { token: string } }>('/webhooks/mpesa/b2c-timeout/:token', { config: { rateLimit: false } }, async (req, reply) => {
    if (!tokenOk(req.params.token)) return reply.status(404).send();
    // Leave the payout in 'processing'; ops can check it in the M-Pesa portal. A retry could pay twice.
    req.log.warn({ body: req.body }, 'M-Pesa B2C timeout');
    return accepted(reply);
  });

  app.post<{ Body: { event?: string; data?: { id?: number; tx_ref?: string } } }>(
    '/webhooks/flutterwave',
    { config: { rateLimit: false } },
    async (req, reply) => {
      const hash = String(req.headers['verif-hash'] ?? '');
      if (!ctx.config.FLW_WEBHOOK_HASH || !same(hash, ctx.config.FLW_WEBHOOK_HASH)) return reply.status(401).send();
      const d = req.body?.data;
      const match = d?.tx_ref?.match(/^fc-pay-(\d+)$/);
      if (!d?.id || !match) return reply.send({ ok: true });
      const paymentId = Number(match[1]);
      const v = await ctx.payments.verifyFlutterwave(String(d.id));
      if (v.txRef !== d.tx_ref || v.currency !== 'KES') {
        req.log.warn({ paymentId, v }, 'Flutterwave verification mismatch');
        return reply.send({ ok: true });
      }
      if (v.successful) await completePayment(ctx, paymentId, v.providerRef, v.amount);
      else await failPayment(ctx, paymentId, 'Card payment was not completed');
      return reply.send({ ok: true });
    },
  );
}
