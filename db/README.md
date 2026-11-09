# FitCircle database (MySQL 8)

| File | What it does |
|---|---|
| `schema.sql` | Creates the `fitcircle` database: tables, rules (triggers), views and procedures |
| `seed.sql` | Demo data matching the prototype: Ofisi Movers, Karura Forest 10K, October 75 Soft |
| `test.sh` | Rebuilds the database and checks every platform rule (38 checks) |

```bash
mysql -u root -p < db/schema.sql
mysql -u root -p fitcircle < db/seed.sql
MYSQL_PWD=YOURPASSWORD MYSQL="mysql -h 127.0.0.1 -u root" db/test.sh
```

Every app connection should run `SET time_zone = '+03:00';` so "today" is Nairobi's day.

## Tables

- **People:** `users`, `otp_codes` (SMS sign-in), `user_goals`, `organizations`, `organization_members` (corporate wellness)
- **Instructors:** `instructor_profiles`, `instructor_documents` (certification, ID, demo video)
- **Challenges:** `challenges` (peer, instructor, custom75 in one table), `challenge_tasks`, `challenge_members`
- **Money in:** `payments` (M-Pesa, Flutterwave), `subscriptions`
- **Showing up:** `session_logs` (one proof per member per day), `task_checkins`, `proof_flags`
- **Staying visible:** `nudges`, `notifications`, `daily_plans`
- **Money out:** `settlements`, `payouts`
- **Settings:** `platform_settings` holds the fees and forfeit splits (instructor 35%; forfeits 60% group, 100% 75-day), the missed-session limits and age limits

## Rules the database enforces itself

16+ to sign up, 18+ to stake · at least 2 sessions a week · same-day proof only · no proof, no credit ·
nobody joins or withdraws after the start · only verified instructors host · no flagging your own proof ·
3 unresolved flags put an account under review · a challenge settles once, and payouts + fee always equal the pool.

## App calls

- `CALL start_challenge(id)` locks stakes and removes anyone who hasn't paid.
- `CALL apply_removals()` removes anyone who missed 3 sessions in a week, or 3 days of a 75-day challenge (run daily).
- `CALL settle_challenge(id)` marks who completed, returns finishers' stakes plus their share of forfeits, and creates payouts.
- Read screens from `v_leaderboard`, `v_stake_pools`, `v_instructor_dashboard`, `v_member_streaks`.

## Notes

- `@fitcircle_backfill = 1` lets an admin session import past sessions. Never set it from the app.
- Insert flags and payments by ID (`VALUES`), not `INSERT … SELECT` from the table the trigger updates; MySQL refuses that.
- Payouts are whole shillings (M-Pesa); leftover shillings go to FitCircle. If nobody in a peer group finishes, FitCircle keeps the forfeited stakes (no one to share the 40% with).
