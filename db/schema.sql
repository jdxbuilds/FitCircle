-- =====================================================================
-- FitCircle database schema · MySQL 8.0+
--
-- Run with the mysql client (it understands DELIMITER):
--   mysql -u root -p < db/schema.sql
--
-- Dates follow Nairobi time. Every app connection should run
--   SET time_zone = '+03:00';
-- so "today" (CURDATE) matches the user's day for same-day proof.
--
-- Platform rules from the one-pager that the database enforces itself:
--   * Users must be 16+ to join, 18+ to join a staked challenge
--   * Minimum 2 sessions per week
--   * Proof must be uploaded same-day (no backdating)
--   * Stakes lock at the start; nobody joins or leaves after start
--   * Instructors must be verified before they can host
--   * Participants can flag proof; 3 unresolved flags = account review
--   * Fees: FitCircle keeps 35% of instructor-led fees, 30% of every other pool
--   * Forfeited stakes are redistributed to completers at settlement
-- =====================================================================

CREATE DATABASE IF NOT EXISTS fitcircle
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE fitcircle;

-- ---------------------------------------------------------------------
-- Platform settings (fee percentages live here, not in code)
-- ---------------------------------------------------------------------
CREATE TABLE platform_settings (
  setting_key   VARCHAR(64)  PRIMARY KEY,
  setting_value VARCHAR(255) NOT NULL,
  description   VARCHAR(255),
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT INTO platform_settings (setting_key, setting_value, description) VALUES
  ('fee_pct_instructor',  '35', 'FitCircle share of instructor challenge entry fees'),
  ('fee_pct_pool',        '30', 'FitCircle share of peer group and custom 75-day Jackpot pools'),
  ('min_age_join',        '16', 'Minimum age to create an account'),
  ('min_age_stake',       '18', 'Minimum age to join a staked challenge'),
  ('open_flags_review',   '3',  'Open flags on a user that trigger an account review'),
  ('default_currency',    'KES','Currency for stakes, fees and payouts');

-- ---------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------
CREATE TABLE users (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  first_name     VARCHAR(80)  NOT NULL,
  last_name      VARCHAR(80),
  phone          VARCHAR(20)  NOT NULL,           -- E.164, e.g. +254712345678 (M-Pesa)
  email          VARCHAR(255),
  date_of_birth  DATE         NOT NULL,
  role           ENUM('member','instructor','admin') NOT NULL DEFAULT 'member',
  status         ENUM('active','under_review','suspended','deleted') NOT NULL DEFAULT 'active',
  is_premium     BOOLEAN      NOT NULL DEFAULT FALSE,
  avatar_url     VARCHAR(500),
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_phone (phone),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB;

CREATE TABLE user_goals (
  user_id  BIGINT UNSIGNED NOT NULL,
  goal     ENUM('lose_weight','build_strength','run_10k','consistency','mental_toughness','feel_better') NOT NULL,
  PRIMARY KEY (user_id, goal),
  CONSTRAINT fk_goals_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Corporate wellness (B2B team licensing)
CREATE TABLE organizations (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(160) NOT NULL,
  seats       INT UNSIGNED NOT NULL DEFAULT 0,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE organization_members (
  organization_id BIGINT UNSIGNED NOT NULL,
  user_id         BIGINT UNSIGNED NOT NULL,
  is_admin        BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (organization_id, user_id),
  CONSTRAINT fk_orgm_org  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_orgm_user FOREIGN KEY (user_id)         REFERENCES users(id)         ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Instructors and verification (certification + ID + demo video)
-- ---------------------------------------------------------------------
CREATE TABLE instructor_profiles (
  user_id        BIGINT UNSIGNED PRIMARY KEY,
  display_name   VARCHAR(120) NOT NULL,
  bio            TEXT,
  specialties    VARCHAR(255),
  verification   ENUM('pending','verified','rejected') NOT NULL DEFAULT 'pending',
  verified_at    DATETIME,
  payout_phone   VARCHAR(20) NOT NULL,             -- where M-Pesa payouts go
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_instr_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE instructor_documents (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  instructor_id  BIGINT UNSIGNED NOT NULL,
  doc_type       ENUM('certification','national_id','demo_video') NOT NULL,
  file_url       VARCHAR(500) NOT NULL,
  status         ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  reviewed_by    BIGINT UNSIGNED,
  reviewed_at    DATETIME,
  uploaded_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_instr_doc (instructor_id, doc_type),
  CONSTRAINT fk_idoc_instr    FOREIGN KEY (instructor_id) REFERENCES instructor_profiles(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_idoc_reviewer FOREIGN KEY (reviewed_by)   REFERENCES users(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Challenges: one table for all three formats
-- ---------------------------------------------------------------------
CREATE TABLE challenges (
  id                 BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  type               ENUM('peer','instructor','custom75') NOT NULL,
  title              VARCHAR(160) NOT NULL,
  description        TEXT,
  created_by         BIGINT UNSIGNED NOT NULL,
  instructor_id      BIGINT UNSIGNED,                       -- instructor challenges only
  organization_id    BIGINT UNSIGNED,                       -- corporate team challenges
  status             ENUM('draft','enrolling','active','settled','cancelled') NOT NULL DEFAULT 'enrolling',
  start_date         DATE NOT NULL,
  duration_days      SMALLINT UNSIGNED NOT NULL,            -- weeks × 7, or 75
  end_date           DATE AS (DATE_ADD(start_date, INTERVAL duration_days - 1 DAY)) STORED,
  sessions_per_week  TINYINT UNSIGNED NOT NULL DEFAULT 3,
  mode_75            ENUM('hard','soft'),                   -- custom75 only
  is_staked          BOOLEAN NOT NULL DEFAULT FALSE,        -- opt-in
  stake_amount       DECIMAL(12,2),                         -- peer / custom75, per person
  entry_fee          DECIMAL(12,2),                         -- instructor, per person
  currency           CHAR(3) NOT NULL DEFAULT 'KES',
  fee_pct            DECIMAL(5,2) NOT NULL,                 -- snapshot of FitCircle's cut when created
  capacity           INT UNSIGNED,
  invite_code        VARCHAR(12) NOT NULL,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_challenge_invite (invite_code),
  KEY ix_challenge_status (status, start_date),
  KEY ix_challenge_instructor (instructor_id),
  CONSTRAINT fk_ch_creator    FOREIGN KEY (created_by)      REFERENCES users(id),
  CONSTRAINT fk_ch_instructor FOREIGN KEY (instructor_id)   REFERENCES instructor_profiles(user_id),
  CONSTRAINT fk_ch_org        FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT ck_ch_sessions   CHECK (sessions_per_week BETWEEN 2 AND 7),
  CONSTRAINT ck_ch_fee_pct    CHECK (fee_pct BETWEEN 0 AND 100),
  CONSTRAINT ck_ch_duration   CHECK (
       (type = 'custom75' AND duration_days = 75)
    OR (type <> 'custom75' AND duration_days BETWEEN 7 AND 84 AND duration_days % 7 = 0)),
  CONSTRAINT ck_ch_instructor CHECK (
       (type = 'instructor' AND instructor_id IS NOT NULL AND entry_fee > 0 AND is_staked = FALSE)
    OR (type <> 'instructor' AND instructor_id IS NULL AND entry_fee IS NULL)),
  CONSTRAINT ck_ch_stake      CHECK (
       (is_staked = TRUE  AND stake_amount > 0)
    OR (is_staked = FALSE AND stake_amount IS NULL)),
  CONSTRAINT ck_ch_mode75     CHECK ((type = 'custom75') = (mode_75 IS NOT NULL))
) ENGINE=InnoDB;

-- Daily tasks for custom 75-day challenges (workout, water, reading, photo...)
CREATE TABLE challenge_tasks (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  challenge_id  BIGINT UNSIGNED NOT NULL,
  title         VARCHAR(120) NOT NULL,
  sort_order    TINYINT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_task_ch FOREIGN KEY (challenge_id) REFERENCES challenges(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE challenge_members (
  challenge_id   BIGINT UNSIGNED NOT NULL,
  user_id        BIGINT UNSIGNED NOT NULL,
  role           ENUM('owner','member') NOT NULL DEFAULT 'member',
  status         ENUM('active','completed','forfeited','withdrawn') NOT NULL DEFAULT 'active',
  amount_paid    DECIMAL(12,2),                     -- stake or entry fee, set when payment succeeds
  paid_at        DATETIME,
  joined_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (challenge_id, user_id),
  KEY ix_member_user (user_id, status),
  CONSTRAINT fk_cm_ch   FOREIGN KEY (challenge_id) REFERENCES challenges(id),
  CONSTRAINT fk_cm_user FOREIGN KEY (user_id)      REFERENCES users(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Money in: M-Pesa / Flutterwave
-- ---------------------------------------------------------------------
CREATE TABLE payments (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id         BIGINT UNSIGNED NOT NULL,
  challenge_id    BIGINT UNSIGNED,
  kind            ENUM('stake','entry_fee','subscription','custom75_unlock','corporate_license') NOT NULL,
  provider        ENUM('mpesa','flutterwave') NOT NULL,
  provider_ref    VARCHAR(80),                      -- M-Pesa receipt / Flutterwave tx ref
  amount          DECIMAL(12,2) NOT NULL,
  currency        CHAR(3) NOT NULL DEFAULT 'KES',
  status          ENUM('pending','succeeded','failed','refunded') NOT NULL DEFAULT 'pending',
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at    DATETIME,
  UNIQUE KEY uq_pay_provider_ref (provider, provider_ref),
  KEY ix_pay_user (user_id, created_at),
  CONSTRAINT fk_pay_user FOREIGN KEY (user_id)      REFERENCES users(id),
  CONSTRAINT fk_pay_ch   FOREIGN KEY (challenge_id) REFERENCES challenges(id),
  CONSTRAINT ck_pay_amount CHECK (amount > 0)
) ENGINE=InnoDB;

CREATE TABLE subscriptions (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      BIGINT UNSIGNED NOT NULL,
  plan         ENUM('premium_monthly','premium_yearly') NOT NULL,
  status       ENUM('active','cancelled','expired') NOT NULL DEFAULT 'active',
  started_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  renews_at    DATETIME,
  CONSTRAINT fk_sub_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Showing up: proof of each session
-- ---------------------------------------------------------------------
CREATE TABLE session_logs (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  challenge_id   BIGINT UNSIGNED NOT NULL,
  user_id        BIGINT UNSIGNED NOT NULL,
  log_date       DATE NOT NULL,                     -- the day this proof counts for
  logged_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  activity       VARCHAR(40),                       -- run, gym, hiit, yoga...
  caption        VARCHAR(280),
  media_url      VARCHAR(500) NOT NULL,             -- no proof = no credit
  media_type     ENUM('photo','video') NOT NULL,
  status         ENUM('counted','flagged','rejected') NOT NULL DEFAULT 'counted',
  UNIQUE KEY uq_one_log_per_day (challenge_id, user_id, log_date),
  KEY ix_log_user (user_id, log_date),
  CONSTRAINT fk_log_member FOREIGN KEY (challenge_id, user_id) REFERENCES challenge_members(challenge_id, user_id),
  CONSTRAINT ck_log_same_day CHECK (log_date = DATE(logged_at))
) ENGINE=InnoDB;

-- Which 75-day tasks a log covers
CREATE TABLE task_checkins (
  session_log_id BIGINT UNSIGNED NOT NULL,
  task_id        BIGINT UNSIGNED NOT NULL,
  checked_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (session_log_id, task_id),
  CONSTRAINT fk_tc_log  FOREIGN KEY (session_log_id) REFERENCES session_logs(id) ON DELETE CASCADE,
  CONSTRAINT fk_tc_task FOREIGN KEY (task_id)        REFERENCES challenge_tasks(id)
) ENGINE=InnoDB;

CREATE TABLE proof_flags (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_log_id  BIGINT UNSIGNED NOT NULL,
  flagged_by      BIGINT UNSIGNED NOT NULL,
  reason          ENUM('old_photo','not_a_workout','someone_else','other') NOT NULL,
  note            VARCHAR(280),
  status          ENUM('open','upheld','dismissed') NOT NULL DEFAULT 'open',
  reviewed_by     BIGINT UNSIGNED,
  reviewed_at     DATETIME,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_flag_once (session_log_id, flagged_by),
  KEY ix_flag_status (status),
  CONSTRAINT fk_flag_log      FOREIGN KEY (session_log_id) REFERENCES session_logs(id),
  CONSTRAINT fk_flag_by       FOREIGN KEY (flagged_by)     REFERENCES users(id),
  CONSTRAINT fk_flag_reviewer FOREIGN KEY (reviewed_by)    REFERENCES users(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Staying visible: nudges, notifications, instructor daily plans
-- ---------------------------------------------------------------------
CREATE TABLE nudges (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  challenge_id  BIGINT UNSIGNED NOT NULL,
  from_user_id  BIGINT UNSIGNED NOT NULL,
  to_user_id    BIGINT UNSIGNED NOT NULL,
  message       VARCHAR(140),
  nudge_date    DATE NOT NULL DEFAULT (CURDATE()),
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_nudge_daily (challenge_id, from_user_id, to_user_id, nudge_date),  -- one nudge per person per day
  CONSTRAINT fk_nudge_ch   FOREIGN KEY (challenge_id) REFERENCES challenges(id),
  CONSTRAINT fk_nudge_from FOREIGN KEY (from_user_id) REFERENCES users(id),
  CONSTRAINT fk_nudge_to   FOREIGN KEY (to_user_id)   REFERENCES users(id),
  CONSTRAINT ck_nudge_self CHECK (from_user_id <> to_user_id)
) ENGINE=InnoDB;

CREATE TABLE notifications (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     BIGINT UNSIGNED NOT NULL,
  type        ENUM('daily_reminder','evening_reminder','nudge','member_at_risk','daily_plan',
                   'flag_raised','flag_resolved','stake_locked','challenge_started','challenge_settled',
                   'payout_sent','account_review') NOT NULL,
  title       VARCHAR(120) NOT NULL,
  body        VARCHAR(280),
  data        JSON,
  read_at     DATETIME,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_notif_user (user_id, read_at, created_at),
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE daily_plans (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  challenge_id    BIGINT UNSIGNED NOT NULL,
  plan_date       DATE NOT NULL,
  title           VARCHAR(120) NOT NULL,
  instructions    TEXT,
  session_type    ENUM('run','strength','hiit','mobility','rest') NOT NULL,
  voice_note_url  VARCHAR(500),
  sent_at         DATETIME,
  UNIQUE KEY uq_plan_day (challenge_id, plan_date),
  CONSTRAINT fk_plan_ch FOREIGN KEY (challenge_id) REFERENCES challenges(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Money out: settlement of each challenge, and the payouts it creates
-- ---------------------------------------------------------------------
CREATE TABLE settlements (
  challenge_id     BIGINT UNSIGNED PRIMARY KEY,     -- a challenge settles exactly once
  gross_amount     DECIMAL(12,2) NOT NULL,          -- pool or total entry fees
  fee_pct          DECIMAL(5,2)  NOT NULL,
  fee_amount       DECIMAL(12,2) NOT NULL,          -- FitCircle revenue (includes rounding cents)
  completers       INT UNSIGNED  NOT NULL,
  forfeiters       INT UNSIGNED  NOT NULL,
  amount_each      DECIMAL(12,2),                   -- per completer (pools) or NULL
  settled_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_set_ch FOREIGN KEY (challenge_id) REFERENCES challenges(id)
) ENGINE=InnoDB;

CREATE TABLE payouts (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id        BIGINT UNSIGNED NOT NULL,
  challenge_id   BIGINT UNSIGNED NOT NULL,
  kind           ENUM('jackpot','instructor_earning','refund') NOT NULL,
  amount         DECIMAL(12,2) NOT NULL,
  currency       CHAR(3) NOT NULL DEFAULT 'KES',
  provider       ENUM('mpesa','flutterwave') NOT NULL DEFAULT 'mpesa',
  provider_ref   VARCHAR(80),
  status         ENUM('scheduled','sent','failed') NOT NULL DEFAULT 'scheduled',
  scheduled_for  DATE NOT NULL,
  sent_at        DATETIME,
  KEY ix_payout_user (user_id, status),
  KEY ix_payout_due (status, scheduled_for),
  CONSTRAINT fk_po_user FOREIGN KEY (user_id)      REFERENCES users(id),
  CONSTRAINT fk_po_ch   FOREIGN KEY (challenge_id) REFERENCES challenges(id),
  CONSTRAINT ck_po_amount CHECK (amount > 0)
) ENGINE=InnoDB;


-- =====================================================================
-- Triggers: the platform rules
-- Set @fitcircle_backfill = 1 in an admin session to import history
-- (it relaxes only the same-day and join-before-start rules).
-- =====================================================================
DELIMITER //

-- 16+ to have an account
CREATE TRIGGER trg_users_age_ins BEFORE INSERT ON users FOR EACH ROW
BEGIN
  IF TIMESTAMPDIFF(YEAR, NEW.date_of_birth, CURDATE()) <
     (SELECT CAST(setting_value AS UNSIGNED) FROM platform_settings WHERE setting_key = 'min_age_join') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'FitCircle is for ages 16 and up';
  END IF;
END//

CREATE TRIGGER trg_users_age_upd BEFORE UPDATE ON users FOR EACH ROW
BEGIN
  IF NEW.date_of_birth <> OLD.date_of_birth AND TIMESTAMPDIFF(YEAR, NEW.date_of_birth, CURDATE()) <
     (SELECT CAST(setting_value AS UNSIGNED) FROM platform_settings WHERE setting_key = 'min_age_join') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'FitCircle is for ages 16 and up';
  END IF;
END//

-- Fee snapshot, and only verified instructors can host
CREATE TRIGGER trg_challenges_ins BEFORE INSERT ON challenges FOR EACH ROW
BEGIN
  IF NEW.fee_pct IS NULL THEN
    SET NEW.fee_pct = (SELECT CAST(setting_value AS DECIMAL(5,2)) FROM platform_settings
                       WHERE setting_key = IF(NEW.type = 'instructor', 'fee_pct_instructor', 'fee_pct_pool'));
  END IF;
  IF NEW.type = 'instructor' AND NOT EXISTS (
       SELECT 1 FROM instructor_profiles WHERE user_id = NEW.instructor_id AND verification = 'verified') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only verified instructors can host instructor challenges';
  END IF;
END//

-- A profile becomes verified only when all three documents are approved
CREATE TRIGGER trg_instructor_verify BEFORE UPDATE ON instructor_profiles FOR EACH ROW
BEGIN
  IF NEW.verification = 'verified' AND OLD.verification <> 'verified' THEN
    IF (SELECT COUNT(*) FROM instructor_documents
        WHERE instructor_id = NEW.user_id AND status = 'approved') < 3 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Certification, ID and demo video must all be approved first';
    END IF;
    SET NEW.verified_at = NOW();
  END IF;
END//

-- Joining: before start only, capacity, 18+ for staked challenges
CREATE TRIGGER trg_members_join BEFORE INSERT ON challenge_members FOR EACH ROW
BEGIN
  DECLARE v_status VARCHAR(20); DECLARE v_staked BOOLEAN; DECLARE v_cap INT; DECLARE v_count INT;
  DECLARE v_age INT; DECLARE v_user_status VARCHAR(20);
  SELECT status, is_staked, capacity INTO v_status, v_staked, v_cap FROM challenges WHERE id = NEW.challenge_id;
  SELECT TIMESTAMPDIFF(YEAR, date_of_birth, CURDATE()), status INTO v_age, v_user_status FROM users WHERE id = NEW.user_id;

  IF v_user_status <> 'active' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This account cannot join challenges right now';
  END IF;
  IF v_status NOT IN ('draft','enrolling') AND COALESCE(@fitcircle_backfill, 0) = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This challenge has already started. Stakes are locked.';
  END IF;
  IF v_staked AND v_age < (SELECT CAST(setting_value AS UNSIGNED) FROM platform_settings WHERE setting_key = 'min_age_stake') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Staked challenges are for ages 18 and up';
  END IF;
  SELECT COUNT(*) INTO v_count FROM challenge_members WHERE challenge_id = NEW.challenge_id AND status <> 'withdrawn';
  IF v_cap IS NOT NULL AND v_count >= v_cap THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This challenge is full';
  END IF;
END//

-- Stakes are locked: no withdrawing once the challenge is active
CREATE TRIGGER trg_members_lock BEFORE UPDATE ON challenge_members FOR EACH ROW
BEGIN
  IF NEW.status = 'withdrawn' AND OLD.status <> 'withdrawn' AND COALESCE(@fitcircle_settling, 0) = 0
     AND (SELECT status FROM challenges WHERE id = NEW.challenge_id) <> 'enrolling' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Stakes are locked once a challenge starts';
  END IF;
END//

-- A successful stake / entry-fee payment records the money against the membership
CREATE TRIGGER trg_payment_ins AFTER INSERT ON payments FOR EACH ROW
BEGIN
  IF NEW.status = 'succeeded' AND NEW.kind IN ('stake','entry_fee') THEN
    UPDATE challenge_members SET amount_paid = NEW.amount, paid_at = COALESCE(NEW.completed_at, NOW())
    WHERE challenge_id = NEW.challenge_id AND user_id = NEW.user_id;
  END IF;
END//

CREATE TRIGGER trg_payment_upd AFTER UPDATE ON payments FOR EACH ROW
BEGIN
  IF NEW.status = 'succeeded' AND OLD.status <> 'succeeded' AND NEW.kind IN ('stake','entry_fee') THEN
    UPDATE challenge_members SET amount_paid = NEW.amount, paid_at = COALESCE(NEW.completed_at, NOW())
    WHERE challenge_id = NEW.challenge_id AND user_id = NEW.user_id;
  END IF;
END//

-- Same-day proof only, active members of active challenges, inside the challenge window
CREATE TRIGGER trg_log_rules BEFORE INSERT ON session_logs FOR EACH ROW
BEGIN
  DECLARE v_ch_status VARCHAR(20); DECLARE v_start DATE; DECLARE v_end DATE; DECLARE v_m_status VARCHAR(20);
  SELECT status, start_date, end_date INTO v_ch_status, v_start, v_end FROM challenges WHERE id = NEW.challenge_id;
  SELECT status INTO v_m_status FROM challenge_members WHERE challenge_id = NEW.challenge_id AND user_id = NEW.user_id;

  IF COALESCE(@fitcircle_backfill, 0) = 0 THEN
    SET NEW.logged_at = NOW();
    IF NEW.log_date IS NULL THEN SET NEW.log_date = CURDATE(); END IF;
    IF NEW.log_date <> CURDATE() THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Proof must be uploaded the same day. No backdating.';
    END IF;
  END IF;
  IF v_ch_status <> 'active' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This challenge is not running';
  END IF;
  IF v_m_status IS NULL OR v_m_status <> 'active' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only active members can log sessions';
  END IF;
  IF NEW.log_date < v_start OR NEW.log_date > v_end THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This day is outside the challenge dates';
  END IF;
END//

-- 75-day task check-ins must use the challenge's own tasks
CREATE TRIGGER trg_checkin_task BEFORE INSERT ON task_checkins FOR EACH ROW
BEGIN
  IF (SELECT challenge_id FROM challenge_tasks WHERE id = NEW.task_id) <>
     (SELECT challenge_id FROM session_logs WHERE id = NEW.session_log_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Task does not belong to this challenge';
  END IF;
END//

-- Flagging: members of the same challenge only, never your own proof
CREATE TRIGGER trg_flag_rules BEFORE INSERT ON proof_flags FOR EACH ROW
BEGIN
  DECLARE v_owner BIGINT UNSIGNED; DECLARE v_ch BIGINT UNSIGNED;
  SELECT user_id, challenge_id INTO v_owner, v_ch FROM session_logs WHERE id = NEW.session_log_id;
  IF v_owner = NEW.flagged_by THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You cannot flag your own proof';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM challenge_members WHERE challenge_id = v_ch AND user_id = NEW.flagged_by)
     AND NOT EXISTS (SELECT 1 FROM challenges WHERE id = v_ch AND instructor_id = NEW.flagged_by) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only people in this challenge can flag its proof';
  END IF;
END//

-- New flag: session goes to review; 3 unresolved flags puts the account under review
CREATE TRIGGER trg_flag_after_ins AFTER INSERT ON proof_flags FOR EACH ROW
BEGIN
  DECLARE v_owner BIGINT UNSIGNED; DECLARE v_open INT;
  SELECT user_id INTO v_owner FROM session_logs WHERE id = NEW.session_log_id;
  UPDATE session_logs SET status = 'flagged' WHERE id = NEW.session_log_id AND status = 'counted';
  SELECT COUNT(DISTINCT f.session_log_id) INTO v_open
    FROM proof_flags f JOIN session_logs l ON l.id = f.session_log_id
   WHERE l.user_id = v_owner AND f.status = 'open';
  IF v_open >= (SELECT CAST(setting_value AS UNSIGNED) FROM platform_settings WHERE setting_key = 'open_flags_review') THEN
    UPDATE users SET status = 'under_review' WHERE id = v_owner AND status = 'active';
    INSERT INTO notifications (user_id, type, title, body)
    VALUES (v_owner, 'account_review', 'Your account is under review',
            'Several of your sessions were flagged. The FitCircle team will check them shortly.');
  END IF;
END//

-- Resolving a flag: upheld = no credit; dismissed = counts again (if no other open flags)
CREATE TRIGGER trg_flag_after_upd AFTER UPDATE ON proof_flags FOR EACH ROW
BEGIN
  IF NEW.status <> OLD.status THEN
    IF NEW.status = 'upheld' THEN
      UPDATE session_logs SET status = 'rejected' WHERE id = NEW.session_log_id;
    ELSEIF NEW.status = 'dismissed' AND NOT EXISTS (
        SELECT 1 FROM proof_flags WHERE session_log_id = NEW.session_log_id AND status IN ('open','upheld')) THEN
      UPDATE session_logs SET status = 'counted' WHERE id = NEW.session_log_id AND status = 'flagged';
    END IF;
  END IF;
END//

DELIMITER ;


-- =====================================================================
-- Views the app reads from
-- =====================================================================

-- Counted sessions per member per challenge week (week 1 starts on start_date)
CREATE VIEW v_member_weeks AS
SELECT l.challenge_id, l.user_id,
       FLOOR(DATEDIFF(l.log_date, c.start_date) / 7) + 1 AS week_no,
       COUNT(*) AS sessions
  FROM session_logs l JOIN challenges c ON c.id = l.challenge_id
 WHERE l.status = 'counted'
 GROUP BY l.challenge_id, l.user_id, week_no;

-- Current and best streak (consecutive logged days, flags pending still count)
CREATE VIEW v_member_streaks AS
WITH days AS (
  SELECT challenge_id, user_id, log_date,
         DATE_SUB(log_date, INTERVAL ROW_NUMBER() OVER (PARTITION BY challenge_id, user_id ORDER BY log_date) DAY) AS grp
    FROM session_logs WHERE status <> 'rejected'
), runs AS (
  SELECT challenge_id, user_id, MAX(log_date) AS last_day, COUNT(*) AS len
    FROM days GROUP BY challenge_id, user_id, grp
)
SELECT challenge_id, user_id,
       MAX(CASE WHEN last_day >= CURDATE() - INTERVAL 1 DAY THEN len ELSE 0 END) AS current_streak,
       MAX(len) AS best_streak
  FROM runs GROUP BY challenge_id, user_id;

-- Live leaderboard: this week's sessions, today's status, streaks, at-risk
CREATE VIEW v_leaderboard AS
SELECT m.challenge_id, m.user_id, u.first_name,
       FLOOR(DATEDIFF(CURDATE(), c.start_date) / 7) + 1 AS week_no,
       COALESCE(w.sessions, 0) AS sessions_this_week,
       c.sessions_per_week AS weekly_target,
       EXISTS (SELECT 1 FROM session_logs t WHERE t.challenge_id = m.challenge_id AND t.user_id = m.user_id
                 AND t.log_date = CURDATE() AND t.status <> 'rejected') AS logged_today,
       COALESCE(s.current_streak, 0) AS current_streak,
       COALESCE(s.best_streak, 0) AS best_streak,
       -- at risk: can no longer hit the target unless they log every remaining day this week
       (c.sessions_per_week - COALESCE(w.sessions, 0)) >= (7 - MOD(DATEDIFF(CURDATE(), c.start_date), 7)) AS at_risk
  FROM challenge_members m
  JOIN challenges c ON c.id = m.challenge_id AND c.status = 'active'
  JOIN users u ON u.id = m.user_id
  LEFT JOIN v_member_weeks w ON w.challenge_id = m.challenge_id AND w.user_id = m.user_id
        AND w.week_no = FLOOR(DATEDIFF(CURDATE(), c.start_date) / 7) + 1
  LEFT JOIN v_member_streaks s ON s.challenge_id = m.challenge_id AND s.user_id = m.user_id
 WHERE m.status = 'active';

-- Live Jackpot per staked challenge
CREATE VIEW v_jackpots AS
SELECT c.id AS challenge_id, c.title, c.type, c.fee_pct,
       COUNT(m.user_id) AS stakers,
       COALESCE(SUM(m.amount_paid), 0) AS pool,
       ROUND(COALESCE(SUM(m.amount_paid), 0) * c.fee_pct / 100, 2) AS projected_fee
  FROM challenges c
  LEFT JOIN challenge_members m ON m.challenge_id = c.id AND m.amount_paid IS NOT NULL
 WHERE c.is_staked
 GROUP BY c.id;

-- Instructor dashboard: one row per programme
CREATE VIEW v_instructor_dashboard AS
SELECT c.instructor_id, c.id AS challenge_id, c.title, c.status, c.start_date, c.end_date,
       COUNT(DISTINCT m.user_id) AS participants,
       COALESCE(SUM(m.amount_paid), 0) AS fees_collected,
       ROUND(COALESCE(SUM(m.amount_paid), 0) * (100 - c.fee_pct) / 100, 2) AS instructor_share,
       (SELECT COUNT(*) FROM session_logs l WHERE l.challenge_id = c.id AND l.log_date = CURDATE()) AS logged_today,
       (SELECT COUNT(*) FROM v_leaderboard lb WHERE lb.challenge_id = c.id AND lb.at_risk) AS at_risk,
       (SELECT COUNT(*) FROM proof_flags f JOIN session_logs l ON l.id = f.session_log_id
         WHERE l.challenge_id = c.id AND f.status = 'open') AS open_flags
  FROM challenges c
  LEFT JOIN challenge_members m ON m.challenge_id = c.id AND m.status <> 'withdrawn'
 WHERE c.type = 'instructor'
 GROUP BY c.id;


-- =====================================================================
-- Procedures
-- =====================================================================
DELIMITER //

-- Start a challenge: anyone in a staked/paid challenge who hasn't paid is removed
CREATE PROCEDURE start_challenge(IN p_challenge_id BIGINT UNSIGNED)
BEGIN
  DECLARE v_status VARCHAR(20); DECLARE v_paid BOOLEAN;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN SET @fitcircle_settling = 0; ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  SELECT status, (is_staked OR type = 'instructor') INTO v_status, v_paid
    FROM challenges WHERE id = p_challenge_id FOR UPDATE;
  IF v_status IS NULL OR v_status NOT IN ('draft','enrolling') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only an enrolling challenge can be started';
  END IF;
  IF v_paid THEN
    SET @fitcircle_settling = 1;
    UPDATE challenge_members SET status = 'withdrawn'
     WHERE challenge_id = p_challenge_id AND status = 'active' AND amount_paid IS NULL;
    SET @fitcircle_settling = 0;
  END IF;
  UPDATE challenges SET status = 'active' WHERE id = p_challenge_id;
  INSERT INTO notifications (user_id, type, title, body)
  SELECT user_id, 'challenge_started', 'Your challenge has started', 'Stakes are locked. Log your first session today.'
    FROM challenge_members WHERE challenge_id = p_challenge_id AND status = 'active';
  COMMIT;
END//

-- Settle a finished challenge.
--   Completion: peer / instructor = hit the weekly target every week.
--               custom75 = every task done on 75 days (hard) or 65 days (soft: 1 rest day a week).
--   Pools (peer, custom75): FitCircle takes fee_pct of the whole pool, completers split the rest.
--     If nobody completes, everyone is refunded what is left after the fee.
--   Instructor: instructor receives (100 - fee_pct)% of entry fees.
--   Rounding cents go to the fee so payouts + fee always equal the gross amount.
CREATE PROCEDURE settle_challenge(IN p_challenge_id BIGINT UNSIGNED)
BEGIN
  DECLARE v_type VARCHAR(20); DECLARE v_status VARCHAR(20); DECLARE v_mode VARCHAR(10);
  DECLARE v_start DATE; DECLARE v_end DATE; DECLARE v_days INT; DECLARE v_spw INT;
  DECLARE v_staked BOOLEAN; DECLARE v_fee_pct DECIMAL(5,2); DECLARE v_instructor BIGINT UNSIGNED;
  DECLARE v_tasks INT; DECLARE v_needed INT;
  DECLARE v_gross DECIMAL(12,2) DEFAULT 0; DECLARE v_fee DECIMAL(12,2) DEFAULT 0; DECLARE v_each DECIMAL(12,2);
  DECLARE v_done INT DEFAULT 0; DECLARE v_total INT DEFAULT 0;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  START TRANSACTION;
  SELECT type, status, mode_75, start_date, end_date, duration_days, sessions_per_week, is_staked, fee_pct, instructor_id
    INTO v_type, v_status, v_mode, v_start, v_end, v_days, v_spw, v_staked, v_fee_pct, v_instructor
    FROM challenges WHERE id = p_challenge_id FOR UPDATE;

  IF v_status IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Challenge not found'; END IF;
  IF v_status <> 'active' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only an active challenge can be settled'; END IF;
  IF v_end >= CURDATE() THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This challenge has not ended yet'; END IF;
  IF EXISTS (SELECT 1 FROM proof_flags f JOIN session_logs l ON l.id = f.session_log_id
              WHERE l.challenge_id = p_challenge_id AND f.status = 'open') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Resolve open flags before settling';
  END IF;

  -- Who completed
  DROP TEMPORARY TABLE IF EXISTS tmp_completers;
  IF v_type = 'custom75' THEN
    SELECT COUNT(*) INTO v_tasks FROM challenge_tasks WHERE challenge_id = p_challenge_id;
    SET v_needed = IF(v_mode = 'hard', 75, 65);
    CREATE TEMPORARY TABLE tmp_completers AS
      SELECT user_id FROM (
        SELECT l.user_id, l.id FROM session_logs l JOIN task_checkins t ON t.session_log_id = l.id
         WHERE l.challenge_id = p_challenge_id AND l.status = 'counted'
         GROUP BY l.user_id, l.id HAVING COUNT(DISTINCT t.task_id) = v_tasks
      ) full_days GROUP BY user_id HAVING COUNT(*) >= v_needed;
  ELSE
    CREATE TEMPORARY TABLE tmp_completers AS
      SELECT user_id FROM v_member_weeks
       WHERE challenge_id = p_challenge_id AND sessions >= v_spw
       GROUP BY user_id HAVING COUNT(*) = v_days DIV 7;
  END IF;

  UPDATE challenge_members m
     SET m.status = IF(EXISTS (SELECT 1 FROM tmp_completers t WHERE t.user_id = m.user_id), 'completed', 'forfeited')
   WHERE m.challenge_id = p_challenge_id AND m.status = 'active';

  SELECT COUNT(*), COALESCE(SUM(status = 'completed'), 0), COALESCE(SUM(amount_paid), 0)
    INTO v_total, v_done, v_gross
    FROM challenge_members WHERE challenge_id = p_challenge_id AND status IN ('completed','forfeited');

  -- Money
  IF v_type = 'instructor' THEN
    SET v_fee = ROUND(v_gross * v_fee_pct / 100, 2);
    IF v_gross - v_fee > 0 THEN
      INSERT INTO payouts (user_id, challenge_id, kind, amount, scheduled_for)
      VALUES (v_instructor, p_challenge_id, 'instructor_earning', v_gross - v_fee, CURDATE() + INTERVAL 1 DAY);
    END IF;
  ELSEIF v_staked AND v_gross > 0 THEN
    SET v_fee = ROUND(v_gross * v_fee_pct / 100, 2);
    IF v_done > 0 THEN
      SET v_each = TRUNCATE((v_gross - v_fee) / v_done, 2);
      SET v_fee  = v_gross - v_each * v_done;
      INSERT INTO payouts (user_id, challenge_id, kind, amount, scheduled_for)
      SELECT user_id, p_challenge_id, 'jackpot', v_each, CURDATE() + INTERVAL 1 DAY
        FROM challenge_members WHERE challenge_id = p_challenge_id AND status = 'completed';
    ELSE
      SET v_each = TRUNCATE((v_gross - v_fee) / v_total, 2);
      SET v_fee  = v_gross - v_each * v_total;
      INSERT INTO payouts (user_id, challenge_id, kind, amount, scheduled_for)
      SELECT user_id, p_challenge_id, 'refund', v_each, CURDATE() + INTERVAL 1 DAY
        FROM challenge_members WHERE challenge_id = p_challenge_id AND status = 'forfeited' AND amount_paid > 0;
    END IF;
  END IF;

  INSERT INTO settlements (challenge_id, gross_amount, fee_pct, fee_amount, completers, forfeiters, amount_each)
  VALUES (p_challenge_id, v_gross, v_fee_pct, v_fee, v_done, v_total - v_done, v_each);

  UPDATE challenges SET status = 'settled' WHERE id = p_challenge_id;

  INSERT INTO notifications (user_id, type, title, body, data)
  SELECT user_id, 'challenge_settled',
         IF(status = 'completed', 'You completed the challenge', 'Challenge over'),
         IF(status = 'completed', 'Your payout is on its way.', 'Your stake went to the people who showed up. Ready for a rematch?'),
         JSON_OBJECT('challenge_id', p_challenge_id, 'amount_each', v_each)
    FROM challenge_members WHERE challenge_id = p_challenge_id AND status IN ('completed','forfeited');

  DROP TEMPORARY TABLE IF EXISTS tmp_completers;
  COMMIT;
END//

DELIMITER ;
