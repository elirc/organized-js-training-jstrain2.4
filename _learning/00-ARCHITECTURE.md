# Orbit Deploy Console — Architecture Guide

## What This App Does

Orbit Deploy Console is an **internal developer platform** (IDP) — think of it as a mini Heroku or Vercel that a company would run internally. It lets engineering teams:

- Register and manage applications (microservices)
- Deploy code through a defined pipeline (build → test → staging → production)
- Monitor application health with real-time metrics and charts
- Stream deployment logs live in the browser
- Toggle feature flags with rollout percentages and kill switches
- Manage encrypted secrets with rotation and version history
- Lock environments to prevent accidental deploys
- Audit every action for compliance and debugging

**Who it's for:** Platform engineering teams and the developers they support. The dashboard is the web UI; the `/api/cli/*` endpoints mirror the same operations for a command-line tool.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          BROWSER (React)                            │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │  Zustand      │  │  TanStack    │  │  React Components        │  │
│  │  (UI state)   │  │  Query       │  │  (Dashboard, Panels,     │  │
│  │  store.js     │  │  (server     │  │   Timeline, Graphs...)   │  │
│  │               │  │   cache)     │  │                          │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────────────────────┘  │
│         │                  │                                        │
│         └──────────┬───────┘                                        │
│                    │ fetch() / EventSource                           │
└────────────────────┼────────────────────────────────────────────────┘
                     │ HTTP (JSON + SSE)
┌────────────────────┼────────────────────────────────────────────────┐
│                    ▼                                                │
│              NEXT.JS SERVER (App Router)                            │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    API Route Handlers                        │   │
│  │  /api/bootstrap   /api/deployments   /api/feature-flags     │   │
│  │  /api/applications /api/environments  /api/secrets           │   │
│  │  /api/pipelines   /api/monitoring     /api/audit             │   │
│  │  /api/cli/deploy  /api/cli/env        /api/cli/logs          │   │
│  │  /api/deployments/[id]/logs/stream  (SSE)                    │   │
│  └────────────────────────┬────────────────────────────────────┘   │
│                            │                                        │
│  ┌─────────────────────────┼───────────────────────────────────┐   │
│  │                  Service Layer (lib/)                         │   │
│  │  session.js  rbac.js  audit.js  secrets.js  deployments.js  │   │
│  │  platform-service.js  metrics.js  api.js  store.js          │   │
│  └────────────────────────┬────────────────────────────────────┘   │
│                            │                                        │
│  ┌─────────────────────────┼───────────────────────────────────┐   │
│  │              Prisma ORM (lib/prisma.js)                      │   │
│  └────────────────────────┬────────────────────────────────────┘   │
│                            │                                        │
└────────────────────────────┼────────────────────────────────────────┘
                             │ SQL
┌────────────────────────────┼────────────────────────────────────────┐
│                     SQLite Database                                  │
│                     prisma/dev.db                                    │
│                                                                     │
│  Organization → Team → Application → Environment → Deployment       │
│                    ↓         ↓             ↓           ↓            │
│               TeamMember  Pipeline    EnvVariable  DeploymentLog    │
│                           Stage/Step  FeatureFlag  MonitoringMetric │
│                                       Secret       AuditLogEntry   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Request/Response Lifecycle

Let's trace what happens when a user clicks **"New Deploy"** in the browser:

### 1. User clicks the button
The `DeploymentTimeline` component calls `createDeploy.mutate(payload)`, which is a TanStack Query mutation.

### 2. Client sends HTTP request
The `fetchJson()` helper in `lib/api.js` sends a `POST /api/deployments` request with JSON body containing `applicationId`, `environmentId`, and `pipelineId`.

### 3. Next.js routes to the handler
Next.js App Router matches `/api/deployments` to `app/api/deployments/route.js` and calls its `POST` function.

### 4. Request validation
The handler uses **Zod** to validate the incoming JSON against `createDeploymentSchema`. If validation fails, it immediately returns a 400 error with details.

### 5. Authentication / Authorization
- `getActor(request)` looks up the current user from the `x-user-email` header (or defaults to the first user — this is a dev MVP, not production auth).
- `getTeamRole()` checks what role that user has on the team that owns the app.
- `canPerform(role, "deploy")` checks the RBAC permission table.
- `canDeployToEnvironment(role, envSlug)` checks environment-level permissions (e.g., VIEWERs can't deploy anywhere, DEPLOYERs can't deploy to production).

### 6. Business logic checks
The handler checks if the environment is deploy-locked or if the application has a code freeze (`deployFrozen`). If so, it returns HTTP 423 (Locked).

### 7. Service layer creates the deployment
`createDeployment()` in `lib/platform-service.js`:
- Queries all existing deployment versions for this app
- Auto-generates the next semantic version if none was provided
- Creates the deployment record in SQLite via Prisma with status `BUILDING`
- Writes an audit log entry

### 8. Response sent back
The new deployment object is returned as JSON with status 201.

### 9. Client updates
TanStack Query's `onSuccess` callback calls `queryClient.invalidateQueries({ queryKey: ["bootstrap"] })`, which triggers a refetch of all dashboard data, causing every component to re-render with the new deployment visible.

---

## Key Design Decisions

### Why Next.js App Router?
Next.js provides both the React frontend and the API backend in one project. The App Router (the `app/` directory) is the modern Next.js routing system where:
- `app/page.js` = the homepage
- `app/api/*/route.js` = API endpoints
- `app/layout.js` = shared HTML wrapper

This means **one `npm run dev` starts both frontend and backend**. For a team tool MVP, this is ideal.

### Why SQLite + Prisma?
SQLite is a file-based database (no server to install), perfect for development. Prisma provides type-safe database queries and handles schema management. The `prisma/schema.prisma` file defines every table, column, and relationship in one place.

### Why Zustand + TanStack Query?
This is a deliberate **separation of concerns**:
- **Zustand** (`lib/store.js`) manages **UI state** — which app is selected, which deployment is selected, log filter settings. This state lives only in the browser.
- **TanStack Query** manages **server state** — the actual data from the database. It handles caching, refetching, loading states, and error states.

### Why this folder structure?
```
app/          ← Next.js pages and API routes (framework convention)
components/   ← React UI components (presentational + interactive)
lib/          ← Business logic, utilities, and database access
prisma/       ← Database schema, migrations, and seed data
scripts/      ← One-off setup scripts
```
This separates **what the user sees** (components) from **how things work** (lib) from **how data is stored** (prisma) from **how requests are routed** (app/api).

### Why the bootstrap endpoint?
Instead of each component fetching its own data, the app loads everything in one big request to `/api/bootstrap`. This is a pragmatic choice for an MVP — it means fewer API calls and simpler component code, at the cost of loading more data than any single view needs.

---

## Dependency Map

```
Components (browser)
    ├── lib/store.js      (Zustand — UI state)
    ├── lib/api.js         (fetchJson helper)
    └── @tanstack/react-query (server state cache)

API Routes (server)
    ├── lib/session.js     (user identification)
    ├── lib/rbac.js        (permission checks)
    ├── lib/audit.js       (audit logging)
    ├── lib/secrets.js     (encryption/decryption)
    ├── lib/deployments.js (state machine, versioning)
    ├── lib/metrics.js     (data aggregation)
    ├── lib/platform-service.js (orchestrates db + audit)
    └── lib/prisma.js      (database connection)
         └── prisma/schema.prisma (table definitions)
```

**Key dependency rule:** Components never import `lib/prisma.js` or any server-only module. The `"use client"` directive at the top of each component file tells Next.js "this runs in the browser" — and browser code can't access the database directly.

---

## Environment and Infrastructure

### Development
```bash
npm install          # install all dependencies
npm run db:setup     # create SQLite database, apply schema, seed sample data
npm run dev          # start Next.js dev server on http://localhost:3000
```

The dev server uses **Turbopack** (Next.js's bundler) for fast hot-module replacement — when you edit a file, the browser updates almost instantly.

### Production
```bash
npm run build        # compiles everything into optimized bundles
npm run start        # runs the production server
```

In production, you'd swap SQLite for PostgreSQL (just change `DATABASE_URL` in `.env` and the Prisma schema's `provider`), add real authentication, and deploy to a server or container platform.

### Database Setup Workaround
The `scripts/setup-db.js` file exists because Prisma's standard migration tools (`prisma migrate dev`, `prisma db push`) had issues in this environment. Instead, it:
1. Deletes the old database file
2. Generates the Prisma client (TypeScript types for your tables)
3. Uses `prisma migrate diff` to generate raw SQL from the schema
4. Executes that SQL directly
5. Runs the seed script to populate sample data

This is a practical workaround — in a real production setup, you'd use Prisma's standard migration workflow.
