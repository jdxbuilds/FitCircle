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

- **Peer Groups:** weekly target, shared Jackpot, forfeits go to completers, FitCircle keeps 30%
- **Instructor Challenges:** verified coaches, paid 1–12 week programmes, instructor keeps 65%, FitCircle 35%
- **Custom 75-Day:** build your own 75 Hard / 75 Soft with daily tasks, FitCircle keeps 30%

## Prototype

Open `prototype/index.html` in a browser. Use the left-hand rail to switch formats or jump to any step.

Switch **View the app as → Instructor** (or tap "I'm a fitness trainer" on the format screen) to see the instructor side: verification, today's dashboard, posting the daily plan, members at risk with nudges, reviewing flagged proof, earnings and payouts, and launching a new programme.
