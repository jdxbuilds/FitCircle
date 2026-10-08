-- =====================================================================
-- FitCircle demo data: the same people and numbers as the prototype.
--   mysql -u root -p fitcircle < db/seed.sql
-- Uses @fitcircle_backfill to import past sessions (admin-only switch).
-- Dates are relative to today so the data always looks current.
-- =====================================================================
USE fitcircle;
SET @fitcircle_backfill = 1;

-- People ---------------------------------------------------------------
INSERT INTO users (id, first_name, last_name, phone, email, date_of_birth, role) VALUES
 (1,  'Amani',   'Otieno',  '+254712345678', 'amani@example.com',   '2001-04-12', 'member'),
 (2,  'Achieng', 'Odhiambo','+254722000002', 'achieng@example.com', '1998-09-03', 'member'),
 (3,  'Njeri',   'Kamau',   '+254722000003', NULL,                  '1996-01-21', 'member'),
 (4,  'Brian',   'Mwangi',  '+254722000004', NULL,                  '1999-07-30', 'member'),
 (5,  'Wambui',  'Njoroge', '+254722000005', NULL,                  '2000-11-11', 'member'),
 (6,  'Kevin',   'Ochieng', '+254722000006', NULL,                  '1997-03-05', 'member'),
 (7,  'Wanjiru', 'Maina',   '+254733000007', 'wanjiru@example.com', '1990-06-18', 'instructor'),
 (8,  'Mercy',   'Akinyi',  '+254722000008', NULL,                  '1995-02-14', 'member'),
 (9,  'Dennis',  'Kiprop',  '+254722000009', NULL,                  '1993-12-01', 'member'),
 (10, 'Faith',   'Chebet',  '+254722000010', NULL,                  '2002-08-08', 'member'),
 (11, 'Ruth',    'Admin',   '+254700000011', 'ops@fitcircle.co',    '1992-05-05', 'admin');

INSERT INTO user_goals VALUES (1,'consistency'),(1,'run_10k'),(2,'build_strength'),(3,'consistency');

-- Instructor, verified with all three documents ---------------------------
INSERT INTO instructor_profiles (user_id, display_name, bio, specialties, payout_phone)
VALUES (7, 'Coach Wanjiru M.', 'Running coach, Karura Forest Run Club.', 'Running, beginners', '+254733000007');
INSERT INTO instructor_documents (instructor_id, doc_type, file_url, status, reviewed_by, reviewed_at) VALUES
 (7, 'certification', 's3://fitcircle-docs/7/cert.pdf',  'approved', 11, NOW()),
 (7, 'national_id',   's3://fitcircle-docs/7/id.jpg',    'approved', 11, NOW()),
 (7, 'demo_video',    's3://fitcircle-docs/7/demo.mp4',  'approved', 11, NOW());
UPDATE instructor_profiles SET verification = 'verified' WHERE user_id = 7;

-- 1. Peer group: finished yesterday, ready to settle ----------------------
--    6 people × KES 500, 3 sessions a week for 4 weeks.
INSERT INTO challenges (id, type, title, created_by, status, start_date, duration_days, sessions_per_week, is_staked, stake_amount, invite_code)
VALUES (1, 'peer', 'Ofisi Movers', 1, 'enrolling', CURDATE() - INTERVAL 28 DAY, 28, 3, TRUE, 500, 'FC-7Q2K');
INSERT INTO challenge_members (challenge_id, user_id, role) VALUES (1,1,'owner'),(1,2,'member'),(1,3,'member'),(1,4,'member'),(1,5,'member'),(1,6,'member');
INSERT INTO payments (user_id, challenge_id, kind, provider, provider_ref, amount, status, completed_at)
VALUES (1,1,'stake','mpesa','SJ1001',500,'succeeded',NOW()), (2,1,'stake','mpesa','SJ1002',500,'succeeded',NOW()),
       (3,1,'stake','mpesa','SJ1003',500,'succeeded',NOW()), (4,1,'stake','mpesa','SJ1004',500,'succeeded',NOW()),
       (5,1,'stake','mpesa','SJ1005',500,'succeeded',NOW()), (6,1,'stake','mpesa','SJ1006',500,'succeeded',NOW());
CALL start_challenge(1);

-- Completers log Mon/Wed/Fri every week; Brian misses one session in week 4; Kevin logs once a week.
INSERT INTO session_logs (challenge_id, user_id, log_date, logged_at, activity, media_url, media_type)
WITH RECURSIVE wk(w) AS (SELECT 0 UNION ALL SELECT w + 1 FROM wk WHERE w < 3),
     dy(d) AS (SELECT 0 UNION ALL SELECT 2 UNION ALL SELECT 4),
     who(u) AS (SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5)
SELECT 1, u, c.start_date + INTERVAL (w * 7 + d) DAY, TIMESTAMP(c.start_date + INTERVAL (w * 7 + d) DAY, '07:10:00'),
       'run', CONCAT('s3://fitcircle-proof/1/', u, '/', w, d, '.jpg'), 'photo'
  FROM wk, dy, who, challenges c
 WHERE c.id = 1 AND NOT (u = 4 AND w = 3 AND d = 4);
INSERT INTO session_logs (challenge_id, user_id, log_date, logged_at, activity, media_url, media_type)
WITH RECURSIVE wk(w) AS (SELECT 0 UNION ALL SELECT w + 1 FROM wk WHERE w < 3)
SELECT 1, 6, c.start_date + INTERVAL (w * 7 + 1) DAY, TIMESTAMP(c.start_date + INTERVAL (w * 7 + 1) DAY, '18:00:00'),
       'gym', CONCAT('s3://fitcircle-proof/1/6/', w, '.jpg'), 'photo'
  FROM wk, challenges c WHERE c.id = 1;

-- 2. Instructor challenge: Karura Forest 10K, week 3 of 6 -----------------
INSERT INTO challenges (id, type, title, created_by, instructor_id, status, start_date, duration_days, sessions_per_week, entry_fee, capacity, invite_code)
VALUES (2, 'instructor', 'Karura Forest 10K', 7, 7, 'enrolling', CURDATE() - INTERVAL 15 DAY, 42, 5, 1500, 60, 'FC-K10K');
INSERT INTO challenge_members (challenge_id, user_id) VALUES (2,1),(2,8),(2,9),(2,10);
INSERT INTO payments (user_id, challenge_id, kind, provider, provider_ref, amount, status, completed_at) VALUES
 (1, 2, 'entry_fee', 'mpesa',       'SK2001', 1500, 'succeeded', NOW()),
 (8, 2, 'entry_fee', 'mpesa',       'SK2008', 1500, 'succeeded', NOW()),
 (9, 2, 'entry_fee', 'flutterwave', 'FW2009', 1500, 'succeeded', NOW()),
 (10,2, 'entry_fee', 'mpesa',       'SK2010', 1500, 'succeeded', NOW());
CALL start_challenge(2);
INSERT INTO session_logs (challenge_id, user_id, log_date, logged_at, activity, media_url, media_type)
WITH RECURSIVE n(d) AS (SELECT 0 UNION ALL SELECT d + 1 FROM n WHERE d < 14)
SELECT 2, u.id, c.start_date + INTERVAL d DAY, TIMESTAMP(c.start_date + INTERVAL d DAY, '06:30:00'),
       'run', CONCAT('s3://fitcircle-proof/2/', u.id, '/', d, '.jpg'), 'photo'
  FROM n, challenges c, (SELECT 8 AS id UNION ALL SELECT 9 UNION ALL SELECT 1) u
 WHERE c.id = 2 AND MOD(d, 7) < IF(u.id = 8, 6, 5);
INSERT INTO daily_plans (challenge_id, plan_date, title, instructions, session_type, sent_at)
VALUES (2, CURDATE(), 'Tempo run · 5 km', 'Easy pace, you should be able to talk. Finish with 4 × 100 m strides.', 'run', NOW());

-- 3. Custom 75 Soft: day 23, KES 1,000 each -------------------------------
INSERT INTO challenges (id, type, title, created_by, status, start_date, duration_days, sessions_per_week, mode_75, is_staked, stake_amount, invite_code)
VALUES (3, 'custom75', 'October 75 Soft', 2, 'enrolling', CURDATE() - INTERVAL 22 DAY, 75, 6, 'soft', TRUE, 1000, 'FC-75SF');
INSERT INTO challenge_tasks (challenge_id, title, sort_order) VALUES
 (3, '45-min workout', 1), (3, 'Drink 3 litres of water', 2), (3, 'Read 10 pages', 3);
INSERT INTO challenge_members (challenge_id, user_id, role) VALUES (3,2,'owner'),(3,1,'member'),(3,3,'member'),(3,4,'member');
INSERT INTO payments (user_id, challenge_id, kind, provider, provider_ref, amount, status, completed_at)
VALUES (2,3,'stake','mpesa','S752',1000,'succeeded',NOW()), (1,3,'stake','mpesa','S751',1000,'succeeded',NOW()),
       (3,3,'stake','mpesa','S753',1000,'succeeded',NOW()), (4,3,'stake','flutterwave','S754',1000,'succeeded',NOW());
CALL start_challenge(3);
INSERT INTO session_logs (challenge_id, user_id, log_date, logged_at, activity, media_url, media_type)
WITH RECURSIVE n(d) AS (SELECT 0 UNION ALL SELECT d + 1 FROM n WHERE d < 21)
SELECT 3, u, c.start_date + INTERVAL d DAY, TIMESTAMP(c.start_date + INTERVAL d DAY, '20:00:00'),
       'workout', CONCAT('s3://fitcircle-proof/3/', u, '/', d, '.jpg'), 'photo'
  FROM n, challenges c, (SELECT 1 AS u UNION ALL SELECT 2 UNION ALL SELECT 3) m
 WHERE c.id = 3;
INSERT INTO task_checkins (session_log_id, task_id)
SELECT l.id, t.id FROM session_logs l JOIN challenge_tasks t ON t.challenge_id = l.challenge_id WHERE l.challenge_id = 3;

SET @fitcircle_backfill = 0;
