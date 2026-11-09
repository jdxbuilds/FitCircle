# FitCircle API

Node.js 22 + TypeScript + Fastify, on the MySQL 8 database in `../db`.
The platform rules live in the database; the API adds sign-in, payments, uploads, notifications and scheduled jobs.

## Run it locally

```bash
cd backend
npm install
# a MySQL 8 server with a user that can create databases
export DB_USER=fitcircle DB_PASSWORD=... JWT_SECRET=$(openssl rand -hex 32)
SCHEMA_PATH=../db/schema.sql npm run migrate   # creates the fitcircle database once
npm run dev                                     # http://localhost:3000
```

In development nothing real is sent or charged:

- **SMS:** the login code is printed in the server log and returned as `devCode`.
- **Payments:** confirm one with `POST /dev/payments/:id/complete`.
- **Uploads:** upload links and media links are placeholders.

## Tests

```bash
TEST_DB_USER=fitcircle TEST_DB_PASSWORD=... npm test
```

The tests rebuild a throwaway `fitcircle_test` database, then cover:

- **Sign-in:** SMS codes, wrong-code lockout and the under-16 refusal.
- **Peer group:** the full journey, including stakes, locked joining and leaving, same-day proof, nudges, reminders and flags.
- **Removal and settlement:** out after 3 missed sessions in a week; finishers get their stake plus 40% of forfeits, in whole shillings, sent once.
- **75-day:** daily tasks.
- **Instructor:** verification, the 35% fee, daily plans, flag review and the dashboard.
- **Account review:** triggered after 3 open flags.
- **Callbacks:** M-Pesa and Flutterwave.

## Settings (environment variables)

| Variable | Default | Notes |
|---|---|---|
| `DB_HOST` `DB_PORT` `DB_USER` `DB_PASSWORD` `DB_NAME` | `127.0.0.1` `3306` `root` – `fitcircle` | |
| `DB_SSL` | `off` | `rds` = TLS verified against Amazon RDS certificates |
| `JWT_SECRET` | – | 32+ characters; signs sign-in tokens (valid 30 days) |
| `PUBLIC_BASE_URL` | `http://localhost:3000` | Used to build M-Pesa callback URLs |
| `SMS_DRIVER` | `console` | `africastalking` + `AT_USERNAME`, `AT_API_KEY`, `AT_SENDER_ID` |
| `STORAGE_DRIVER` | `local` | `s3` + `S3_BUCKET`, `AWS_REGION` |
| `PAYMENTS_DRIVER` | `fake` | `live` + M-Pesa Daraja (`MPESA_*`) and Flutterwave (`FLW_*`) keys |
| `MPESA_ENV` | `sandbox` | `production` once Safaricom approves go-live |
| `MPESA_CALLBACK_TOKEN` | dev value | Secret part of the callback URLs |
| `RATE_LIMIT` | `on` | Tests turn it off; production refuses `off` |

With `NODE_ENV=production`, the server refuses to start with fake payments, local storage, console SMS or rate limiting off.

## Endpoints

All responses are JSON. Errors look like `{ "error": { "code": "rule_violation", "message": "Staked challenges are for ages 18 and up" } }`. The messages are written to show directly to users. Send `Authorization: Bearer <token>` on everything except sign-in and callbacks.

**Sign in**

| | |
|---|---|
| `POST /auth/otp` `{phone}` | Text a 6-digit code (Kenyan numbers, any format) |
| `POST /auth/verify` `{phone, code}` | Existing user → `token`; new number → `signupToken` |
| `GET /terms` | Current member and instructor terms versions |
| `POST /auth/signup` `{signupToken, firstName, dateOfBirth, goals[], acceptTerms: true}` | Create the profile → `token`. Refused without accepting the member terms; the version and time are stored |
| `GET /me` · `PATCH /me` | Profile, goals, `canStake`, instructor status |
| `GET /notifications?unread=1` · `POST /notifications/read` | Reminders, nudges, plans, results |

**Challenges**

| | |
|---|---|
| `POST /challenges` | `type: peer` (weeks, sessionsPerWeek ≥ 2, stake?), `custom75` (mode hard/soft, tasks[]), `instructor` (verified only; entryFee) |
| `GET /challenges/mine` · `GET /challenges/discover` | My challenges · open instructor programmes |
| `GET /invites/:code` · `POST /challenges/join {inviteCode}` | Preview and join a group |
| `POST /challenges/:id/join` | Join an instructor programme |
| `GET /challenges/:id` | Details, live stake pool, sponsored jackpot and its winner, tasks, settlement, what I still need to do |
| `POST /challenges/:id/leave` | Before the start only; paid stakes are refunded |
| `POST /challenges/:id/start` | Host starts early (otherwise the daily job does it on the start date) |
| `GET /challenges/:id/members` | |

**Money**

| | |
|---|---|
| `POST /challenges/:id/payments {provider: mpesa\|flutterwave}` | M-Pesa PIN prompt, or a card checkout link |
| `GET /payments/:id` | Poll until `succeeded` / `failed` |
| `POST /webhooks/mpesa/stk/:token` · `/b2c/:token` · `/webhooks/flutterwave` | Provider callbacks |

**Showing up**

| | |
|---|---|
| `POST /challenges/:id/uploads {contentType}` | Signed S3 upload form for today's proof (photo ≤ 15 MB, video ≤ 60 MB) |
| `POST /challenges/:id/logs {key, activity, taskIds[]}` | Log today's session → streak and weekly count |
| `GET /challenges/:id/leaderboard` | This week, logged today, streaks, at-risk |
| `GET /challenges/:id/feed?date=` | Proof with viewing links |
| `POST /challenges/:id/nudges {toUserId, message}` | Once per person per day |
| `POST /logs/:id/flags {reason, note}` | Flag proof |
| `GET /challenges/:id/plans/today` | Instructor's plan for today |

**Instructors**

| | |
|---|---|
| `POST /instructor/profile` `{displayName, …, acceptInstructorTerms: true}` | Apply. Refused without accepting the instructor terms; the version and time are stored |
| `POST /instructor/uploads {purpose, contentType}` → `POST /instructor/documents {docType, key}` | Certification, national ID, demo video, voice notes |
| `GET /instructor/dashboard` | Programmes, fees, your 65% share, logged today, at risk, open flags, earnings, payouts |
| `POST /challenges/:id/plans` | Post the day's plan; every participant is notified |
| `GET /challenges/:id/flags` · `PATCH /flags/:id {decision}` | Review flagged proof |

**FitCircle team** (`role = admin`, set directly in the database)

| | |
|---|---|
| `GET /admin/instructors?verification=pending` | Applications with document links |
| `POST /admin/instructor-documents/:id/review` · `POST /admin/instructors/:id/decision` | Approve documents, then verify |
| `GET /admin/flags` · `GET /admin/users/under-review` · `POST /admin/users/:id/status` | Trust and safety |
| `POST /admin/sponsors` · `GET /admin/sponsors` | Sponsors who pay for jackpot prizes |
| `PUT /admin/challenges/:id/jackpot {sponsorId, prize, valueKes}` | Attach a sponsor's prize to an open challenge |
| `GET /admin/jackpots` · `POST /admin/jackpots/:challengeId/fulfilled` | Winners, and marking a prize as delivered |
| `POST /admin/challenges/:id/settle` | Settle by hand (normally the daily job does it) |

## Scheduled jobs

`node dist/jobs.js <job>`. On AWS these run on a schedule, at Nairobi times:

- `daily` (00:05): start challenges whose start date has come, remove members who missed too many sessions, settle ended challenges, send due payouts.
- `morning` (06:30): reminder to everyone in a running challenge.
- `evening` (19:00): reminder to anyone who hasn't logged yet.

Settlement waits while a challenge has open flags. Payouts go out the day after settlement. Each payout is claimed before it is sent, so it can never be paid twice.
