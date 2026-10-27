import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { exec, one, rows } from '../src/db.js';
import { sendPayouts, settleEnded, startDue, remind } from '../src/jobs.js';
import { call, logToday, makeApp, pay, signUp, todayEAT, type TestApp } from './helpers.js';

let t: TestApp;
beforeAll(async () => { t = await makeApp(); });
afterAll(async () => { await t.close(); });

describe('peer group: create, stake, show up, settle', () => {
  it('runs the whole journey from the one-pager', async () => {
    const amani = await signUp(t, 'Amani');
    const friends = await Promise.all(['Achieng', 'Njeri', 'Brian'].map((n) => signUp(t, n)));
    const teen = await signUp(t, 'Zawadi', 17);

    // Step 2: create a staked group
    const created = await call(t, 'POST', '/challenges', amani.token, {
      type: 'peer', title: 'Ofisi Movers', startDate: todayEAT(), weeks: 1, sessionsPerWeek: 2, stake: 500,
    });
    expect(created.status).toBe(201);
    const id = created.body.id as number;
    expect(created.body.inviteCode).toMatch(/^FC-[A-Z2-9]{5}$/);

    // Friends join with the invite code; a 17-year-old cannot join a staked group
    for (const f of friends) expect((await call(t, 'POST', '/challenges/join', f.token, { inviteCode: created.body.inviteCode })).status).toBe(201);
    const teenJoin = await call(t, 'POST', '/challenges/join', teen.token, { inviteCode: created.body.inviteCode });
    expect(teenJoin.status).toBe(422);
    expect(teenJoin.body.error.message).toBe('Staked challenges are for ages 18 and up');

    // Step 3: commit stakes. Brian never pays.
    for (const p of [amani, friends[0], friends[1]]) await pay(t, p.token, id);
    const view = await call(t, 'GET', `/challenges/${id}`, amani.token);
    expect(view.body).toMatchObject({ pool: 1500, members: 4, me: { amountPaid: 500, mustPay: false } });
    const notes = await call(t, 'GET', '/notifications', amani.token);
    expect(notes.body[0]).toMatchObject({ type: 'stake_locked', title: 'Stake locked' });

    // Logging before the start is refused
    expect((await logToday(t, amani.token, id)).status).toBe(403);

    // The daily job starts it; Brian is removed for not paying
    expect(await startDue(t.ctx.db, () => {})).toBeGreaterThanOrEqual(1);
    const members = await call(t, 'GET', `/challenges/${id}/members`, amani.token);
    expect(members.body.map((m: { firstName: string }) => m.firstName).sort()).toEqual(['Achieng', 'Amani', 'Njeri']);

    // Stakes are locked: nobody new can join, and nobody can leave
    const late = await signUp(t, 'Kevin');
    expect((await call(t, 'POST', '/challenges/join', late.token, { inviteCode: created.body.inviteCode })).status).toBe(422);
    expect((await call(t, 'POST', `/challenges/${id}/leave`, friends[0].token)).status).toBe(422);

    // Step 4: show up and log. One log per day.
    const log = await logToday(t, amani.token, id);
    expect(log.status).toBe(201);
    expect(log.body).toMatchObject({ streak: 1, sessionsThisWeek: 1, weeklyTarget: 2 });
    const again = await logToday(t, amani.token, id);
    expect(again.status).toBe(409);
    expect(again.body.error.message).toBe("You've already logged today. Come back tomorrow.");

    // Old upload keys (yesterday's folder) are refused
    const stale = await call(t, 'POST', `/challenges/${id}/logs`, friends[0].token, { key: `proofs/${id}/${friends[0].id}/2020-01-01/x.jpg` });
    expect(stale.status).toBe(400);

    // Step 5: leaderboard and feed
    const board = await call(t, 'GET', `/challenges/${id}/leaderboard`, friends[0].token);
    expect(board.body[0]).toMatchObject({ firstName: 'Amani', loggedToday: 1, sessionsThisWeek: 1 });
    const feed = await call(t, 'GET', `/challenges/${id}/feed`, friends[0].token);
    expect(feed.body).toHaveLength(1);
    expect(feed.body[0].mediaUrl).toContain('/dev/files/');
    expect((await call(t, 'GET', `/challenges/${id}/feed`, late.token)).status).toBe(403);

    // Step 6: nudges (once a day, only people who haven't logged)
    expect((await call(t, 'POST', `/challenges/${id}/nudges`, amani.token, { toUserId: friends[1].id, message: 'Twende!' })).status).toBe(201);
    expect((await call(t, 'POST', `/challenges/${id}/nudges`, amani.token, { toUserId: friends[1].id })).status).toBe(409);
    expect((await call(t, 'POST', `/challenges/${id}/nudges`, friends[0].token, { toUserId: amani.id })).status).toBe(400);
    const njeriNotes = await call(t, 'GET', '/notifications?unread=1', friends[1].token);
    expect(njeriNotes.body[0]).toMatchObject({ type: 'nudge', title: 'Amani nudged you', body: 'Twende!' });

    // Reminders: evening reminder only reaches people who haven't logged
    await remind(t.ctx.db, 'evening');
    const evening = await rows<{ user_id: number }>(t.ctx.db, "SELECT user_id FROM notifications WHERE type = 'evening_reminder' AND JSON_EXTRACT(data, '$.challengeId') = ?", [id]);
    expect(evening.map((r) => r.user_id).sort()).toEqual([friends[0].id, friends[1].id].sort());
    await remind(t.ctx.db, 'evening');
    expect((await one<{ n: number }>(t.ctx.db, "SELECT COUNT(*) AS n FROM notifications WHERE type = 'evening_reminder' AND JSON_EXTRACT(data, '$.challengeId') = ?", [id]))!.n).toBe(2);

    // Flags: you can't flag yourself; others can, once
    const logId = log.body.logId;
    expect((await call(t, 'POST', `/logs/${logId}/flags`, amani.token, { reason: 'old_photo' })).status).toBe(422);
    const flag = await call(t, 'POST', `/logs/${logId}/flags`, friends[0].token, { reason: 'old_photo' });
    expect(flag.status).toBe(201);
    expect((await call(t, 'POST', `/logs/${logId}/flags`, friends[0].token, { reason: 'old_photo' })).status).toBe(409);
    // Peer groups have no instructor: only FitCircle admins review
    expect((await call(t, 'PATCH', `/flags/${flag.body.flagId}`, amani.token, { decision: 'dismissed' })).status).toBe(403);
  });
});

describe('settlement at the end of a challenge', () => {
  it('pays completers from the pool after the 30% fee, in whole shillings', async () => {
    const people = await Promise.all(['Wambui', 'Otieno', 'Akinyi', 'Mutua'].map((n) => signUp(t, n)));
    const created = await call(t, 'POST', '/challenges', people[0].token, {
      type: 'peer', title: 'Week Warriors', startDate: todayEAT(), weeks: 1, sessionsPerWeek: 2, stake: 100,
    });
    const id = created.body.id as number;
    for (const p of people.slice(1)) await call(t, 'POST', '/challenges/join', p.token, { inviteCode: created.body.inviteCode });
    for (const p of people) await pay(t, p.token, id);
    await call(t, 'POST', `/challenges/${id}/start`, people[0].token);

    // Move the challenge into the past and import a finished week (admin backfill).
    await exec(t.ctx.db, 'UPDATE challenges SET start_date = CURDATE() - INTERVAL 7 DAY WHERE id = ?', [id]);
    const conn = await t.ctx.db.getConnection();
    await conn.query('SET @fitcircle_backfill = 1');
    for (const [i, p] of people.entries()) {
      const days = i < 3 ? [6, 4] : [5]; // Mutua only logs once: forfeits
      for (const d of days)
        await conn.query(
          `INSERT INTO session_logs (challenge_id, user_id, log_date, logged_at, media_url, media_type)
           VALUES (?, ?, CURDATE() - INTERVAL ? DAY, TIMESTAMP(CURDATE() - INTERVAL ? DAY, '07:00:00'), 'proofs/x.jpg', 'photo')`,
          [id, p.id, d, d],
        );
    }
    conn.release();

    expect(await settleEnded(t.ctx.db, () => {})).toBeGreaterThanOrEqual(1);
    const view = await call(t, 'GET', `/challenges/${id}`, people[0].token);
    // 400 pool, 30% fee = 120, 280 / 3 = 93 each, the leftover shilling goes to the fee
    expect(view.body.status).toBe('settled');
    expect(view.body.settlement).toMatchObject({ gross: 400, fee: 121, completers: 3, forfeiters: 1, amountEach: 93 });

    // Payouts go out the day after settlement, exactly once
    expect(await one(t.ctx.db, 'SELECT MIN(scheduled_for) = CURDATE() + INTERVAL 1 DAY AS tomorrow FROM payouts WHERE challenge_id = ?', [id])).toMatchObject({ tomorrow: 1 });
    expect(await sendPayouts(t.ctx.db, t.ctx.payments, () => {})).toBe(0);
    await exec(t.ctx.db, 'UPDATE payouts SET scheduled_for = CURDATE() WHERE challenge_id = ?', [id]); // next day
    expect(await sendPayouts(t.ctx.db, t.ctx.payments, () => {})).toBe(3);
    const paid = await rows<{ status: string; amount: number }>(t.ctx.db, 'SELECT status, amount FROM payouts WHERE challenge_id = ?', [id]);
    expect(paid).toHaveLength(3);
    expect(paid.every((p) => p.status === 'sent' && p.amount === 93)).toBe(true);
    await sendPayouts(t.ctx.db, t.ctx.payments, () => {});
    expect((await one<{ n: number }>(t.ctx.db, 'SELECT COUNT(*) AS n FROM payouts WHERE challenge_id = ?', [id]))!.n).toBe(3);
  });
});

describe('75-day challenge', () => {
  it('creates tasks, runs without stakes, and ticks tasks with the daily log', async () => {
    const owner = await signUp(t, 'Faith');
    const teen = await signUp(t, 'Baraka', 16);
    const created = await call(t, 'POST', '/challenges', owner.token, {
      type: 'custom75', title: 'October 75', startDate: todayEAT(), mode: 'soft', tasks: ['45-min workout', 'Drink 3 litres', 'Read 10 pages'],
    });
    expect(created.status).toBe(201);
    const id = created.body.id;
    // No stake: a 16-year-old can join
    expect((await call(t, 'POST', '/challenges/join', teen.token, { inviteCode: created.body.inviteCode })).status).toBe(201);
    expect((await call(t, 'POST', `/challenges/${id}/payments`, owner.token, { provider: 'mpesa' })).status).toBe(400);
    await call(t, 'POST', `/challenges/${id}/start`, owner.token);

    const view = await call(t, 'GET', `/challenges/${id}`, owner.token);
    expect(view.body).toMatchObject({ durationDays: 75, mode75: 'soft', sessionsPerWeek: 6 });
    const taskIds = view.body.tasks.map((x: { id: number }) => x.id);
    const log = await logToday(t, owner.token, id, { taskIds });
    expect(log.status).toBe(201);
    expect((await one<{ n: number }>(t.ctx.db, 'SELECT COUNT(*) AS n FROM task_checkins WHERE session_log_id = ?', [log.body.logId]))!.n).toBe(3);
  });

  it('rejects fewer than 2 sessions a week and past start dates', async () => {
    const u = await signUp(t, 'Kip');
    expect((await call(t, 'POST', '/challenges', u.token, { type: 'peer', title: 'Lazy', startDate: todayEAT(), weeks: 2, sessionsPerWeek: 1 })).status).toBe(400);
    expect((await call(t, 'POST', '/challenges', u.token, { type: 'peer', title: 'Past', startDate: '2020-01-01', weeks: 2, sessionsPerWeek: 3 })).status).toBe(400);
  });
});
