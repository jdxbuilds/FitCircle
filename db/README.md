# FitCircle database (MySQL 8)

| File | What it does |
|---|---|
| `schema.sql` | Creates the `fitcircle` database: tables, rules (triggers), views and procedures |
| `seed.sql` | Demo data matching the prototype: Ofisi Movers, Karura Forest 10K, October 75 Soft |
| `test.sh` | Rebuilds the database and checks every platform rule (38 checks) |

```bash
mysql -u root -p < db/schema.sql
mysql -u root -p fitcircle < db/seed.sql
MYSQL="mysql -u root -pYOURPASSWORD" db/test.sh
```

Every app connection should run `SET time_zone = '+03:00';` so "today" is Nairobi's day.

## Tables

- **People:** `users`, `user_goals`, `organizations`, `organization_members` (corporate wellness)
- **Instructors:** `instructor_profiles`, `instructor_documents` (certification, ID, demo video)
- **Challenges:** `challenges` (peer, instructor, custom75 in one table), `challenge_tasks`, `challenge_members`
- **Money in:** `payments` (M-Pesa, Flutterwave), `subscriptions`
- **Showing up:** `session_logs` (one proof per member per day), `task_checkins`, `proof_flags`
- **Staying visible:** `nudges`, `notifications`, `daily_plans`
- **Money out:** `settlements`, `payouts`
- **Settings:** `platform_settings` holds the fees (35% instructor-led, 30% everything else) and age limits

## Rules the database enforces itself

16+ to sign up, 18+ to stake · at least 2 sessions a week · same-day proof only · no proof, no credit ·
nobody joins or withdraws after the start · only verified instructors host · no flagging your own proof ·
3 unresolved flags put an account under review · a challenge settles once, and payouts + fee always equal the pool.

## App calls

- `CALL start_challenge(id)` locks stakes and removes anyone who hasn't paid.
- `CALL settle_challenge(id)` marks who completed, takes FitCircle's fee, splits the rest among completers and creates payouts.
- Read screens from `v_leaderboard`, `v_jackpots`, `v_instructor_dashboard`, `v_member_streaks`.

## Notes

- `@fitcircle_backfill = 1` lets an admin session import past sessions. Never set it from the app.
- Insert flags and payments by ID (`VALUES`), not `INSERT … SELECT` from the table the trigger updates; MySQL refuses that.
- The fee is taken from the whole pool. If nobody completes, everyone is refunded what's left after the fee.
