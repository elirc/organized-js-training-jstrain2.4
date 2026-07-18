# Learning Path

Read the guides in this order. Each chapter builds on the previous one. Don't skip ahead — the later files assume you understand concepts from earlier ones.

---

## Chapter 1: Project Foundation & Configuration

**Goal:** Understand what this project is, how it's set up, and how the tools work together.

Read in order:
1. `guides/package.json.guide.md` — What dependencies the project uses and why
2. `guides/jsconfig.json.guide.md` — How path aliases work
3. `guides/app/globals.css.guide.md` — How the app is styled (CSS custom properties, layout)

**Checkpoint:** After this chapter you should understand:
- What npm packages this project depends on and what each one does
- How `@/` import paths work
- How CSS custom properties create a consistent design system

---

## Chapter 2: Database Layer

**Goal:** Understand how data is stored, what tables exist, and how they relate to each other.

Read in order:
1. `guides/prisma/schema.prisma.guide.md` — The entire data model
2. `guides/lib/prisma.js.guide.md` — How the app connects to the database
3. `guides/prisma/seed.js.guide.md` — How sample data is created
4. `guides/scripts/setup-db.js.guide.md` — How the database is initialized

**Checkpoint:** After this chapter you should understand:
- What an ORM is and why Prisma is used
- How tables relate to each other (one-to-many, many-to-many)
- What "seeding" a database means and why you do it
- How enums enforce valid values
- The singleton pattern for database connections

---

## Chapter 3: Core Business Logic

**Goal:** Understand the rules that govern how the application works — permissions, state machines, encryption.

Read in order:
1. `guides/lib/rbac.js.guide.md` — Role-based access control
2. `guides/lib/session.js.guide.md` — User identification
3. `guides/lib/audit.js.guide.md` — Audit logging
4. `guides/lib/deployments.js.guide.md` — Deployment state machine and versioning
5. `guides/lib/secrets.js.guide.md` — Encryption and decryption
6. `guides/lib/metrics.js.guide.md` — Data aggregation for charts
7. `guides/lib/platform-service.js.guide.md` — Orchestration layer
8. `guides/lib/api.js.guide.md` — HTTP client helper

**Checkpoint:** After this chapter you should understand:
- How RBAC works and why different roles have different permissions
- What a state machine is and how deployments use one
- How AES-256-GCM encryption works at a high level
- How raw metrics are bucketed and averaged for chart display
- Why a "service layer" sits between API routes and the database
- What semantic versioning is

---

## Chapter 4: Client-Side State Management

**Goal:** Understand how the browser manages data and UI state.

Read in order:
1. `guides/lib/store.js.guide.md` — Zustand store for UI state
2. `guides/app/providers.js.guide.md` — TanStack Query setup

**Checkpoint:** After this chapter you should understand:
- The difference between "UI state" and "server state"
- How Zustand's `create` function works
- What `staleTime` and cache invalidation mean
- Why state is reset when you change selections (cascading resets)

---

## Chapter 5: App Shell & Routing

**Goal:** Understand how Next.js structures pages and how the app boots up.

Read in order:
1. `guides/app/layout.js.guide.md` — Root HTML layout, fonts, providers
2. `guides/app/page.js.guide.md` — The homepage

**Checkpoint:** After this chapter you should understand:
- How Next.js App Router maps files to URLs
- What a layout component is and why it wraps all pages
- How Google Fonts are loaded and applied via CSS variables
- The difference between server components and client components

---

## Chapter 6: API Routes — Data Loading

**Goal:** Understand how the server handles requests and returns data.

Read in order:
1. `guides/app/api/bootstrap/route.js.guide.md` — The big data-loading endpoint
2. `guides/app/api/applications/route.js.guide.md` — CRUD for applications
3. `guides/app/api/environments/route.js.guide.md` — Environment management
4. `guides/app/api/audit/route.js.guide.md` — Audit log queries and export

**Checkpoint:** After this chapter you should understand:
- How Next.js API routes work (export named HTTP method functions)
- How Zod validates incoming request data
- How Prisma's `include` loads related data (eager loading)
- How sensitive data is masked before being sent to the client
- How file downloads work with Content-Disposition headers

---

## Chapter 7: API Routes — Deployment Lifecycle

**Goal:** Understand the most complex workflow in the app: deploying code.

Read in order:
1. `guides/app/api/deployments/route.js.guide.md` — Creating and listing deployments
2. `guides/app/api/deployments/[id]/route.js.guide.md` — Transitioning deployment status
3. `guides/app/api/deployments/[id]/rollback/route.js.guide.md` — Rolling back
4. `guides/app/api/deployments/[id]/logs/route.js.guide.md` — Fetching logs
5. `guides/app/api/deployments/[id]/logs/stream/route.js.guide.md` — **Server-Sent Events (SSE)**

**Checkpoint:** After this chapter you should understand:
- How dynamic route segments (`[id]`) work in Next.js
- The full deployment lifecycle: BUILDING → DEPLOYING → LIVE (or FAILED → ROLLED_BACK)
- How Server-Sent Events work (real-time data from server to browser)
- How ReadableStream creates streaming HTTP responses
- The difference between REST CRUD and state-transition APIs

---

## Chapter 8: API Routes — Pipelines, Monitoring, Flags, Secrets

**Goal:** Fill out your understanding of the remaining API endpoints.

Read in order:
1. `guides/app/api/pipelines/route.js.guide.md` — Pipeline editing with transactions
2. `guides/app/api/monitoring/route.js.guide.md` — Metrics and health checks
3. `guides/app/api/feature-flags/route.js.guide.md` — Feature flags with dependency checks
4. `guides/app/api/secrets/route.js.guide.md` — Encrypted secret management

**Checkpoint:** After this chapter you should understand:
- How database transactions ensure atomic operations
- How `Promise.allSettled` differs from `Promise.all`
- How feature flag dependencies prevent invalid states
- How secret rotation creates new versions without losing history

---

## Chapter 9: CLI API Endpoints

**Goal:** Understand how the same backend serves both a web UI and a CLI tool.

Read in order:
1. `guides/app/api/cli/deploy/route.js.guide.md`
2. `guides/app/api/cli/env/route.js.guide.md`
3. `guides/app/api/cli/logs/route.js.guide.md`
4. `guides/app/api/cli/rollback/route.js.guide.md`

**Checkpoint:** After this chapter you should understand:
- Why CLI and web UI endpoints are separate despite similar logic
- How environment slugs differ from IDs for CLI ergonomics
- The concept of "API surface area" for different consumers

---

## Chapter 10: React Components — Layout & Navigation

**Goal:** Understand how the UI is structured and how components communicate.

Read in order:
1. `guides/components/platform-dashboard.jsx.guide.md` — The main orchestrator component
2. `guides/components/app-selector.jsx.guide.md` — Sidebar navigation and app creation

**Checkpoint:** After this chapter you should understand:
- How a parent component coordinates child components via props and state
- How TanStack Query's `useQuery` hook works
- How `useMemo` prevents unnecessary recalculations
- How `useEffect` synchronizes state when selections change
- How mutations with `invalidateQueries` keep the UI in sync

---

## Chapter 11: React Components — Core Features

**Goal:** Understand the main interactive panels.

Read in order:
1. `guides/components/deployment-timeline.jsx.guide.md` — Deployment cards with state transitions
2. `guides/components/environment-panel.jsx.guide.md` — Environment variables and deploy locks
3. `guides/components/pipeline-graph.jsx.guide.md` — DAG visualization with React Flow
4. `guides/components/log-stream-panel.jsx.guide.md` — **Virtualized log streaming**

**Checkpoint:** After this chapter you should understand:
- How to build interactive cards with multiple action buttons
- How `event.stopPropagation()` prevents click event bubbling
- How React Flow renders directed acyclic graphs
- How `useVirtualizer` renders thousands of rows efficiently
- How EventSource connects to SSE endpoints for real-time data
- How to filter large datasets client-side with `useMemo`

---

## Chapter 12: React Components — Observability & Configuration

**Goal:** Complete your understanding of all UI panels.

Read in order:
1. `guides/components/monitoring-panel.jsx.guide.md` — Charts with Recharts
2. `guides/components/feature-flags-panel.jsx.guide.md` — Flag management UI
3. `guides/components/secrets-panel.jsx.guide.md` — Secret creation and rotation
4. `guides/components/audit-panel.jsx.guide.md` — Audit log display

**Checkpoint:** After this chapter you should understand:
- How Recharts renders responsive line charts with dual Y-axes
- How controlled forms work with React state
- How to conditionally render UI based on user actions (e.g., showing a rotation form)
- How to display audit trails with actor attribution
- How `refetchInterval` creates auto-refreshing data

---

## Final Project Exercises

After completing all chapters, try these challenges:

1. **Add a "promote to production" button** on staging deployments that creates a new production deployment linked via `promotedFromId`
2. **Add environment variable deletion** — currently you can only add/update variables
3. **Add a deployment duration display** — calculate and show elapsed time from `startedAt` to `completedAt`
4. **Add a "resolve alert" button** to the monitoring panel
5. **Create a new CLI endpoint** `/api/cli/status` that returns the current status of an application's latest deployment
