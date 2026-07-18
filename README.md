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
