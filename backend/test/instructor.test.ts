import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { exec } from '../src/db.js';
import { startDue } from '../src/jobs.js';
import { call, logToday, makeApp, pay, signUp, todayEAT, type TestApp } from './helpers.js';

let t: TestApp;
beforeAll(async () => { t = await makeApp(); });
afterAll(async () => { await t.close(); });

async function makeAdmin() {
  const admin = await signUp(t, 'Ruth');
  await exec(t.ctx.db, "UPDATE users SET role = 'admin' WHERE id = ?", [admin.id]);
  return admin;
}

describe('instructor journey', () => {
  it('verifies, hosts a paid programme, posts plans, reviews flags and sees earnings', async () => {
    const admin = await makeAdmin();
    const coach = await signUp(t, 'Wanjiru', 34);

    // Apply and upload the three documents
    const noTerms = await call(t, 'POST', '/instructor/profile', coach.token, { displayName: 'Coach Wanjiru M.', specialties: 'Running' });
    expect(noTerms.status).toBe(400);
    expect(noTerms.body.error.message).toContain('accept the instructor terms');
    expect((await call(t, 'POST', '/instructor/profile', coach.token, { displayName: 'Coach Wanjiru M.', specialties: 'Running', acceptInstructorTerms: true })).status).toBe(201);
    const docs = { certification: 'application/pdf', national_id: 'image/jpeg', demo_video: 'video/mp4' } as const;
    for (const [docType, contentType] of Object.entries(docs)) {
      const up = await call(t, 'POST', '/instructor/uploads', coach.token, { purpose: docType, contentType });
      expect((await call(t, 'POST', '/instructor/documents', coach.token, { docType, key: up.body.key })).status).toBe(201);
    }

    // Cannot host before verification (database rule)
    const early = await call(t, 'POST', '/challenges', coach.token, {
      type: 'instructor', title: 'Karura Forest 10K', startDate: todayEAT(), weeks: 6, sessionsPerWeek: 5, entryFee: 1500,
    });
    expect(early.status).toBe(422);
    expect(early.body.error.message).toBe('Only verified instructors can host instructor challenges');

    // Admin cannot verify until all 3 documents are approved
    const queue = await call(t, 'GET', '/admin/instructors', admin.token);
    const mine = queue.body.find((p: { userId: number }) => p.userId === coach.id);
    expect(mine.documents).toHaveLength(3);
    expect((await call(t, 'POST', `/admin/instructors/${coach.id}/decision`, admin.token, { decision: 'verified' })).status).toBe(422);
    for (const d of mine.documents) await call(t, 'POST', `/admin/instructor-documents/${d.id}/review`, admin.token, { status: 'approved' });
    expect((await call(t, 'POST', `/admin/instructors/${coach.id}/decision`, admin.token, { decision: 'verified' })).status).toBe(200);
    expect((await call(t, 'GET', '/me', coach.token)).body).toMatchObject({ role: 'instructor', instructor: { verification: 'verified' } });

    // Non-admins cannot use admin tools
    expect((await call(t, 'GET', '/admin/instructors', coach.token)).status).toBe(403);

    // Host a paid programme; it shows in discover with the 35% FitCircle fee
    const created = await call(t, 'POST', '/challenges', coach.token, {
      type: 'instructor', title: 'Karura Forest 10K', startDate: todayEAT(), weeks: 6, sessionsPerWeek: 5, entryFee: 1500, capacity: 60,
    });
    expect(created.status).toBe(201);
    const id = created.body.id;
    const discover = await call(t, 'GET', '/challenges/discover', coach.token);
    expect(discover.body.find((c: { id: number }) => c.id === id)).toMatchObject({ instructorName: 'Coach Wanjiru M.', feePct: 35, entryFee: 1500 });

    // Participants join and pay; a teen can join a paid (not staked) programme
    const people = await Promise.all(['Mercy', 'Dennis', 'Faith'].map((n) => signUp(t, n)));
    const teen = await signUp(t, 'Imani', 17);
    for (const p of [...people, teen]) {
      expect((await call(t, 'POST', `/challenges/${id}/join`, p.token)).status).toBe(201);
      await pay(t, p.token, id);
    }
    expect((await call(t, 'POST', `/challenges/${id}/join`, coach.token)).status).toBe(409);

    await startDue(t.ctx.db, () => {});

    // Post today's plan: every participant is notified
    const plan = await call(t, 'POST', `/challenges/${id}/plans`, coach.token, { title: 'Tempo run · 5 km', instructions: 'Easy pace.', sessionType: 'run' });
    expect(plan.body.sentTo).toBe(4);
    expect((await call(t, 'GET', `/challenges/${id}/plans/today`, people[0].token)).body).toMatchObject({ title: 'Tempo run · 5 km' });
    expect((await call(t, 'POST', `/challenges/${id}/plans`, people[0].token, { title: 'Hijack', sessionType: 'run' })).status).toBe(403);

    // Two people log; one flags the other; the coach reviews
    const mercyLog = await logToday(t, people[0].token, id);
    await logToday(t, people[1].token, id);
    const flag = await call(t, 'POST', `/logs/${mercyLog.body.logId}/flags`, people[2].token, { reason: 'someone_else', note: 'Different shoes' });
    expect(flag.status).toBe(201);
    const open = await call(t, 'GET', `/challenges/${id}/flags`, coach.token);
    expect(open.body).toHaveLength(1);
    expect(open.body[0]).toMatchObject({ ownerName: 'Mercy', flaggedByName: 'Faith', reason: 'someone_else' });
    expect((await call(t, 'GET', `/challenges/${id}/flags`, people[0].token)).status).toBe(403);
    expect((await call(t, 'PATCH', `/flags/${flag.body.flagId}`, coach.token, { decision: 'dismissed' })).status).toBe(200);
    expect((await call(t, 'PATCH', `/flags/${flag.body.flagId}`, coach.token, { decision: 'upheld' })).status).toBe(409);

    // Dashboard: 4 × 1,500 = 6,000 in fees, the coach's 65% share is 3,900
    const dash = await call(t, 'GET', '/instructor/dashboard', coach.token);
    expect(dash.body.programmes[0]).toMatchObject({ title: 'Karura Forest 10K', participants: 4, feesCollected: 6000, yourShare: 3900, loggedToday: 2, openFlags: 0 });
    expect(dash.body.earnings.pending).toBe(3900);
  });

  it('puts an account under review after 3 unresolved flags, which blocks logging', async () => {
    const owner = await signUp(t, 'Lilian');
    const [a, b, c] = await Promise.all(['Collins', 'Esther', 'Joy'].map((n) => signUp(t, n)));
    const created = await call(t, 'POST', '/challenges', owner.token, { type: 'peer', title: 'Flag test', startDate: todayEAT(), weeks: 2, sessionsPerWeek: 2 });
    const id = created.body.id;
    for (const p of [a, b, c]) await call(t, 'POST', '/challenges/join', p.token, { inviteCode: created.body.inviteCode });
    await call(t, 'POST', `/challenges/${id}/start`, owner.token);

    // Lilian has three past sessions (imported), each flagged by someone different
    const conn = await t.ctx.db.getConnection();
    await conn.query('SET @fitcircle_backfill = 1');
    await conn.query('UPDATE challenges SET start_date = CURDATE() - INTERVAL 5 DAY WHERE id = ?', [id]);
    const logIds: number[] = [];
    for (const d of [4, 3, 2]) {
      const [res] = await conn.query(
        `INSERT INTO session_logs (challenge_id, user_id, log_date, logged_at, media_url, media_type)
         VALUES (?, ?, CURDATE() - INTERVAL ? DAY, TIMESTAMP(CURDATE() - INTERVAL ? DAY, '07:00'), 'proofs/x.jpg', 'photo')`,
        [id, owner.id, d, d],
      );
      logIds.push((res as { insertId: number }).insertId);
    }
    conn.release();

    for (const [i, p] of [a, b].entries()) await call(t, 'POST', `/logs/${logIds[i]}/flags`, p.token, { reason: 'old_photo' });
    expect((await call(t, 'GET', '/me', owner.token)).body.status).toBe('active');
    await call(t, 'POST', `/logs/${logIds[2]}/flags`, c.token, { reason: 'old_photo' });
    expect((await call(t, 'GET', '/me', owner.token)).body.status).toBe('under_review');

    const blocked = await logToday(t, owner.token, id);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('under_review');

    const admin = await makeAdmin();
    const review = await call(t, 'GET', '/admin/users/under-review', admin.token);
    expect(review.body.find((u: { id: number }) => u.id === owner.id)).toMatchObject({ openFlags: 3 });
  });
});
