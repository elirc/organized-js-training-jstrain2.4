# Concepts Glossary

Every technical concept used in this project, defined in plain English with a real code example from the codebase.

---

### API Route (Next.js)

A file that handles HTTP requests on the server. In Next.js App Router, you export functions named after HTTP methods (`GET`, `POST`, `PATCH`, `DELETE`) from `route.js` files.

```js
// app/api/applications/route.js
export async function GET() {
  const applications = await prisma.application.findMany();
  return NextResponse.json(applications);
}
```

---

### Audit Log

A chronological record of who did what and when. Used for compliance, debugging, and accountability. Every important action in this app writes an audit entry.

```js
// lib/audit.js
await writeAuditEntry({
  actorUserId: actor.id,
  action: "deployment.started",
  entityType: "Deployment",
  entityId: deployment.id,
});
```

---

### Authentication vs Authorization

**Authentication** = "Who are you?" (identifying the user). **Authorization** = "Are you allowed to do this?" (checking permissions). This app does both:

```js
// Authentication — lib/session.js
const actor = await getActor(request); // Who is making this request?

// Authorization — lib/rbac.js
if (!canPerform(role, "deploy")) { /* reject */ } // Can they deploy?
```

---

### Cache Invalidation

Telling the cache that its data is stale and needs to be refetched. TanStack Query does this when a mutation succeeds.

```js
// components/deployment-timeline.jsx
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
}
```

---

### Cascading Delete

When you delete a parent record, all its children are automatically deleted too. Defined in the Prisma schema with `onDelete: Cascade`.

```prisma
// prisma/schema.prisma
model Environment {
  application Application @relation(fields: [applicationId], references: [id], onDelete: Cascade)
}
```
If you delete an Application, all its Environments are deleted automatically.

---

### Client Component (Next.js)

A React component that runs in the browser. Marked with `"use client"` at the top. Can use hooks like `useState`, `useEffect`, and browser APIs. Cannot directly access the database.

```jsx
// components/platform-dashboard.jsx
"use client";
import { useState } from "react";
```

---

### Compound Index

A database index on multiple columns, used to speed up queries that filter or sort by those columns together.

```prisma
// prisma/schema.prisma
@@index([applicationId, environmentId, createdAt])
```
This makes queries like "get deployments for app X in environment Y, sorted by date" fast.

---

### Controlled Component (React)

A form input whose value is controlled by React state, not by the DOM. The state is the "single source of truth."

```jsx
// components/app-selector.jsx
<input
  value={newApp.name}
  onChange={(event) => setNewApp((current) => ({ ...current, name: event.target.value }))}
/>
```

---

### CSS Custom Properties (CSS Variables)

Variables defined in CSS that can be reused throughout stylesheets. Prefixed with `--`.

```css
/* app/globals.css */
:root {
  --accent: #6be08e;
  --danger: #f06f62;
}
.chip { border-color: var(--accent); }
```

---

### DAG (Directed Acyclic Graph)

A graph where edges have direction (A → B) and there are no cycles (you can never follow edges back to where you started). Deployment pipelines are DAGs: Build → Test → Staging → Production.

```js
// components/pipeline-graph.jsx
edges.push({
  source: pipeline.stages[stageIndex - 1].id,
  target: stage.id,
  animated: true,
});
```

---

### Destructuring

Extracting values from objects or arrays into individual variables. Used extensively in JavaScript.

```js
// lib/platform-service.js
const { applicationId, environmentId, actorUserId } = parsed.data;
```

---

### Dynamic Route Segment

A URL parameter that changes per request. In Next.js, represented by `[paramName]` in folder names.

```
app/api/deployments/[id]/route.js
// When someone requests /api/deployments/abc123,
// params.id === "abc123"
```

---

### Eager Loading

Loading related data in one query instead of separate queries. Prisma uses `include` for this.

```js
// app/api/bootstrap/route.js
const org = await prisma.organization.findFirst({
  include: {
    teams: {
      include: {
        applications: {
          include: { environments: true }
        }
      }
    }
  }
});
```

---

### Encryption (AES-256-GCM)

A method of converting readable text into unreadable ciphertext. AES-256-GCM is an authenticated encryption algorithm — it both encrypts and verifies data integrity.

```js
// lib/secrets.js
const cipher = createCipheriv("aes-256-gcm", key, iv);
const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
const tag = cipher.getAuthTag(); // authentication tag
```

---

### Enum (Enumeration)

A set of named constants. Used to restrict a field to specific valid values.

```prisma
// prisma/schema.prisma
enum DeploymentStatus {
  BUILDING
  DEPLOYING
  LIVE
  FAILED
  ROLLED_BACK
}
```

---

### Environment Variable

A configuration value that changes between environments (dev, staging, production). Stored outside the code so the same code runs differently in different places.

```
# .env
DATABASE_URL="file:./dev.db"
```

---

### EventSource / Server-Sent Events (SSE)

A browser API for receiving a continuous stream of events from the server over HTTP. Unlike WebSockets, SSE is one-directional (server → client).

```js
// components/log-stream-panel.jsx
const source = new EventSource(`/api/deployments/${deploymentId}/logs/stream`);
source.addEventListener("log", (event) => {
  const payload = JSON.parse(event.data);
});
```

---

### Foreign Key

A column in one table that references the primary key of another table, creating a relationship.

```prisma
// prisma/schema.prisma
model Deployment {
  applicationId String
  application   Application @relation(fields: [applicationId], references: [id])
}
```

---

### Global Singleton

An object that exists only once in the entire application. Used for database connections to prevent creating too many.

```js
// lib/prisma.js
const globalForPrisma = globalThis;
export const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

---

### HTTP Status Codes (used in this project)

| Code | Meaning | Example in project |
|------|---------|-------------------|
| 200 | OK | Successful GET request |
| 201 | Created | New deployment created |
| 400 | Bad Request | Zod validation failed |
| 403 | Forbidden | RBAC check failed |
| 404 | Not Found | Deployment ID doesn't exist |
| 409 | Conflict | Feature flag dependency not met |
| 423 | Locked | Environment is deploy-locked |

---

### Initialization Vector (IV)

A random value used in encryption to ensure that encrypting the same text twice produces different ciphertext.

```js
// lib/secrets.js
const iv = randomBytes(12); // 12 bytes = 96 bits, standard for GCM
```

---

### Lookup Table (for permissions)

A data structure that maps keys to allowed values. Faster and clearer than if/else chains.

```js
// lib/rbac.js
const ACTIONS = {
  view: ["OWNER", "DEPLOYER", "VIEWER"],
  deploy: ["OWNER", "DEPLOYER"],
  lockDeploys: ["OWNER"],
};
```

---

### Mutation (TanStack Query)

An operation that changes server-side data (create, update, delete). Opposite of a query (which reads data).

```js
// components/deployment-timeline.jsx
const createDeploy = useMutation({
  mutationFn: (payload) => fetchJson("/api/deployments", { method: "POST", body: JSON.stringify(payload) }),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ["bootstrap"] }),
});
```

---

### Nullish Coalescing (`??`)

Returns the right side only if the left side is `null` or `undefined` (not for other falsy values like `0` or `""`).

```js
// lib/rbac.js
const allowed = ACTIONS[action] ?? [];
// If ACTIONS[action] is undefined, use empty array
```

---

### Optional Chaining (`?.`)

Safely accesses nested properties without throwing if something along the chain is `null` or `undefined`.

```js
// components/platform-dashboard.jsx
const activePipeline = application?.pipelines?.[0];
```

---

### ORM (Object-Relational Mapping)

A tool that lets you interact with a database using programming language objects instead of raw SQL. Prisma is the ORM used here.

```js
// Instead of: SELECT * FROM Application WHERE id = 'abc'
const app = await prisma.application.findUnique({ where: { id: "abc" } });
```

---

### Promise.allSettled

Waits for all promises to complete, whether they succeed or fail. Unlike `Promise.all`, it never rejects early.

```js
// app/api/monitoring/route.js
const checks = await Promise.allSettled([
  runHealthCheck("api"),
  runHealthCheck("worker"),
  runHealthCheck("db"),
]);
// checks[0] might be { status: "fulfilled", value: {...} }
// checks[1] might be { status: "rejected", reason: Error }
```

---

### RBAC (Role-Based Access Control)

A permission system where users are assigned roles, and roles determine what actions they can perform.

```js
// lib/rbac.js
// OWNER can do everything
// DEPLOYER can deploy and edit but not lock
// VIEWER can only view
```

---

### ReadableStream

A Web API for streaming data. Used to create SSE responses where data is sent incrementally.

```js
// app/api/deployments/[id]/logs/stream/route.js
const stream = new ReadableStream({
  start(controller) {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
  }
});
```

---

### Schema Validation (Zod)

Checking that incoming data matches an expected shape before using it. Prevents bugs and security issues.

```js
// app/api/applications/route.js
const createAppSchema = z.object({
  teamId: z.string(),
  name: z.string().min(2),
  repoUrl: z.string().url(),
});
const parsed = createAppSchema.safeParse(payload);
if (!parsed.success) { /* return 400 error */ }
```

---

### Semantic Versioning (SemVer)

A versioning scheme: `MAJOR.MINOR.PATCH` (e.g., `v1.8.1`). Major = breaking changes, Minor = new features, Patch = bug fixes.

```js
// lib/deployments.js
export function nextPatchVersion(existingVersions) {
  const [major, minor, patch] = toVersionNumber(latest);
  return `v${major}.${minor}.${patch + 1}`;
}
```

---

### Server Component (Next.js)

A React component that runs only on the server. The default in Next.js App Router. Can access databases directly but cannot use browser APIs or hooks.

```js
// app/page.js — this is a server component (no "use client")
export default function Home() {
  return <PlatformDashboard />;
}
```

---

### Spread Operator (`...`)

Copies all properties from one object/array into a new one. Used heavily for immutable state updates.

```js
// components/app-selector.jsx
setNewApp((current) => ({ ...current, name: event.target.value }));
// Creates a new object with all current properties, but name is updated
```

---

### State Machine

A system that can be in one of a finite number of states, with defined transitions between them. Deployments use a state machine.

```js
// lib/deployments.js
const DEPLOYMENT_TRANSITIONS = {
  BUILDING: ["DEPLOYING", "FAILED"],
  DEPLOYING: ["LIVE", "FAILED"],
  LIVE: ["ROLLED_BACK"],
  FAILED: ["ROLLED_BACK"],
  ROLLED_BACK: [], // terminal — no transitions out
};
```

---

### Transaction (Database)

A set of database operations that either all succeed or all fail together. No partial updates.

```js
// app/api/pipelines/route.js
await prisma.$transaction(async (tx) => {
  await tx.pipelineStep.deleteMany({ where: { stage: { pipelineId: pipeline.id } } });
  await tx.pipelineStage.deleteMany({ where: { pipelineId: pipeline.id } });
  // ...then create new stages and steps
});
```

---

### Unique Constraint

A database rule that prevents duplicate values in a column or combination of columns.

```prisma
// prisma/schema.prisma
model FeatureFlag {
  @@unique([applicationId, key])
}
// You can't have two feature flags with the same key in the same app
```

---

### Upsert

A database operation that creates a record if it doesn't exist, or updates it if it does. Combines "update" and "insert."

```js
// app/api/environments/route.js
await prisma.environmentVariable.upsert({
  where: { environmentId_key: { environmentId, key: variable.key } },
  update: { value: variable.value },
  create: { environmentId, key: variable.key, value: variable.value },
});
```

---

### Virtualization (UI)

Rendering only the visible items in a long list, instead of all items. Dramatically improves performance for thousands of rows.

```js
// components/log-stream-panel.jsx
const rowVirtualizer = useVirtualizer({
  count: filteredLogs.length,        // total items
  getScrollElement: () => parentRef.current,
  estimateSize: () => 28,            // each row is ~28px tall
  overscan: 8,                       // render 8 extra rows above/below viewport
});
```

---

### Zustand

A tiny state management library for React. Creates a "store" — a shared object that any component can read from and write to.

```js
// lib/store.js
export const usePlatformStore = create((set) => ({
  selectedAppId: null,
  setSelectedAppId: (id) => set(() => ({ selectedAppId: id })),
}));

// In any component:
const { selectedAppId, setSelectedAppId } = usePlatformStore();
```
