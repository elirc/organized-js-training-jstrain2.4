# Guide: `app/api/applications/route.js`

## Purpose

This file defines two API endpoints for managing applications in the Orbit Deploy Console:

- **GET `/api/applications`** -- Lists all applications across all teams.
- **POST `/api/applications`** -- Creates a new application, complete with default environments (Development, Staging, Production) and a default deployment pipeline (Build, Test, Deploy).

This is a great file to study because it demonstrates the full lifecycle of a "create" endpoint: validating input, checking permissions, writing to the database with nested records, logging the action for auditing, and returning the right HTTP status code.

---

## Line-by-Line Walkthrough

### Imports (Lines 1-6)

```js
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActor, getTeamRole } from "@/lib/session";
import { canPerform } from "@/lib/rbac";
import { writeAuditEntry } from "@/lib/audit";
```

- **z from "zod"** -- Zod is a TypeScript-first schema validation library. Even in plain JavaScript, it lets you define the exact shape your incoming data must have and gives you detailed error messages when something is wrong.
- **getActor** -- Looks up which user is making this request (from `lib/session.js`). It reads an `x-user-email` header, or defaults to `owner@acme.dev`.
- **getTeamRole** -- Looks up what role the user has in a specific team (e.g., `"OWNER"`, `"DEPLOYER"`, or `"VIEWER"`).
- **canPerform** -- A pure function from `lib/rbac.js` that checks if a given role is allowed to perform a given action. For example, `canPerform("VIEWER", "deploy")` returns `false`.
- **writeAuditEntry** -- Records an event in the audit log so there is a paper trail of who did what.

### The Zod Validation Schema (Lines 8-14)

```js
const createAppSchema = z.object({
  teamId: z.string(),
  name: z.string().min(2),
  repoUrl: z.string().url(),
  buildCommand: z.string().default("npm run build"),
  startCommand: z.string().default("npm run start"),
});
```

This defines the expected shape of the request body for creating an application. Let's break down each field:

- **`teamId: z.string()`** -- Must be a string. If it is missing or is a number, Zod will reject it.
- **`name: z.string().min(2)`** -- Must be a string with at least 2 characters. This prevents someone from creating an app called `""` or `"X"`.
- **`repoUrl: z.string().url()`** -- Must be a valid URL. Zod checks for proper URL format (scheme, domain, etc.). Something like `"not-a-url"` would fail.
- **`buildCommand: z.string().default("npm run build")`** -- A string, but optional because of `.default()`. If the caller does not send this field, Zod fills in `"npm run build"` automatically.
- **`startCommand: z.string().default("npm run start")`** -- Same idea, defaults to `"npm run start"`.

The schema is defined outside the handler function so it is created once and reused for every request, not recreated on each call.

### The GET Handler (Lines 16-26)

```js
export async function GET() {
  const applications = await prisma.application.findMany({
    include: {
      team: true,
      environments: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(applications);
}
```

This is straightforward: fetch all applications from the database, include the related `team` and `environments` data, sort by creation date (oldest first), and return them as JSON. Notice there are no permission checks on the GET -- this endpoint assumes anyone who can reach the API can list applications. In a real production system, you might add auth here too.

### The POST Handler -- Identifying the Actor (Lines 28-30)

```js
export async function POST(request) {
  const actor = await getActor(request);
  const payload = await request.json();
```

Two things happen immediately:
1. **Identify who is making the request.** `getActor` reads the `x-user-email` header and looks up the corresponding user in the database.
2. **Parse the request body.** `request.json()` reads the raw HTTP body and parses it from JSON into a JavaScript object.

### Validation (Lines 31-41)

```js
const parsed = createAppSchema.safeParse(payload);

if (!parsed.success) {
  return NextResponse.json(
    {
      error: "Invalid payload",
      details: parsed.error.issues,
    },
    { status: 400 },
  );
}
```

**`safeParse` vs `parse`:** Zod has two parsing methods. `parse()` throws an exception if validation fails. `safeParse()` never throws -- it returns an object with either `{ success: true, data: ... }` or `{ success: false, error: ... }`. We use `safeParse` here because we want to return a clean 400 error response, not crash the server.

If validation fails, the response includes the specific issues (e.g., "name must be at least 2 characters") so the front end can show helpful error messages to the user. The HTTP status `400` means "Bad Request" -- the client sent invalid data.

### Destructuring Validated Data (Line 43)

```js
const { teamId, name, repoUrl, buildCommand, startCommand } = parsed.data;
```

After validation succeeds, `parsed.data` contains the cleaned, validated, and default-filled data. Destructuring pulls out each field into its own variable. Importantly, `buildCommand` and `startCommand` are guaranteed to have values here even if the caller did not send them, thanks to Zod's `.default()`.

### RBAC Permission Check (Lines 45-49)

```js
const role = await getTeamRole({ userId: actor?.id, teamId });

if (!canPerform(role, "deploy")) {
  return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
}
```

This is the RBAC (Role-Based Access Control) flow:

1. **Look up the user's role** in the target team. `getTeamRole` queries the `teamMember` table to find the user's role. If the user is not a member of the team, it defaults to `"VIEWER"`.

2. **Check the role against the action.** The `canPerform` function (from `lib/rbac.js`) checks a lookup table:
   ```js
   const ACTIONS = {
     view: ["OWNER", "DEPLOYER", "VIEWER"],
     deploy: ["OWNER", "DEPLOYER"],
     // ...
   };
   ```
   Only `OWNER` and `DEPLOYER` roles can perform the `"deploy"` action. If the user is a `VIEWER`, this returns `false`.

3. **Return 403 Forbidden** if they do not have permission. HTTP 403 means "I know who you are, but you are not allowed to do this." This is different from 401 (Unauthorized), which means "I do not know who you are."

### Creating the Application with Nested Records (Lines 51-108)

```js
const application = await prisma.application.create({
  data: {
    teamId,
    name,
    repoUrl,
    buildCommand,
    startCommand,
    environments: {
      create: [
        { name: "Development", slug: "dev", type: "DEV" },
        { name: "Staging", slug: "staging", type: "STAGING" },
        { name: "Production", slug: "production", type: "PRODUCTION" },
      ],
    },
    pipelines: {
      create: {
        name: "Default Pipeline",
        stages: {
          create: [
            {
              name: "Build",
              stageOrder: 1,
              steps: {
                create: [{ name: "Build app", command: buildCommand, stepOrder: 1 }],
              },
            },
            {
              name: "Test",
              stageOrder: 2,
              steps: {
                create: [{ name: "Run tests", command: "npm run test", stepOrder: 1 }],
              },
            },
            {
              name: "Deploy",
              stageOrder: 3,
              requiresApproval: true,
              steps: {
                create: [{ name: "Start app", command: startCommand, stepOrder: 1 }],
              },
            },
          ],
        },
      },
    },
  },
  include: {
    environments: true,
    pipelines: {
      include: {
        stages: {
          include: { steps: true },
          orderBy: { stageOrder: "asc" },
        },
      },
    },
  },
});
```

This is the most important part of the file and one of Prisma's most powerful features: **nested creates**. In a single database operation, this code creates:

- 1 Application
- 3 Environments (Development, Staging, Production)
- 1 Pipeline ("Default Pipeline")
- 3 Stages (Build, Test, Deploy)
- 3 Steps (one per stage)

That is **11 database records** created from a single `prisma.application.create()` call. Without nested creates, you would need to call `prisma.environment.create()` three times, `prisma.pipeline.create()` once, and so on -- managing IDs and foreign keys manually.

**The `include` at the bottom** tells Prisma to return the newly created application with all its related records, so the API response shows the full picture of what was created.

Notice that the Deploy stage has `requiresApproval: true`. This is a business rule: deploying to production should require human sign-off.

### Writing the Audit Log (Lines 110-118)

```js
await writeAuditEntry({
  teamId,
  applicationId: application.id,
  actorUserId: actor?.id,
  action: "application.created",
  entityType: "Application",
  entityId: application.id,
  details: { name, repoUrl },
});
```

After the application is created, we log who created it, when, and with what parameters. This creates an audit trail. In regulated industries (finance, healthcare), audit logs like this are often a legal requirement. Even outside regulated industries, they are invaluable for debugging ("who deployed this change at 3 AM?").

### Returning the Response (Line 120)

```js
return NextResponse.json(application, { status: 201 });
```

HTTP **201 Created** is the correct status code for successful creation of a resource. It is more specific than 200 (OK) and tells the client "your thing was successfully created, and here it is." Many developers default to 200 for everything, but using 201 for creation is a REST best practice.

---

## Concepts Taught

### 1. Zod Validation

Zod lets you define a schema that describes exactly what data you expect, then validate any incoming data against it. This is important because you can never trust data coming from the outside. Even if your own front end sends correct data, someone could call your API with `curl` or Postman and send garbage. Zod catches problems early, before they cause database errors or security issues.

Key Zod methods used here:
- `z.string()` -- must be a string
- `.min(2)` -- minimum length
- `.url()` -- must be a valid URL
- `.default("value")` -- fills in a default if missing
- `.safeParse(data)` -- validates without throwing

### 2. Nested Creates in Prisma

Instead of creating records one by one and manually linking them with foreign keys, Prisma lets you create an entire tree of related records in one call. The `create` keyword inside a relation field tells Prisma "also create these child records and automatically link them to the parent."

### 3. RBAC Flow

The Role-Based Access Control flow in this project follows a clear three-step pattern:
1. **Identify** the user (`getActor`)
2. **Look up** their role in the relevant context (`getTeamRole`)
3. **Check** the role against the required permission (`canPerform`)

This pattern repeats across many endpoints. Separating these into utility functions means the permission logic is defined once and tested once, not duplicated in every route.

### 4. HTTP 201 Created

REST APIs should use specific status codes. 201 tells the client that a new resource was successfully created. The response body should contain the created resource so the client can immediately use it (especially the server-generated `id` field).

---

## Common Mistakes

1. **Using `parse` instead of `safeParse`.** If you use `parse()` and validation fails, Zod throws an error. If you do not have a `try/catch`, this crashes your route handler and the client gets a 500 Internal Server Error with no useful information. Always use `safeParse()` in API routes so you can return a friendly 400 response.

2. **Forgetting to check permissions before the database write.** If you create the application first and then check permissions, you have already written data to the database. Always validate and authorize before making any changes. The order should be: validate -> authorize -> create.

3. **Not including related records in the create response.** If you call `prisma.application.create()` without the `include` block, the response would only contain the application's own fields, not its environments or pipelines. The front end would then need to make additional requests to fetch those.

4. **Returning 200 instead of 201 for creation.** This is a very common mistake. While 200 "works," it does not communicate intent. Client libraries and middleware sometimes behave differently based on the status code. Using 201 is semantically correct.

5. **Hardcoding values that should be configurable.** The default pipeline structure (Build, Test, Deploy) is hardcoded. In a larger system, you might want to make pipeline templates configurable. But for a learning project, hardcoding keeps things simple and understandable.

---

## Mini Exercises

### Exercise 1: Add a description field

Add an optional `description` field to the `createAppSchema`. It should be a string with a maximum length of 500 characters and default to an empty string `""`.

**Hints:**
- Use `z.string().max(500).default("")`.
- Add it to the destructuring on line 43.
- Add it to the `data` object in the `prisma.application.create()` call.
- Note: you would also need to add a `description` field to the Prisma schema for this to actually work -- but defining the Zod schema is the exercise.

### Exercise 2: Add permission checking to GET

Currently the GET handler has no permission checks -- anyone can list all applications. Modify it so that it:
1. Calls `getActor(request)` to identify the user (you will need to change `GET()` to `GET(request)`).
2. Only returns applications that belong to teams the user is a member of.

**Hints:**
- You could look up the user's team memberships with `prisma.teamMember.findMany({ where: { userId: actor.id } })`.
- Then pass the team IDs as a filter to the `findMany` query using Prisma's `where: { teamId: { in: teamIds } }` syntax.

### Exercise 3: Add a second pipeline stage step

The "Test" stage currently has one step: `"Run tests"`. Add a second step called `"Run linter"` with the command `"npm run lint"` and `stepOrder: 2`. Make sure the existing "Run tests" step stays at `stepOrder: 1`.

**Hint:** The `create` field for steps takes an array. Just add a second object to that array.

---

## Further Reading

- [Zod documentation](https://zod.dev/) -- Complete reference for Zod schema definitions and validation.
- [Prisma nested writes](https://www.prisma.io/docs/concepts/components/prisma-client/relation-queries#nested-writes) -- How to create, update, and connect related records in a single call.
- [HTTP Status Codes (MDN)](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status) -- Full list of HTTP status codes and what they mean.
- [RBAC explained](https://auth0.com/docs/manage-users/access-control/rbac) -- Auth0's introduction to Role-Based Access Control concepts.
- [Next.js Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers) -- Official docs on exporting GET, POST, etc. from route files.
