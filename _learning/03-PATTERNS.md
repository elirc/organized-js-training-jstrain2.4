# Patterns & Anti-Patterns

Design patterns used in this project, with concrete examples. Also includes honest notes about where the code takes shortcuts or could be improved.

---

## Patterns Used

### 1. Singleton Pattern

**What it is:** Ensuring only one instance of something exists in the entire app.

**Where it's used:** `lib/prisma.js` — the database connection.

```js
const globalForPrisma = globalThis;
export const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

**Why:** In development, Next.js hot-reloads modules frequently. Without the singleton, each reload would create a new database connection, eventually exhausting the connection pool. By storing the client on `globalThis`, it survives reloads.

**Extra example:** This is similar to how you'd create a single logger instance:
```js
const logger = globalThis.__logger || new Logger();
globalThis.__logger = logger;
```

---

### 2. State Machine Pattern

**What it is:** Modeling a system as a finite set of states with defined transitions between them.

**Where it's used:** `lib/deployments.js` — deployment status management.

```js
const DEPLOYMENT_TRANSITIONS = {
  BUILDING: ["DEPLOYING", "FAILED"],
  DEPLOYING: ["LIVE", "FAILED"],
  LIVE: ["ROLLED_BACK"],
  FAILED: ["ROLLED_BACK"],
  ROLLED_BACK: [],
};
```

**Why:** Without a state machine, someone could accidentally set a `ROLLED_BACK` deployment to `BUILDING`, which makes no sense. The transition table makes invalid states impossible and the rules easy to audit.

**Extra example:** A simpler state machine for a traffic light:
```js
const TRAFFIC_LIGHT = {
  RED: ["GREEN"],
  GREEN: ["YELLOW"],
  YELLOW: ["RED"],
};
```

---

### 3. Repository / Service Layer Pattern

**What it is:** Putting business logic in a dedicated layer between the API handlers and the database, rather than putting everything in the route handler.

**Where it's used:** `lib/platform-service.js` handles deployment creation, status transitions, and rollbacks. API routes call these functions instead of directly manipulating the database.

```js
// API route is thin:
const deployment = await createDeployment({ ...parsed.data, actorUserId: actor?.id });

// Service function handles the complexity:
export async function createDeployment({ applicationId, environmentId, ... }) {
  const existingDeployments = await prisma.deployment.findMany(...)
  const resolvedVersion = version || nextPatchVersion(...)
  const deployment = await prisma.deployment.create(...)
  await writeAuditEntry(...)
  return deployment;
}
```

**Why:**
- The same logic can be reused by both the web API (`/api/deployments`) and the CLI API (`/api/cli/deploy`)
- API routes stay simple and readable
- Business rules are in one place instead of duplicated across routes

---

### 4. Validation at the Boundary

**What it is:** Validating all external input at the point where it enters your system, then trusting it everywhere else.

**Where it's used:** Every POST/PATCH API route uses Zod schemas.

```js
// app/api/applications/route.js
const createAppSchema = z.object({
  teamId: z.string(),
  name: z.string().min(2),
  repoUrl: z.string().url(),
  buildCommand: z.string().default("npm run build"),
});

const parsed = createAppSchema.safeParse(payload);
if (!parsed.success) {
  return NextResponse.json({ error: "Invalid payload", details: parsed.error.issues }, { status: 400 });
}
// After this point, parsed.data is guaranteed to match the schema
```

**Why:** Once data passes validation, every function downstream can trust its shape. No need to check `if (name && typeof name === "string")` in every function.

---

### 5. Lookup Table Pattern

**What it is:** Using an object as a map from keys to values instead of if/else chains.

**Where it's used:** `lib/rbac.js` — permissions.

```js
// Lookup table (clear, easy to modify):
const ACTIONS = {
  view: ["OWNER", "DEPLOYER", "VIEWER"],
  deploy: ["OWNER", "DEPLOYER"],
  lockDeploys: ["OWNER"],
};

// vs. the if/else equivalent (messy, error-prone):
function canPerform(role, action) {
  if (action === "view") return ["OWNER", "DEPLOYER", "VIEWER"].includes(role);
  if (action === "deploy") return ["OWNER", "DEPLOYER"].includes(role);
  // ...
}
```

**Why:** Adding a new action or role is just adding a line to the object. No risk of forgetting a case in a long if/else chain.

---

### 6. Data Masking Pattern

**What it is:** Hiding sensitive information before sending it to the client, while keeping enough visible for identification.

**Where it's used:** `app/api/bootstrap/route.js` and `lib/deployments.js`.

```js
// lib/deployments.js
export function maskedSecret(value) {
  if (value.length < 6) return "*".repeat(value.length);
  return `${value.slice(0, 2)}${"*".repeat(value.length - 4)}${value.slice(-2)}`;
}
// "super-secret-key" → "su*************ey"
```

**Why:** The dashboard needs to show that secrets exist without exposing their actual values. The first/last 2 characters help users identify which secret they're looking at.

---

### 7. Optimistic Query Invalidation

**What it is:** After a mutation succeeds, telling the cache to refetch data so the UI shows the latest state.

**Where it's used:** Every mutation in every component.

```js
const createDeploy = useMutation({
  mutationFn: (payload) => fetchJson("/api/deployments", { method: "POST", body: JSON.stringify(payload) }),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
  },
});
```

**Why:** After creating a new deployment, the deployment timeline needs to show it. Invalidating the bootstrap query triggers a refetch, which updates all components automatically.

**Honesty note:** This project invalidates the entire bootstrap query after every mutation. A more optimized approach would be to either (a) invalidate only the specific query that changed, or (b) use optimistic updates where you update the cache immediately and roll back if the request fails. The current approach is simpler but causes more network requests than necessary.

---

### 8. Cascading State Resets

**What it is:** When a parent selection changes, resetting all child selections to sensible defaults.

**Where it's used:** `lib/store.js` — the Zustand store.

```js
setSelectedAppId: (selectedAppId) =>
  set(() => ({
    selectedAppId,
    selectedEnvironmentId: null,    // reset child
    selectedDeploymentId: null,     // reset grandchild
  })),
```

**Why:** If you select a different application, the previously selected environment and deployment belong to the old app. They need to be reset to prevent showing stale/incorrect data.

---

### 9. Aggregate-then-Finalize Pattern

**What it is:** Processing data in two passes — first accumulate totals, then compute averages.

**Where it's used:** `lib/metrics.js` — turning raw metrics into chart data.

```js
// Pass 1: Accumulate
bucket.samples += 1;
bucket.responseTimeMs += metric.responseTimeMs;

// Pass 2: Average
responseTimeMs: bucket.responseTimeMs / bucket.samples,
```

**Why:** You can't compute a running average in a single pass without knowing the total count upfront. The two-pass approach is mathematically correct and easy to understand.

---

## Anti-Patterns and Honest Critiques

### 1. The "God Endpoint" — `/api/bootstrap`

**What's happening:** The bootstrap endpoint loads the ENTIRE application state in one massive query: all teams, all apps, all environments, all deployments, all feature flags, all secrets, all audit logs.

**Why it's not ideal:** As the dataset grows, this query becomes slow and returns megabytes of JSON. In a real production app, you'd want:
- Separate endpoints for each data type
- Pagination (load 20 deployments at a time, not 50)
- On-demand loading (only fetch feature flags when the user opens that panel)

**Why it exists:** For an MVP, one request is simpler than wiring up 10+ separate queries. It works fine with a small dataset.

---

### 2. No Real Authentication

**What's happening:** `lib/session.js` looks for an `x-user-email` header and defaults to `owner@acme.dev`.

```js
const emailHeader = request.headers.get("x-user-email");
const email = emailHeader || "owner@acme.dev";
```

**Why it's not ideal:** Anyone can set this header. There's no password, no session token, no JWT. In production, you'd integrate with an identity provider (Okta, Auth0, etc.) and validate tokens on every request.

**Why it exists:** Authentication is complex and orthogonal to the platform features being demonstrated. The session module is a placeholder that makes the rest of the code work as if auth existed.

---

### 3. Inconsistent RBAC Enforcement on CLI Endpoints

**What's happening:** The web API routes (`/api/deployments`) check RBAC permissions, but the CLI routes (`/api/cli/deploy`) skip them.

```js
// Web API — has RBAC checks
const role = await getTeamRole({ userId: actor?.id, teamId });
if (!canPerform(role, "deploy")) { ... }

// CLI API — no RBAC checks
const deployment = await createDeployment({ ... }); // just does it
```

**Why it matters:** In production, a CLI tool should still authenticate and check permissions. Otherwise, anyone with the CLI can bypass all access controls.

---

### 4. Environment Variables Stored in Plaintext

**What's happening:** `EnvironmentVariable` values marked as `isSecret` are stored in plaintext in the database. They're only masked in the API response.

```js
variables: environment.variables.map((variable) => ({
  ...variable,
  maskedValue: variable.isSecret ? maskedSecret(variable.value) : variable.value,
  value: variable.isSecret ? undefined : variable.value,
}))
```

The `Secret` model encrypts values properly, but `EnvironmentVariable` does not. This is inconsistent.

---

### 5. No Error Boundaries

**What's happening:** If any component throws an error, the entire app crashes. React error boundaries would catch errors and show a fallback UI instead of a white screen.

**What better looks like:**
```jsx
<ErrorBoundary fallback={<p>Something went wrong. Please refresh.</p>}>
  <DeploymentTimeline ... />
</ErrorBoundary>
```

---

### 6. Heavy Re-renders from Bootstrap Invalidation

**What's happening:** Every mutation invalidates the `["bootstrap"]` query, which refetches ALL data and causes ALL components to re-render, even ones that didn't change.

**What better looks like:** Use separate query keys per data type:
```js
// Instead of one big bootstrap:
queryClient.invalidateQueries({ queryKey: ["deployments", applicationId] });
// Only the deployment timeline refetches
```

---

### 7. Missing Loading and Error States on Mutations

**What's happening:** Most mutations show a "Creating..." text on the button but don't show error messages if the mutation fails. The user clicks, something goes wrong, and nothing visible happens.

**What better looks like:**
```jsx
{createDeploy.error && (
  <p className="danger">{createDeploy.error.message}</p>
)}
```

---

## Patterns the Project Does Well

Despite the above critiques, this project demonstrates several things very well:

1. **Clean separation of concerns** — lib/ files handle logic, components handle UI, API routes handle HTTP. No component directly queries the database.

2. **Consistent validation** — Every write endpoint validates input with Zod before touching the database.

3. **Audit trail** — Every important action is logged with who did it, what they did, and when. This is table-stakes for enterprise software.

4. **State machine enforcement** — Deployment status transitions are validated, preventing impossible states.

5. **Secret masking** — Encrypted values never reach the client. Only masked previews are sent to the browser.

6. **Idiomatic Next.js** — The folder structure, route handlers, and component patterns follow standard Next.js conventions that any new developer familiar with the framework would recognize.
