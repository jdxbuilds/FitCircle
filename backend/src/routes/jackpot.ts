import type { FastifyInstance } from 'fastify';
import { requireUser, type Ctx } from '../app.js';
import { one, rows } from '../db.js';

/**
 * One FitCircle-wide jackpot a month, paid for by a sponsor (never members' stakes).
 * The top performer across all challenges that calendar month wins: most sessions,
 * then longest streak, then a random draw. The ranking resets on the 1st.
 */
export function jackpotRoutes(app: FastifyInstance, ctx: Ctx) {
  app.get('/jackpot', async (req) => {
    const u = await requireUser(ctx, req);
    const prize = await one<{ month: string; prize: string; prizeValue: number | null; sponsor: string; resetsOn: string }>(
      ctx.db,
      `SELECT DATE_FORMAT(j.month, '%Y-%m') AS month, j.prize, j.prize_value AS prizeValue, s.name AS sponsor,
              DATE_FORMAT(DATE_ADD(j.month, INTERVAL 1 MONTH), '%Y-%m-%d') AS resetsOn
         FROM monthly_jackpots j JOIN sponsors s ON s.id = j.sponsor_id
        WHERE j.month = DATE_FORMAT(CURDATE(), '%Y-%m-01')`,
    );
    const board = await rows<{ userId: number; firstName: string; sessions: number; bestStreak: number }>(
      ctx.db,
      `SELECT user_id AS userId, first_name AS firstName, sessions, best_streak AS bestStreak
         FROM v_jackpot_leaderboard ORDER BY sessions DESC, best_streak DESC, user_id`,
    );
    // Rank ties share a place; the draw only happens when the month closes
    let rank = 0;
    let prev = '';
    const ranked = board.map((r, i) => {
      const key = `${r.sessions}:${r.bestStreak}`;
      if (key !== prev) rank = i + 1;
      prev = key;
      return { rank, ...r };
    });
    const me = ranked.find((r) => r.userId === u.id) ?? null;
    const winners = await rows(
      ctx.db,
      `SELECT DATE_FORMAT(a.month, '%Y-%m') AS month, u.first_name AS firstName, a.sessions, a.best_streak AS bestStreak,
              a.decided_by AS decidedBy, j.prize, s.name AS sponsor
         FROM jackpot_awards a JOIN monthly_jackpots j ON j.month = a.month
         JOIN sponsors s ON s.id = j.sponsor_id JOIN users u ON u.id = a.user_id
        ORDER BY a.month DESC LIMIT 12`,
    );
    return {
      current: prize ?? null,
      leaders: ranked.slice(0, 10).map(({ userId, ...r }) => ({ ...r, isMe: userId === u.id })),
      me: me && { rank: me.rank, sessions: me.sessions, bestStreak: me.bestStreak },
      pastWinners: winners,
    };
  });
}
