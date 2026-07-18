# Guide: `app/api/bootstrap/route.js`

## Purpose

This file is the "god endpoint" of the Orbit Deploy Console. When the front-end application loads, it needs to know about teams, applications, environments, deployments, feature flags, secrets, incidents, audit logs -- basically everything. Instead of making dozens of separate API calls, this single `GET /api/bootstrap` endpoint fetches the entire organization's data in one massive database query and returns it as a single JSON object.

Think of it like walking into a new office on your first day and someone handing you a binder that contains the org chart, every project brief, every access badge, and the entire event log. One trip, everything you need.

---

## Line-by-Line Walkthrough

### Imports (Lines 1-3)

```js
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { maskedSecret } from "@/lib/deployments";
```

- **NextResponse** is how Next.js Route Handlers send HTTP responses back to the browser. It has convenient methods like `.json()` that automatically set the `Content-Type: application/json` header.
- **prisma** is our database client. Prisma is an ORM (Object-Relational Mapper) that lets us talk to the database using JavaScript objects instead of raw SQL strings.
- **maskedSecret** is a utility function that hides the middle characters of a sensitive string. For example, `"my-secret-key"` becomes `"my*********ey"`. This comes from `lib/deployments.js`.

### The GET Handler (Lines 5-8)

```js
export async function GET(request) {
  const url = new URL(request.url);
  const appId = url.searchParams.get("appId");
```

Next.js maps HTTP verbs to exported function names. Exporting `GET` means this function runs when someone sends a `GET` request to `/api/bootstrap`.

The handler accepts an optional `appId` query parameter. If you call `/api/bootstrap?appId=abc123`, it will only load that specific application's data. If you call `/api/bootstrap` with no query param, it loads everything.

### Building the Optional Filter (Line 9)

```js
const appFilter = appId ? { id: appId } : undefined;
```

This is a conditional filter object. If `appId` is provided, it creates `{ id: appId }` which Prisma uses as a `where` clause. If not, it stays `undefined`, meaning no filter is applied. This pattern avoids writing two completely separate queries.

### The Giant Prisma Query (Lines 11-105)

```js
const organization = await prisma.organization.findFirst({
  include: {
    teams: {
      include: {
        members: {
          include: {
            user: true,
          },
        },
        applications: {
          ...(appFilter ? { where: appFilter } : {}),
          include: {
            environments: {
              include: {
                variables: {
                  orderBy: { key: "asc" },
                },
              },
              orderBy: { createdAt: "asc" },
            },
            // ... domains, pipelines, deployments, metrics, alerts, featureFlags, secrets, incidents, auditLogs
          },
        },
      },
    },
    auditLogs: {
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        actor: true,
      },
    },
  },
});
```

This is the heart of the file. Let's unpack what is happening level by level:

1. **`prisma.organization.findFirst()`** -- Finds the first (and in this project, only) organization record.

2. **`include: { teams: ... }`** -- "When you fetch the organization, also fetch all its teams." Without `include`, Prisma only returns the columns on the `organization` table itself.

3. **Nested includes** -- Each `include` can contain further `include` blocks, creating a tree of fetched data:
   - Organization -> Teams -> Members -> Users
   - Organization -> Teams -> Applications -> Environments -> Variables
   - Organization -> Teams -> Applications -> Pipelines -> Stages -> Steps
   - Organization -> Teams -> Applications -> Deployments (with actor and environment)
   - Organization -> Teams -> Applications -> Metrics
   - Organization -> Teams -> Applications -> Alerts -> AlertRules
   - Organization -> Teams -> Applications -> FeatureFlags -> Rules, Dependencies
   - Organization -> Teams -> Applications -> Secrets -> Versions, Usages
   - Organization -> Teams -> Applications -> Incidents
   - Organization -> Teams -> Applications -> AuditLogs -> Actor
   - Organization -> AuditLogs -> Actor

4. **`orderBy` and `take` clauses** -- Scattered throughout to control sorting and limit result counts. For example, deployments are sorted by `createdAt: "desc"` (newest first) and limited to 50. Metrics are limited to 200. Audit logs are limited to 100.

5. **The spread-based conditional filter**:
   ```js
   ...(appFilter ? { where: appFilter } : {})
   ```
   This is a clever JavaScript pattern. If `appFilter` exists, it spreads `{ where: appFilter }` into the query options, adding a WHERE clause. If not, it spreads an empty object `{}`, which adds nothing. This lets you conditionally add query options without `if/else` blocks.

### Handling No Data (Lines 107-109)

```js
if (!organization) {
  return NextResponse.json({ error: "No seed data found. Run npm run db:seed." }, { status: 404 });
}
```

If the database has no organization (i.e., no one has run the seed script yet), return a helpful 404 error telling the developer what to do. This is a nice developer experience touch.

### Data Masking (Lines 111-136)

```js
const maskedOrganization = {
  ...organization,
  teams: organization.teams.map((team) => ({
    ...team,
    applications: team.applications.map((application) => ({
      ...application,
      environments: application.environments.map((environment) => ({
        ...environment,
        variables: environment.variables.map((variable) => ({
          ...variable,
          maskedValue: variable.isSecret ? maskedSecret(variable.value) : variable.value,
          value: variable.isSecret ? undefined : variable.value,
        })),
      })),
      secrets: application.secrets.map((secret) => ({
        ...secret,
        encryptedValue: undefined,
        maskedValue: maskedSecret(secret.key),
        versions: secret.versions.map((version) => ({
          ...version,
          encryptedValue: undefined,
        })),
      })),
    })),
  })),
};
```

This is the security layer. Before sending data to the browser, we must never expose actual secret values. Here is what happens:

- **Environment variables**: If a variable has `isSecret: true`, its `value` field is replaced with `undefined` (effectively removed), and a new `maskedValue` field is added showing something like `"DB*********RL"`. If the variable is not secret, `maskedValue` just contains the full value.

- **Secrets**: The `encryptedValue` field is set to `undefined` on both the secret itself and all its version history. A `maskedValue` based on the secret key is added instead.

The pattern of `{ ...object, field: undefined }` is a way to "delete" a field during spread. When an object is serialized to JSON, `undefined` values are stripped out.

### Returning the Response (Line 138)

```js
return NextResponse.json(maskedOrganization);
```

The masked organization object is serialized to JSON and sent back with a default 200 status code.

---

## Concepts Taught

### 1. Eager Loading

When you query a database, by default you only get the table you asked for. "Eager loading" means telling the database "while you're at it, also fetch these related tables." Prisma's `include` keyword is how you do eager loading. Without it, you would have to make a separate query for every related record.

### 2. The N+1 Problem

Imagine loading 10 teams, then for each team, making a separate query to load its applications. That is 1 query for teams + 10 queries for applications = 11 queries. If each application has 3 environments, that is another 30 queries. This is the "N+1 problem" -- you end up with an explosion of database calls.

Prisma's `include` solves this by using SQL JOINs or batched queries under the hood. The bootstrap endpoint uses one `findFirst` call with nested `include` statements, so Prisma can optimize the data retrieval into a manageable number of database roundtrips rather than hundreds.

### 3. Data Masking

Sending raw secrets to a browser is a security nightmare. Even if the front end "hides" them, anyone can open the browser dev tools Network tab and see the raw JSON. Data masking transforms sensitive values before they leave the server so the real data never reaches the client. The `maskedSecret()` function keeps the first two and last two characters visible (for identification purposes) and replaces everything in between with asterisks.

### 4. Trade-offs of Loading Everything at Once

**Pros:**
- The front end gets everything in one network request (fast initial load, no waterfall of API calls).
- Simpler client-side code -- no need to coordinate multiple loading states.
- Data is consistent because it is all fetched at the same point in time.

**Cons:**
- The response can be very large, which slows things down if the organization has a lot of data.
- The database query is expensive -- it touches many tables with many JOINs.
- If you only need to refresh one piece of data (like deployments), you either re-fetch everything or build a separate endpoint anyway.
- Memory usage on the server can spike because the entire object must be held in memory during masking.

In production systems, you would typically use a mix: a bootstrap endpoint for initial load, plus targeted endpoints for refreshing individual sections. This project uses both patterns.

---

## Common Mistakes

1. **Forgetting to mask data before sending it.** It is tempting to just return the raw Prisma result. Always ask: "Does this response contain anything a user should not see in their browser's Network tab?"

2. **Not limiting results with `take`.** Without `take: 50` on deployments or `take: 200` on metrics, this query could return thousands of rows and cause the response to be enormous. Always set reasonable limits on unbounded collections.

3. **Using `findUnique` instead of `findFirst`.** This endpoint uses `findFirst` because there is no unique constraint filter being passed -- it just grabs the first organization. Using `findUnique` would require passing an `id` or another uniquely-constrained field.

4. **Setting `value` to `null` instead of `undefined`.** If you set `value: null`, it would show up in the JSON as `"value": null`. Using `undefined` causes the field to be completely omitted from the JSON output, which is cleaner and avoids confusing the front end into thinking there is a field with a null value.

5. **Deeply nested maps without error handling.** If `organization.teams` is somehow `null` or `undefined` instead of an empty array, the `.map()` call would crash. Prisma guarantees arrays for `include`d relations, but if you ever restructure this code, be careful.

---

## Mini Exercises

### Exercise 1: Add a team filter

Right now the endpoint supports an optional `appId` query parameter to filter applications. Add support for an optional `teamId` query parameter that filters which teams are included.

**Hints:**
- Look at how `appFilter` is built on line 9 and how it is spread into the query on line 21.
- You will need a similar `teamFilter` variable and a similar spread pattern inside the `teams` block.

### Exercise 2: Limit audit log depth

The bootstrap endpoint returns up to 100 audit log entries. Change it so that it only returns audit logs from the last 7 days, regardless of the `take` limit.

**Hints:**
- You will need to add a `where` clause inside the `auditLogs` include.
- Create a `Date` object for 7 days ago: `new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)`.
- Use Prisma's `gte` (greater than or equal) filter on the `createdAt` field.

### Exercise 3: Measure the query

Add `console.time("bootstrap-query")` before the Prisma call and `console.timeEnd("bootstrap-query")` after it. Hit the endpoint and check the server console to see how long the query takes. Then try it with and without the `appId` filter and compare the times.

---

## Further Reading

- [Prisma `include` documentation](https://www.prisma.io/docs/concepts/components/prisma-client/relation-queries#include) -- Official guide to eager loading with Prisma.
- [The N+1 Query Problem explained](https://www.prisma.io/docs/orm/prisma-client/queries/query-optimization-performance) -- Prisma's own explanation of the problem and how their client addresses it.
- [Next.js Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers) -- How Next.js maps exported functions to HTTP methods.
- [OWASP Data Exposure](https://owasp.org/API-Security/editions/2023/en/0xa3-broken-object-property-level-authorization/) -- Why you should never send sensitive data to the client.
- [The spread operator (`...`) in JavaScript](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Spread_syntax) -- MDN reference for the spread syntax used heavily in the masking logic.
