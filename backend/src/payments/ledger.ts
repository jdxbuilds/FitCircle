import type { Ctx } from '../app.js';
import { exec, one } from '../db.js';
import { notify } from '../lib/access.js';

interface PaymentRow {
  id: number;
  user_id: number;
  challenge_id: number | null;
  kind: string;
  amount: number;
  status: string;
}

/**
 * Records a confirmed payment. Safe to call twice (providers retry callbacks).
 * If the person can no longer take part (the challenge started, or they left),
 * the money is refunded instead of locked.
 */
export async function completePayment(ctx: Ctx, paymentId: number, providerRef: string, amountReceived: number): Promise<'succeeded' | 'failed' | 'ignored'> {
  const p = await one<PaymentRow>(ctx.db, 'SELECT id, user_id, challenge_id, kind, amount, status FROM payments WHERE id = ?', [paymentId]);
  if (!p || p.status !== 'pending') return 'ignored';
  if (amountReceived < p.amount) {
    await failPayment(ctx, paymentId, `Received KES ${amountReceived}, expected KES ${p.amount}`);
    return 'failed';
  }
  const res = await exec(
    ctx.db,
    "UPDATE payments SET status = 'succeeded', provider_ref = ?, completed_at = NOW() WHERE id = ? AND status = 'pending'",
    [providerRef, paymentId],
  );
  if (res.affectedRows === 0) return 'ignored';

  if (p.challenge_id && (p.kind === 'stake' || p.kind === 'entry_fee')) {
    const state = await one<{ cstatus: string; mstatus: string | null }>(
      ctx.db,
      `SELECT c.status AS cstatus, m.status AS mstatus FROM challenges c
         LEFT JOIN challenge_members m ON m.challenge_id = c.id AND m.user_id = ? WHERE c.id = ?`,
      [p.user_id, p.challenge_id],
    );
    if (state?.cstatus !== 'enrolling' || state.mstatus !== 'active') {
      await exec(ctx.db, "INSERT INTO payouts (user_id, challenge_id, kind, amount, scheduled_for) VALUES (?, ?, 'refund', ?, CURDATE())", [
        p.user_id,
        p.challenge_id,
        amountReceived,
      ]);
      await notify(ctx.db, p.user_id, 'payout_sent', 'Payment refunded', `The challenge had already started, so your KES ${amountReceived} is on its way back.`);
      return 'succeeded';
    }
    const title = p.kind === 'stake' ? 'Stake locked' : "You're in";
    const body = p.kind === 'stake'
      ? `KES ${p.amount} is in the Jackpot. The only way to get it back is to show up.`
      : 'Your entry fee is paid. Your coach will send the first plan on day one.';
    await notify(ctx.db, p.user_id, 'stake_locked', title, body, { challengeId: p.challenge_id, paymentId });
  }
  return 'succeeded';
}

export async function failPayment(ctx: Ctx, paymentId: number, reason: string) {
  await exec(ctx.db, "UPDATE payments SET status = 'failed', failure_reason = ?, completed_at = NOW() WHERE id = ? AND status = 'pending'", [
    reason.slice(0, 255),
    paymentId,
  ]);
}
