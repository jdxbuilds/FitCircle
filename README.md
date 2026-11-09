# FitCircle

Social fitness accountability: join a circle, stake money on showing up, prove every session.

| Folder | What it is |
|---|---|
| `prototype/` | Clickable MVP of the app (open `index.html` in a browser) |
| `db/` | MySQL 8 database: tables, platform rules, settlement ([db/README.md](db/README.md)) |
| `backend/` | The API: Node.js + TypeScript ([backend/README.md](backend/README.md)) |
| `infra/` | AWS setup as code: containers, database, storage, scheduled jobs ([infra/README.md](infra/README.md)) |

Every push runs the database rule checks, the API tests and the AWS template build (`.github/workflows/ci.yml`).

## The three formats

- **Peer Groups:** weekly target, shared stake pool. Miss 3 sessions in a week (or every session, for 2-a-week groups) and you're out: FitCircle keeps 60% of your stake, finishers share 40% on top of getting their own stake back
- **Instructor Challenges:** verified coaches, paid 1–12 week programmes. Finishers' fees: instructor 65%, FitCircle 35%. Removed members' fees: FitCircle 60%, instructor 40%
- **Custom 75-Day:** build your own 75 Hard / 75 Soft with daily tasks. Miss 3 days and you're out: FitCircle keeps 100% of your stake; finishers get their stake back

Every month there is one FitCircle-wide **jackpot**: a prize paid for by a sponsor (for example a Paradise Lost day pass), never from members' stakes. There is one winner, the top performer across all challenges that calendar month: most sessions, then longest streak, then a random draw. The ranking resets on the 1st of every month.

## Prototype

Open `prototype/index.html` in a browser. Use the left-hand rail to switch formats or jump to any step.

Switch **View the app as → Instructor** (or tap "I'm a fitness trainer" on the format screen) to see the instructor side: verification, today's dashboard, posting the daily plan, members at risk with nudges, reviewing flagged proof, earnings and payouts, and launching a new programme.
