import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { exec } from '../src/db.js';
import { call, makeApp, pay, signUp, type TestApp } from './helpers.js';

let t: TestApp;
beforeAll(async () => { t = await makeApp(); });
afterAll(async () => { await t.close(); });

const inDays = (n: number) => new Date(Date.now() + 3 * 3600_000 + n * 86_400_000).toISOString().slice(0, 10);

describe('FitCircle Challenges', () => {
  it('are run by the FitCircle team, listed for everyone and joined without an invite code', async () => {
    const admin = await signUp(t, 'Ruth');
    await exec(t.ctx.db, "UPDATE users SET role = 'admin' WHERE id = ?", [admin.id]);
    const amani = await signUp(t, 'Amani');
    const teen = await signUp(t, 'Zawadi', 17);
    const body = { type: 'fitcircle', title: '30-Day Morning Move', description: 'Any cardio before 9am.', startDate: inDays(5), weeks: 4, sessionsPerWeek: 5, stake: 500 };

    const refused = await call(t, 'POST', '/challenges', amani.token, body);
    expect(refused.status).toBe(403);
    expect(refused.body.error.message).toBe('Only the FitCircle team can run FitCircle Challenges');

    const created = await call(t, 'POST', '/challenges', admin.token, body);
    expect(created.status).toBe(201);
    const id = created.body.id;

    // Listed for everyone; the team hosts without joining
    const list = await call(t, 'GET', '/challenges/discover?type=fitcircle', amani.token);
    expect(list.body.find((c: { id: number }) => c.id === id)).toMatchObject({ type: 'fitcircle', title: '30-Day Morning Move', stake: 500, members: 0, description: 'Any cardio before 9am.' });
    expect((await call(t, 'GET', '/challenges/discover', amani.token)).body.some((c: { id: number }) => c.id === id)).toBe(false);
    expect((await call(t, 'GET', `/challenges/${id}`, amani.token)).status).toBe(200);

    // Join by id, pay the one fixed stake
    const join = await call(t, 'POST', `/challenges/${id}/join`, amani.token);
    expect(join.status).toBe(201);
    expect(join.body).toMatchObject({ mustPay: true, amount: 500 });
    await pay(t, amani.token, id);
    const view = await call(t, 'GET', `/challenges/${id}`, amani.token);
    expect(view.body).toMatchObject({ type: 'fitcircle', stakePool: 500, members: 1, me: { amountPaid: 500, mustPay: false } });

    // Staked: 18 and up only
    const teenJoin = await call(t, 'POST', `/challenges/${id}/join`, teen.token);
    expect(teenJoin.status).toBe(422);
  });
});
