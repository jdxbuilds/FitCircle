#!/usr/bin/env bash
# Rebuilds the fitcircle database from schema.sql + seed.sql, then checks every platform rule.
# Usage: MYSQL_PWD=secret MYSQL="mysql -h 127.0.0.1 -u root" db/test.sh   (defaults to: mysql -u root)
set -u
cd "$(dirname "$0")"
MYSQL=${MYSQL:-"mysql -u root"}
pass=0; fail=0

run()   { $MYSQL --init-command="SET time_zone='+03:00'" -N -B fitcircle -e "$1" 2>&1; }
ok()    { echo "  PASS  $1"; pass=$((pass+1)); }
bad()   { echo "  FAIL  $1"; echo "        $2"; fail=$((fail+1)); }
expect_value() { local got; got=$(run "$2"); [[ "$got" == "$3" ]] && ok "$1" || bad "$1" "expected [$3] got [$got]"; }
expect_error() { local got; got=$(run "$2"); [[ "$got" == *"$3"* ]] && ok "$1" || bad "$1" "expected error containing [$3] got [$got]"; }

echo "Building database..."
$MYSQL -e "DROP DATABASE IF EXISTS fitcircle" || exit 1
$MYSQL < schema.sql || exit 1
$MYSQL --init-command="SET time_zone='+03:00'" fitcircle < seed.sql || exit 1

echo "Accounts"
expect_error "under-16 sign-up is refused" \
  "INSERT INTO users (first_name, phone, date_of_birth) VALUES ('Teen', '+254799000001', CURDATE() - INTERVAL 15 YEAR)" \
  "ages 16 and up"
run "INSERT INTO users (id, first_name, phone, date_of_birth) VALUES (50, 'Zawadi', '+254799000050', CURDATE() - INTERVAL 17 YEAR)" >/dev/null
expect_value "17-year-old can sign up" "SELECT COUNT(*) FROM users WHERE id = 50" "1"

echo "Challenges"
expect_error "fewer than 2 sessions a week is refused" \
  "INSERT INTO challenges (type, title, created_by, start_date, duration_days, sessions_per_week, invite_code) VALUES ('peer','Too easy',1,CURDATE(),28,1,'FC-X1')" \
  "ck_ch_sessions"
expect_error "unverified instructor cannot host" \
  "INSERT INTO instructor_profiles (user_id, display_name, payout_phone) VALUES (9,'Coach Dennis','+254722000009');
   INSERT INTO challenges (type, title, created_by, instructor_id, start_date, duration_days, entry_fee, invite_code) VALUES ('instructor','Unverified',9,9,CURDATE(),28,1000,'FC-X2')" \
  "Only verified instructors"
expect_error "instructor cannot be verified without all 3 documents" \
  "UPDATE instructor_profiles SET verification = 'verified' WHERE user_id = 9" \
  "must all be approved"
expect_value "fee snapshot: instructor-led keeps 35%" "SELECT fee_pct FROM challenges WHERE id = 2" "35.00"
expect_value "forfeits: peer group 60% to FitCircle"  "SELECT CONCAT(fee_pct, '|', forfeit_pct) FROM challenges WHERE id = 1" "0.00|60.00"
expect_value "forfeits: instructor 60% to FitCircle"  "SELECT forfeit_pct FROM challenges WHERE id = 2" "60.00"
expect_value "forfeits: 75-day 100% to FitCircle"     "SELECT CONCAT(fee_pct, '|', forfeit_pct) FROM challenges WHERE id = 3" "0.00|100.00"

echo "Joining and stakes"
run "INSERT INTO challenges (id, type, title, created_by, start_date, duration_days, sessions_per_week, is_staked, stake_amount, invite_code) VALUES (20,'peer','Weekend Warriors',1,CURDATE() + INTERVAL 3 DAY,14,2,TRUE,200,'FC-WW')" >/dev/null
expect_error "17-year-old cannot join a staked challenge" \
  "INSERT INTO challenge_members (challenge_id, user_id) VALUES (20, 50)" "18 and up"
expect_error "nobody joins after the start" \
  "INSERT INTO challenge_members (challenge_id, user_id) VALUES (1, 8)" "already started"
expect_error "stakes are locked once active" \
  "UPDATE challenge_members SET status = 'withdrawn' WHERE challenge_id = 1 AND user_id = 6" "locked"
run "INSERT INTO challenge_members (challenge_id, user_id) VALUES (20, 1), (20, 2)" >/dev/null
run "INSERT INTO payments (user_id, challenge_id, kind, provider, provider_ref, amount, status) VALUES (1, 20, 'stake', 'mpesa', 'T1', 200, 'pending')" >/dev/null
expect_value "pending payment does not lock a stake" "SELECT COALESCE(amount_paid,'none') FROM challenge_members WHERE challenge_id = 20 AND user_id = 1" "none"
run "UPDATE payments SET status = 'succeeded' WHERE provider_ref = 'T1'" >/dev/null
expect_value "M-Pesa confirmation locks the stake" "SELECT amount_paid FROM challenge_members WHERE challenge_id = 20 AND user_id = 1" "200.00"
run "CALL start_challenge(20)" >/dev/null
expect_value "unpaid member is removed at start" "SELECT status FROM challenge_members WHERE challenge_id = 20 AND user_id = 2" "withdrawn"

echo "Logging proof"
expect_error "backdating is refused" \
  "INSERT INTO session_logs (challenge_id, user_id, log_date, media_url, media_type) VALUES (2, 10, CURDATE() - INTERVAL 1 DAY, 'x.jpg', 'photo')" \
  "same day"
run "INSERT INTO session_logs (challenge_id, user_id, media_url, media_type, activity) VALUES (2, 10, 's3://p/today.jpg', 'photo', 'run')" >/dev/null
expect_value "same-day proof is accepted" "SELECT COUNT(*) FROM session_logs WHERE challenge_id = 2 AND user_id = 10 AND log_date = CURDATE()" "1"
expect_error "one counted log per day" \
  "INSERT INTO session_logs (challenge_id, user_id, media_url, media_type) VALUES (2, 10, 's3://p/again.jpg', 'photo')" "Duplicate"
expect_error "no proof, no credit" \
  "INSERT INTO session_logs (challenge_id, user_id, media_type) VALUES (2, 9, 'photo')" "media_url"
expect_error "non-members cannot log" \
  "INSERT INTO session_logs (challenge_id, user_id, media_url, media_type) VALUES (2, 5, 'x.jpg', 'photo')" "active members"

echo "Leaderboard and dashboard"
expect_value "Mercy rested on day 14 so her streak is 1" "SELECT current_streak FROM v_leaderboard WHERE challenge_id = 2 AND user_id = 8" "1"
expect_value "logged today shows on leaderboard" "SELECT logged_today FROM v_leaderboard WHERE challenge_id = 2 AND user_id = 10" "1"
expect_value "instructor share of fees (65% of 6,000)" "SELECT instructor_share FROM v_instructor_dashboard WHERE challenge_id = 2" "3900.00"
expect_value "live 75-day stake pool" "SELECT pool FROM v_stake_pools WHERE challenge_id = 3" "4000.00"

echo "Flags"
expect_error "you cannot flag your own proof" \
  "INSERT INTO proof_flags (session_log_id, flagged_by, reason) SELECT id, 8, 'old_photo' FROM session_logs WHERE challenge_id = 2 AND user_id = 8 LIMIT 1" \
  "own proof"
expect_error "outsiders cannot flag" \
  "INSERT INTO proof_flags (session_log_id, flagged_by, reason) SELECT id, 5, 'old_photo' FROM session_logs WHERE challenge_id = 2 AND user_id = 8 LIMIT 1" \
  "Only people in this challenge"
run "SET @a := (SELECT id FROM session_logs WHERE challenge_id = 2 AND user_id = 8 ORDER BY log_date LIMIT 1);
     SET @b := (SELECT id FROM session_logs WHERE challenge_id = 2 AND user_id = 8 ORDER BY log_date LIMIT 1 OFFSET 1);
     INSERT INTO proof_flags (session_log_id, flagged_by, reason) VALUES (@a, 9, 'old_photo'), (@b, 9, 'old_photo')"
expect_value "2 open flags: account still active" "SELECT status FROM users WHERE id = 8" "active"
run "SET @c := (SELECT id FROM session_logs WHERE challenge_id = 2 AND user_id = 8 ORDER BY log_date DESC LIMIT 1);
     INSERT INTO proof_flags (session_log_id, flagged_by, reason) VALUES (@c, 10, 'someone_else')"
expect_value "3 open flags: account goes under review" "SELECT status FROM users WHERE id = 8" "under_review"
expect_value "flagged session stops counting" "SELECT COUNT(*) FROM session_logs WHERE user_id = 8 AND status = 'flagged'" "3"
run "UPDATE proof_flags SET status = 'upheld', reviewed_by = 7, reviewed_at = NOW() WHERE id = 1;
     UPDATE proof_flags SET status = 'dismissed', reviewed_by = 7, reviewed_at = NOW() WHERE id = 2" >/dev/null
expect_value "upheld flag = rejected, dismissed = counted" \
  "SELECT GROUP_CONCAT(l.status ORDER BY f.id) FROM proof_flags f JOIN session_logs l ON l.id = f.session_log_id WHERE f.id IN (1,2)" "rejected,counted"
expect_value "open flags show on instructor dashboard" "SELECT open_flags FROM v_instructor_dashboard WHERE challenge_id = 2" "1"

echo "Nudges"
run "INSERT INTO nudges (challenge_id, from_user_id, to_user_id) VALUES (1, 2, 6)" >/dev/null
expect_error "one nudge per person per day" "INSERT INTO nudges (challenge_id, from_user_id, to_user_id) VALUES (1, 2, 6)" "Duplicate"

echo "Automatic removal"
run "SET @fitcircle_backfill = 1;
     INSERT INTO challenges (id, type, title, created_by, status, start_date, duration_days, sessions_per_week, invite_code)
       VALUES (40,'peer','Three a week',1,'enrolling',CURDATE() - INTERVAL 10 DAY,14,3,'FC-R3'),
              (41,'peer','Two a week',1,'enrolling',CURDATE() - INTERVAL 8 DAY,14,2,'FC-R2');
     INSERT INTO challenge_members (challenge_id, user_id) VALUES (40,1),(40,2),(40,3),(41,1),(41,4);
     CALL start_challenge(40); CALL start_challenge(41);
     INSERT INTO session_logs (challenge_id, user_id, log_date, logged_at, media_url, media_type) VALUES
       (40,1,CURDATE() - INTERVAL 8 DAY,TIMESTAMP(CURDATE() - INTERVAL 8 DAY,'07:00'),'x.jpg','photo'),
       (40,2,CURDATE() - INTERVAL 2 DAY,TIMESTAMP(CURDATE() - INTERVAL 2 DAY,'07:00'),'x.jpg','photo'),
       (40,3,CURDATE() - INTERVAL 10 DAY,TIMESTAMP(CURDATE() - INTERVAL 10 DAY,'07:00'),'x.jpg','photo'),
       (40,3,CURDATE() - INTERVAL 8 DAY,TIMESTAMP(CURDATE() - INTERVAL 8 DAY,'07:00'),'x.jpg','photo'),
       (40,3,CURDATE() - INTERVAL 6 DAY,TIMESTAMP(CURDATE() - INTERVAL 6 DAY,'07:00'),'x.jpg','photo'),
       (41,1,CURDATE() - INTERVAL 7 DAY,TIMESTAMP(CURDATE() - INTERVAL 7 DAY,'07:00'),'x.jpg','photo');
     SET @fitcircle_backfill = 0;
     CALL apply_removals();" >/dev/null
expect_value "missed 3 in a week: removed; missed 2: stays" \
  "SELECT GROUP_CONCAT(CONCAT(user_id, ':', status) ORDER BY user_id) FROM challenge_members WHERE challenge_id = 40" "1:active,2:forfeited,3:active"
expect_value "removal reason is recorded" "SELECT forfeit_reason FROM challenge_members WHERE challenge_id = 40 AND user_id = 2" "Missed 3 sessions in one week"
expect_value "2-a-week group: missing the whole week removes" \
  "SELECT GROUP_CONCAT(CONCAT(user_id, ':', status) ORDER BY user_id) FROM challenge_members WHERE challenge_id = 41" "1:active,4:forfeited"
expect_value "removed member is told" "SELECT COUNT(*) FROM notifications WHERE user_id = 2 AND title = 'You are out of this challenge' AND JSON_EXTRACT(data, '$.challengeId') = 40" "1"
expect_error "removed member cannot log again" \
  "INSERT INTO session_logs (challenge_id, user_id, media_url, media_type) VALUES (40, 2, 'x.jpg', 'photo')" "Only active members"
expect_value "75-day: 3+ missed days removes, full days keep you in" \
  "SELECT GROUP_CONCAT(CONCAT(user_id, ':', status) ORDER BY user_id) FROM challenge_members WHERE challenge_id = 3" "1:active,2:active,3:active,4:forfeited"
expect_value "75-day removal reason" "SELECT forfeit_reason FROM challenge_members WHERE challenge_id = 3 AND user_id = 4" "Missed 3 days"
expect_value "running it again changes nothing" "CALL apply_removals(); SELECT COUNT(*) FROM challenge_members WHERE removed_at IS NOT NULL" "$(run "SELECT COUNT(*) FROM challenge_members WHERE removed_at IS NOT NULL")"

echo "Settlement"
expect_error "cannot settle before the end" "CALL settle_challenge(3)" "not ended"
run "CALL settle_challenge(1)" >/dev/null
expect_value "4 completed, 2 forfeited" "SELECT CONCAT(completers, '/', forfeiters) FROM settlements WHERE challenge_id = 1" "4/2"
expect_value "1,000 forfeited: FitCircle 600 (60%), finishers share 400" "SELECT CONCAT(forfeited_amount, '|', fee_amount, '|', bonus_each) FROM settlements WHERE challenge_id = 1" "1000.00|600.00|100.00"
expect_value "each finisher gets stake 500 + 100 = 600" "SELECT GROUP_CONCAT(amount ORDER BY user_id) FROM payouts WHERE challenge_id = 1 AND kind = 'stake_payout'" "600.00,600.00,600.00,600.00"
expect_value "Brian and Kevin forfeited" "SELECT GROUP_CONCAT(user_id ORDER BY user_id) FROM challenge_members WHERE challenge_id = 1 AND status = 'forfeited'" "4,6"
expect_value "payouts + fee = pool" "SELECT SUM(p.amount) + s.fee_amount = s.gross_amount FROM payouts p JOIN settlements s ON s.challenge_id = p.challenge_id WHERE p.challenge_id = 1 GROUP BY s.challenge_id" "1"
expect_error "a challenge settles only once" "CALL settle_challenge(1)" "Only an active challenge"

echo "Monthly jackpot"
run "SET @fitcircle_backfill = 1;
     SET @m1 = DATE_FORMAT(CURDATE() - INTERVAL 6 MONTH, '%Y-%m-01'), @m2 = DATE_FORMAT(CURDATE() - INTERVAL 7 MONTH, '%Y-%m-01');
     INSERT INTO sponsors (id, name) VALUES (1, 'Paradise Lost');
     INSERT INTO monthly_jackpots (month, sponsor_id, prize, prize_value) VALUES (@m1, 1, 'Paradise Lost Full-Day Pass (2 pax)', 7000), (@m2, 1, 'Spa day', 5000);
     INSERT INTO challenges (id, type, title, created_by, status, start_date, duration_days, sessions_per_week, invite_code) VALUES
       (70,'peer','Last month A',1,'enrolling',@m1,28,2,'FC-M1'), (71,'peer','Last month B',1,'enrolling',@m1,28,2,'FC-M2'),
       (72,'peer','Two months ago',1,'enrolling',@m2,28,2,'FC-M3');
     INSERT INTO challenge_members (challenge_id, user_id) VALUES (70,1),(70,2),(70,3),(71,1),(72,1),(72,2);
     CALL start_challenge(70); CALL start_challenge(71); CALL start_challenge(72);
     INSERT INTO session_logs (challenge_id, user_id, log_date, logged_at, media_url, media_type)
       WITH RECURSIVE n(d) AS (SELECT 0 UNION ALL SELECT d + 1 FROM n WHERE d < 19)
       SELECT x.c, x.u, c.start_date + INTERVAL n.d DAY, TIMESTAMP(c.start_date + INTERVAL n.d DAY, '07:00'), 'x.jpg', 'photo'
         FROM n JOIN (SELECT 70 c, 1 u, 0 lo, 5 hi UNION ALL SELECT 71, 1, 10, 13   -- user 1: 6 + 4 = 10 sessions in two challenges, best streak 6
                      UNION ALL SELECT 70, 2, 0, 9                                  -- user 2: 10 sessions, streak 10
                      UNION ALL SELECT 70, 3, 0, 19) x ON n.d BETWEEN x.lo AND x.hi  -- user 3: 20 sessions, then suspended
         JOIN challenges c ON c.id = x.c;
     INSERT INTO session_logs (challenge_id, user_id, log_date, logged_at, media_url, media_type)
       SELECT 72, u, @m2 + INTERVAL d DAY, TIMESTAMP(@m2 + INTERVAL d DAY, '07:00'), 'x.jpg', 'photo'
         FROM (SELECT 1 u UNION ALL SELECT 2) a, (SELECT 0 d UNION ALL SELECT 2) b;     -- users 1 and 2 exactly level
     SET @fitcircle_backfill = 0;
     UPDATE users SET status = 'suspended' WHERE id = 3;
     CALL award_monthly_jackpot(@m1); CALL award_monthly_jackpot(@m2);
     UPDATE users SET status = 'active' WHERE id = 3;" >/dev/null
expect_value "sessions count across all challenges; level on 10, the longer streak wins" \
  "SELECT CONCAT(user_id, '|', sessions, '|', best_streak, '|', decided_by) FROM jackpot_awards WHERE month = DATE_FORMAT(CURDATE() - INTERVAL 6 MONTH, '%Y-%m-01')" "2|10|10|streak"
expect_value "suspended accounts cannot win, even with the most sessions" \
  "SELECT COUNT(*) FROM jackpot_awards WHERE user_id = 3" "0"
expect_value "exactly level: a recorded random draw picks one" \
  "SELECT CONCAT(decided_by, '|', tied_with, '|', user_id IN (1,2)) FROM jackpot_awards WHERE month = DATE_FORMAT(CURDATE() - INTERVAL 7 MONTH, '%Y-%m-01')" "draw|1|1"
expect_value "the winner is told" \
  "SELECT COUNT(*) FROM notifications WHERE user_id = 2 AND title LIKE 'You won the % jackpot' AND JSON_EXTRACT(data, '$.jackpotMonth') = DATE_FORMAT(CURDATE() - INTERVAL 6 MONTH, '%Y-%m')" "1"
expect_error "a month is awarded only once" "CALL award_monthly_jackpot(CURDATE() - INTERVAL 6 MONTH)" "already been awarded"
run "INSERT INTO monthly_jackpots (month, sponsor_id, prize) VALUES (DATE_FORMAT(CURDATE(), '%Y-%m-01'), 1, 'Gym month')" >/dev/null
expect_error "the current month cannot be awarded until it ends" "CALL award_monthly_jackpot(CURDATE())" "not ended"
expect_error "jackpot month must be the 1st" "INSERT INTO monthly_jackpots (month, sponsor_id, prize) VALUES ('2030-01-15', 1, 'X')" "ck_mj_first"
expect_value "live leaderboard only counts this month" \
  "SELECT COUNT(*) FROM v_jackpot_leaderboard WHERE sessions > 0 AND user_id = 3" "$(run "SELECT IF(COUNT(*) > 0, 1, 0) FROM session_logs WHERE user_id = 3 AND status = 'counted' AND log_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')")"

echo "Rounding"
run "SET @fitcircle_backfill = 1;
     INSERT INTO challenges (id, type, title, created_by, status, start_date, duration_days, sessions_per_week, is_staked, stake_amount, invite_code)
       VALUES (30,'peer','Odd split',1,'enrolling',CURDATE() - INTERVAL 7 DAY,7,2,TRUE,100,'FC-ODD');
     INSERT INTO challenge_members (challenge_id, user_id) VALUES (30,1),(30,2),(30,3),(30,4);
     INSERT INTO payments (user_id, challenge_id, kind, provider, provider_ref, amount, status) VALUES
       (1,30,'stake','mpesa','R1',100,'succeeded'),(2,30,'stake','mpesa','R2',100,'succeeded'),(3,30,'stake','mpesa','R3',100,'succeeded'),(4,30,'stake','mpesa','R4',100,'succeeded');
     CALL start_challenge(30);
     INSERT INTO session_logs (challenge_id, user_id, log_date, logged_at, media_url, media_type)
       SELECT 30, u, CURDATE() - INTERVAL d DAY, TIMESTAMP(CURDATE() - INTERVAL d DAY, '07:00'), 'x.jpg', 'photo'
       FROM (SELECT 1 u UNION ALL SELECT 2 UNION ALL SELECT 3) a, (SELECT 3 d UNION ALL SELECT 5) b;
     CALL settle_challenge(30);" >/dev/null
expect_value "40 split 3 ways pays 13 each in whole shillings, leftover to FitCircle" "SELECT CONCAT(amount_each, '|', fee_amount) FROM settlements WHERE challenge_id = 30" "113.00|61.00"

echo "Instructor split"
run "SET @fitcircle_backfill = 1;
     INSERT INTO challenges (id, type, title, created_by, instructor_id, status, start_date, duration_days, sessions_per_week, entry_fee, invite_code)
       VALUES (50,'instructor','One week bootcamp',7,7,'enrolling',CURDATE() - INTERVAL 7 DAY,7,2,1000,'FC-IB');
     INSERT INTO challenge_members (challenge_id, user_id) VALUES (50,1),(50,2);
     INSERT INTO payments (user_id, challenge_id, kind, provider, provider_ref, amount, status) VALUES
       (1,50,'entry_fee','mpesa','IB1',1000,'succeeded'),(2,50,'entry_fee','mpesa','IB2',1000,'succeeded');
     CALL start_challenge(50);
     INSERT INTO session_logs (challenge_id, user_id, log_date, logged_at, media_url, media_type)
       SELECT 50, 1, CURDATE() - INTERVAL d DAY, TIMESTAMP(CURDATE() - INTERVAL d DAY, '07:00'), 'x.jpg', 'photo'
       FROM (SELECT 6 d UNION ALL SELECT 3) x;
     CALL settle_challenge(50);" >/dev/null
expect_value "instructor gets 65% of finisher fee + 40% of forfeited fee (650 + 400)" \
  "SELECT amount FROM payouts WHERE challenge_id = 50 AND kind = 'instructor_earning'" "1050.00"
expect_value "FitCircle keeps 35% + 60% (350 + 600)" "SELECT fee_amount FROM settlements WHERE challenge_id = 50" "950.00"

echo
echo "$pass passed, $fail failed"
[[ $fail -eq 0 ]]
