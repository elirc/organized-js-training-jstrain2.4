# Orbit Deploy Console

Internal developer platform MVP inspired by Heroku/Vercel workflows.

It includes:

- Applications and services with environment management
- Deployment state machine and rollback workflows
- Pipeline DAG visualization and stage editing
- Real-time SSE log streaming with virtualized log rendering
- Monitoring charts, health checks, and alert rules
- Feature flags with dependency checks and kill switch
- Secrets with encryption and version history
- Team RBAC-aware actions and audit logging
- CLI-mirrored endpoints (`/api/cli/*`)

## Stack

- Next.js App Router (JavaScript)
- Prisma ORM + SQLite
- Zustand + TanStack Query
- React Flow + Recharts + TanStack Virtual

## Run

```bash
npm install
npm run db:setup
npm run dev
```

App URL: `http://localhost:3000`

## Database Notes

This environment had Prisma schema-engine issues with `prisma db push` and `prisma migrate dev`.

`npm run db:setup` uses a deterministic fallback:

1. `prisma generate`
2. `prisma migrate diff --from-empty ... --script` (build SQL)
3. `prisma db execute --file prisma/init.sql`
4. `npm run db:seed`

## Scripts

- `npm run db:setup` - reset/apply schema and seed
- `npm run db:seed` - seed sample platform data
- `npm run lint` - lint check
- `npm run build` - production build

## About this snapshot

This repository is a snapshot of [elirc/jstrain2.4](https://github.com/elirc/jstrain2.4), taken before that repo added its `astraupskill/` course, two `tests/` files, and an application/environment match check in `POST /api/deployments`. Every other file matches. The learning-path link fixes from its 2026-10 doc pass were ported here; `_learning/00-ARCHITECTURE.md` describes the check as a known gap, because this code does not have it yet. Checked on 2026-10-06.
