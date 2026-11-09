import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { exec, one } from '../src/db.js';
import { call, makeApp, signUp, todayEAT, type TestApp } from './helpers.js';

let t: TestApp;
beforeAll(async () => { t = await makeApp(); });
afterAll(async () => { await t.close(); });

const stk = (checkoutRef: string, resultCode: number, amount?: number, receipt?: string) => ({
  Body: {
    stkCallback: {
      MerchantRequestID: 'm-1',
      CheckoutRequestID: checkoutRef,
      ResultCode: resultCode,
      ResultDesc: resultCode === 0 ? 'The service request is processed successfully.' : 'Request cancelled by user',
      ...(resultCode === 0
        ? { CallbackMetadata: { Item: [{ Name: 'Amount', Value: amount }, { Name: 'MpesaReceiptNumber', Value: receipt }, { Name: 'PhoneNumber', Value: 254712345678 }] } }
        : {}),
    },
  },
});

async function pendingPayment() {
  const u = await signUp(t, 'Amani');
  const c = await call(t, 'POST', '/challenges', u.token, { type: 'peer', title: 'Webhook test', startDate: todayEAT(), weeks: 2, sessionsPerWeek: 3, stake: 500 });
  const p = await call(t, 'POST', `/challenges/${c.body.id}/payments`, u.token, { provider: 'mpesa' });
  expect(p.status).toBe(201);
  expect(p.body.message).toContain('M-Pesa PIN');
  const row = await one<{ checkout_ref: string }>(t.ctx.db, 'SELECT checkout_ref FROM payments WHERE id = ?', [p.body.paymentId]);
  return { u, challengeId: c.body.id as number, paymentId: p.body.paymentId as number, ref: row!.checkout_ref };
}

describe('M-Pesa STK callback', () => {
  it('locks the stake on success, and ignores a repeated callback', async () => {
    const { u, challengeId, paymentId, ref } = await pendingPayment();
    const url = '/webhooks/mpesa/stk/test-callback-token-123456';
    const res = await t.app.inject({ method: 'POST', url, payload: stk(ref, 0, 500, 'SJK12AB34C') });
    expect(res.json()).toEqual({ ResultCode: 0, ResultDesc: 'Accepted' });
    expect((await call(t, 'GET', `/payments/${paymentId}`, u.token)).body).toMatchObject({ status: 'succeeded', receipt: 'SJK12AB34C' });
    expect((await call(t, 'GET', `/challenges/${challengeId}`, u.token)).body.me.amountPaid).toBe(500);
    await t.app.inject({ method: 'POST', url, payload: stk(ref, 0, 500, 'SJK12AB34C') });
    expect((await one<{ n: number }>(t.ctx.db, "SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND type = 'stake_locked'", [u.id]))!.n).toBe(1);
  });

  it('marks a cancelled prompt as failed', async () => {
    const { u, paymentId, ref } = await pendingPayment();
    await t.app.inject({ method: 'POST', url: '/webhooks/mpesa/stk/test-callback-token-123456', payload: stk(ref, 1032) });
    expect((await call(t, 'GET', `/payments/${paymentId}`, u.token)).body).toMatchObject({ status: 'failed', failureReason: 'Request cancelled by user' });
  });

  it('refuses an underpayment', async () => {
    const { u, paymentId, ref } = await pendingPayment();
    await t.app.inject({ method: 'POST', url: '/webhooks/mpesa/stk/test-callback-token-123456', payload: stk(ref, 0, 50, 'SJKLOW') });
    expect((await call(t, 'GET', `/payments/${paymentId}`, u.token)).body.status).toBe('failed');
  });

  it('rejects callbacks without the secret token', async () => {
    const { u, paymentId, ref } = await pendingPayment();
    const res = await t.app.inject({ method: 'POST', url: '/webhooks/mpesa/stk/wrong-token-0000000', payload: stk(ref, 0, 500, 'FORGED') });
    expect(res.statusCode).toBe(404);
    expect((await call(t, 'GET', `/payments/${paymentId}`, u.token)).body.status).toBe('pending');
  });

  it('refunds a payment that lands after the challenge started', async () => {
    const { u, challengeId, ref } = await pendingPayment();
    await exec(t.ctx.db, "UPDATE challenges SET status = 'active' WHERE id = ?", [challengeId]);
    await exec(t.ctx.db, "UPDATE challenge_members SET status = 'withdrawn' WHERE challenge_id = ?", [challengeId]).catch(() => {});
    await t.app.inject({ method: 'POST', url: '/webhooks/mpesa/stk/test-callback-token-123456', payload: stk(ref, 0, 500, 'SJKLATE') });
    expect(await one(t.ctx.db, "SELECT amount FROM payouts WHERE user_id = ? AND kind = 'refund'", [u.id])).toMatchObject({ amount: 500 });
  });
});

describe('M-Pesa B2C payout result', () => {
  it('marks a processing payout as sent', async () => {
    const { u, challengeId } = await pendingPayment();
    const res = await exec(t.ctx.db, "INSERT INTO payouts (user_id, challenge_id, kind, amount, status, scheduled_for) VALUES (?, ?, 'stake_payout', 525, 'processing', CURDATE())", [u.id, challengeId]);
    const id = res.insertId;
    await t.app.inject({
      method: 'POST',
      url: '/webhooks/mpesa/b2c/test-callback-token-123456',
      payload: { Result: { ResultCode: 0, ResultDesc: 'ok', OriginatorConversationID: `fcpo-${id}`, TransactionID: 'NLJ7RT61SV' } },
    });
    expect(await one(t.ctx.db, 'SELECT status, provider_ref FROM payouts WHERE id = ?', [id])).toMatchObject({ status: 'sent', provider_ref: 'NLJ7RT61SV' });
  });
});

describe('Flutterwave webhook', () => {
  it('rejects a missing or wrong secret hash', async () => {
    const res = await t.app.inject({ method: 'POST', url: '/webhooks/flutterwave', payload: { event: 'charge.completed', data: { id: 1, tx_ref: 'fc-pay-1' } } });
    expect(res.statusCode).toBe(401);
  });
});
