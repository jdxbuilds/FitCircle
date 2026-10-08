#!/usr/bin/env bash
# Rebuilds the fitcircle database from schema.sql + seed.sql, then checks every platform rule.
# Usage: MYSQL="mysql -u root -pSECRET" db/test.sh   (defaults to: mysql -u root)
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
expect_value "fee snapshot: peer pool keeps 30%"      "SELECT fee_pct FROM challenges WHERE id = 1" "30.00"
expect_value "fee snapshot: 75-day pool keeps 30%"    "SELECT fee_pct FROM challenges WHERE id = 3" "30.00"

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
expect_value "live 75-day Jackpot" "SELECT pool FROM v_jackpots WHERE challenge_id = 3" "4000.00"

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

echo "Settlement"
expect_error "cannot settle before the end" "CALL settle_challenge(3)" "not ended"
run "CALL settle_challenge(1)" >/dev/null
expect_value "4 completed, 2 forfeited" "SELECT CONCAT(completers, '/', forfeiters) FROM settlements WHERE challenge_id = 1" "4/2"
expect_value "pool 3,000, fee 900 (30%), 525 each" "SELECT CONCAT(gross_amount, '|', fee_amount, '|', amount_each) FROM settlements WHERE challenge_id = 1" "3000.00|900.00|525.00"
expect_value "Brian and Kevin forfeited" "SELECT GROUP_CONCAT(user_id ORDER BY user_id) FROM challenge_members WHERE challenge_id = 1 AND status = 'forfeited'" "4,6"
expect_value "payouts + fee = pool" "SELECT SUM(p.amount) + s.fee_amount = s.gross_amount FROM payouts p JOIN settlements s ON s.challenge_id = p.challenge_id WHERE p.challenge_id = 1 GROUP BY s.challenge_id" "1"
expect_error "a challenge settles only once" "CALL settle_challenge(1)" "Only an active challenge"

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
expect_value "3-way split of 280 rounds down, cents go to fee" "SELECT CONCAT(amount_each, '|', fee_amount) FROM settlements WHERE challenge_id = 30" "93.33|120.01"

echo
echo "$pass passed, $fail failed"
[[ $fail -eq 0 ]]
