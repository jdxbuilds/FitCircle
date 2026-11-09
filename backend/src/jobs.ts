import { pathToFileURL } from 'node:url';
import { loadConfig } from './config.js';
import { createDb, exec, rows, type Db } from './db.js';
import { createPayments, type Payments } from './payments/providers.js';

type Log = (msg: string) => void;

/** Start every enrolling challenge whose start date has arrived. Unpaid members are removed. */
export async function startDue(db: Db, log: Log = console.log) {
  const due = await rows<{ id: number }>(db, "SELECT id FROM challenges WHERE status = 'enrolling' AND start_date <= CURDATE()");
  for (const { id } of due) {
    try {
      await db.query('CALL start_challenge(?)', [id]);
      log(`started challenge ${id}`);
    } catch (e) {
      log(`could not start challenge ${id}: ${(e as Error).message}`);
    }
  }
  return due.length;
}

/** Remove members who missed 3 sessions in a week (peer, instructor) or 3 days (75-day). They are notified. */
export async function removeMissed(db: Db, log: Log = console.log) {
  // @removal_run is set per connection, so the count must use the same connection as the call
  const conn = await db.getConnection();
  let n = 0;
  try {
    await conn.query('CALL apply_removals()');
    n = (await rows<{ n: number }>(conn, 'SELECT COUNT(*) AS n FROM challenge_members WHERE removed_at = @removal_run'))[0]?.n ?? 0;
  } finally {
    conn.release();
  }
  if (n) log(`removed ${n} member(s) for missed sessions`);
  return n;
}

/** Settle every active challenge that ended before today. Challenges with open flags wait for review. */
export async function settleEnded(db: Db, log: Log = console.log) {
  const ended = await rows<{ id: number; open_flags: number }>(
    db,
    `SELECT c.id, (SELECT COUNT(*) FROM proof_flags f JOIN session_logs l ON l.id = f.session_log_id
                   WHERE l.challenge_id = c.id AND f.status = 'open') AS open_flags
       FROM challenges c WHERE c.status = 'active' AND c.end_date < CURDATE()`,
  );
  let settled = 0;
  for (const { id, open_flags } of ended) {
    if (open_flags > 0) {
      log(`challenge ${id} waits: ${open_flags} open flag(s) to review`);
      continue;
    }
    try {
      await db.query('CALL settle_challenge(?)', [id]);
      settled++;
      log(`settled challenge ${id}`);
    } catch (e) {
      log(`could not settle challenge ${id}: ${(e as Error).message}`);
    }
  }
  return settled;
}

/** Morning: everyone in a running challenge. Evening: only people who haven't logged yet. One of each per day. */
export async function remind(db: Db, when: 'morning' | 'evening') {
  const type = when === 'morning' ? 'daily_reminder' : 'evening_reminder';
  const res = await exec(
    db,
    `INSERT INTO notifications (user_id, type, title, body, data)
     SELECT m.user_id, ?, ?, ?, JSON_OBJECT('challengeId', c.id)
       FROM challenge_members m JOIN challenges c ON c.id = m.challenge_id
      WHERE c.status = 'active' AND m.status = 'active' AND CURDATE() BETWEEN c.start_date AND c.end_date
        AND NOT EXISTS (SELECT 1 FROM session_logs l WHERE l.challenge_id = c.id AND l.user_id = m.user_id AND l.log_date = CURDATE())
        AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.user_id = m.user_id AND n.type = ? AND DATE(n.created_at) = CURDATE()
                          AND JSON_EXTRACT(n.data, '$.challengeId') = c.id)`,
    [
      type,
      when === 'morning' ? 'Time to show up' : "You haven't logged today",
      when === 'morning' ? 'Log your session with a photo before midnight.' : 'Your circle can see who is missing. Log before midnight.',
      type,
    ],
  );
  return res.affectedRows;
}

/** Send scheduled payouts that are due. Each payout is claimed first so it can never be sent twice. */
export async function sendPayouts(db: Db, payments: Payments, log: Log = console.log) {
  const due = await rows<{ id: number; amount: number; phone: string; kind: string; title: string }>(
    db,
    `SELECT p.id, p.amount, COALESCE(ip.payout_phone, u.phone) AS phone, p.kind, c.title
       FROM payouts p JOIN users u ON u.id = p.user_id JOIN challenges c ON c.id = p.challenge_id
       LEFT JOIN instructor_profiles ip ON ip.user_id = p.user_id AND p.kind = 'instructor_earning'
      WHERE p.status = 'scheduled' AND p.scheduled_for <= CURDATE() ORDER BY p.id LIMIT 200`,
  );
  let sent = 0;
  for (const p of due) {
    const claim = await exec(db, "UPDATE payouts SET status = 'processing' WHERE id = ? AND status = 'scheduled'", [p.id]);
    if (!claim.affectedRows) continue;
    try {
      const out = await payments.payout({ payoutId: p.id, amount: Math.floor(p.amount), phone: p.phone, remarks: `FitCircle ${p.kind}: ${p.title}` });
      if (out.status === 'sent') await exec(db, "UPDATE payouts SET status = 'sent', sent_at = NOW(), provider_ref = ? WHERE id = ?", [out.providerRef, p.id]);
      else await exec(db, 'UPDATE payouts SET provider_ref = ? WHERE id = ?', [out.providerRef, p.id]);
      sent++;
    } catch (e) {
      await exec(db, "UPDATE payouts SET status = 'failed', failure_reason = ? WHERE id = ?", [(e as Error).message.slice(0, 255), p.id]);
      log(`payout ${p.id} failed: ${(e as Error).message}`);
    }
  }
  return sent;
}

/** On the 1st, award last month's sponsored jackpot to the top performer across FitCircle. */
export async function awardLastMonth(db: Db, log: Log = console.log) {
  const due = await rows<{ month: string }>(
    db,
    `SELECT DATE_FORMAT(j.month, '%Y-%m-%d') AS month FROM monthly_jackpots j
      WHERE j.month < DATE_FORMAT(CURDATE(), '%Y-%m-01')
        AND NOT EXISTS (SELECT 1 FROM jackpot_awards a WHERE a.month = j.month)`,
  );
  let n = 0;
  for (const { month } of due) {
    try {
      await db.query('CALL award_monthly_jackpot(?)', [month]);
      log(`awarded the ${month.slice(0, 7)} jackpot`);
      n++;
    } catch (e) {
      log(`could not award the ${month.slice(0, 7)} jackpot: ${(e as Error).message}`);
    }
  }
  return n;
}

async function main(job: string | undefined) {
  const config = loadConfig();
  const db = createDb(config);
  try {
    switch (job) {
      case 'daily': // just after midnight Nairobi time: start, remove, settle, award last month's jackpot, pay
        console.log({ started: await startDue(db), removed: await removeMissed(db), settled: await settleEnded(db), jackpots: await awardLastMonth(db), payouts: await sendPayouts(db, createPayments(config)) });
        break;
      case 'morning':
      case 'evening':
        console.log({ reminders: await remind(db, job) });
        break;
      case 'payouts':
        console.log({ payouts: await sendPayouts(db, createPayments(config)) });
        break;
      default:
        console.error('Usage: node dist/jobs.js daily | morning | evening | payouts');
        process.exitCode = 1;
    }
  } finally {
    await db.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv[2]).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
