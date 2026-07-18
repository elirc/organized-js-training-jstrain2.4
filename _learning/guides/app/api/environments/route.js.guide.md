# Guide: Environments Endpoint

**File:** `app/api/environments/route.js`

---

## Purpose

This file provides two endpoints for managing deployment environments (like "staging," "production," "development"). The GET endpoint lists environments with their variables and recent deployment history. The PATCH endpoint updates an environment -- specifically, it can lock/unlock deploys and update environment variables.

Environments are a core concept in deployment platforms. Your app might behave differently in staging versus production (different database URLs, different API keys, different feature flags). This endpoint manages that configuration.

---

## Line-by-Line Walkthrough

### Imports and Schema

```js
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActor, getTeamRole } from "@/lib/session";
import { canPerform } from "@/lib/rbac";
import { writeAuditEntry } from "@/lib/audit";
```

**Lines 1-6:** Standard imports. Zod is our runtime validation library -- it checks that incoming data matches a specific shape before we trust it. The audit module lets us record what happened so there is a paper trail.

```js
const updateEnvSchema = z.object({
  id: z.string(),
  deployLocked: z.boolean().optional(),
  lockReason: z.string().nullable().optional(),
  variables: z
    .array(
      z.object({
        key: z.string(),
        value: z.string(),
        isSecret: z.boolean().optional(),
      }),
    )
    .optional(),
});
```

**Lines 8-21:** This Zod schema defines what a valid PATCH request body looks like. Let us break it down field by field:

- `id` -- Required string. Which environment are we updating?
- `deployLocked` -- Optional boolean. When `true`, nobody can deploy to this environment.
- `lockReason` -- This one is interesting: `.nullable().optional()`. We will discuss this in the Concepts section, but the short version is: you can omit it entirely (optional), OR you can explicitly send `null` to clear it (nullable), OR you can send a string value.
- `variables` -- Optional array of key-value pairs. Each variable has a `key`, a `value`, and an optional `isSecret` flag.

### GET Handler

```js
export async function GET(request) {
  const url = new URL(request.url);
  const applicationId = url.searchParams.get("applicationId");

  const environments = await prisma.environment.findMany({
    where: {
      ...(applicationId ? { applicationId } : {}),
    },
    include: {
      variables: {
        orderBy: { key: "asc" },
      },
      deployments: {
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });

  return NextResponse.json(environments);
}
```

**Lines 23-43:** The GET handler lists environments. A few things to notice:

- **Optional filtering.** The `applicationId` query parameter is optional. The spread pattern `...(applicationId ? { applicationId } : {})` means: if the caller provided an applicationId, filter by it. If not, return all environments. This is a conditional filter pattern you will see everywhere in this project.

- **Eager loading with `include`.** We load related data in one query: all variables (sorted alphabetically) and the 20 most recent deployments (sorted newest first). Without `include`, you would need separate queries, which is slower.

- **`take: 20` on deployments.** We do not load ALL deployments for every environment -- that could be thousands. We just grab the 20 most recent ones. This is enough for the UI to show recent history without overwhelming the response.

### PATCH Handler

```js
export async function PATCH(request) {
  const actor = await getActor(request);
  const payload = await request.json();
  const parsed = updateEnvSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.issues }, { status: 400 });
  }
```

**Lines 45-52:** Standard validation flow. We get the actor (who is making this request), parse the request body as JSON, and run it through our Zod schema. If validation fails, we return 400 with the specific issues. The `safeParse` method does not throw -- it returns `{ success: true, data: ... }` or `{ success: false, error: ... }`. This is better than `parse()` which would throw an exception.

```js
  const existing = await prisma.environment.findUnique({
    where: { id: parsed.data.id },
    include: {
      application: true,
      variables: true,
    },
  });

  if (!existing) {
    return NextResponse.json({ error: "Environment not found" }, { status: 404 });
  }

  const role = await getTeamRole({
    userId: actor?.id,
    teamId: existing.application.teamId,
  });

  if (!canPerform(role, "lockDeploys")) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }
```

**Lines 54-73:** Load the environment, verify it exists, then check permissions. Notice the RBAC action is `"lockDeploys"` -- even though this endpoint also handles variable updates. This might be a design choice (only people who can lock deploys should be editing environment config) or it might be something that should be split into separate permissions. Worth thinking about.

```js
  const updatedEnvironment = await prisma.environment.update({
    where: { id: existing.id },
    data: {
      ...(parsed.data.deployLocked !== undefined ? { deployLocked: parsed.data.deployLocked } : {}),
      ...(parsed.data.lockReason !== undefined ? { lockReason: parsed.data.lockReason } : {}),
    },
  });
```

**Lines 75-81:** Update the environment's lock state. The conditional spread pattern (`parsed.data.deployLocked !== undefined ? ... : {}`) ensures we only update fields that were actually sent in the request. If the caller only sent `variables` and did not include `deployLocked`, we do not accidentally set it to `undefined` or `null`.

This is a **partial update** pattern. In a PATCH request (as opposed to PUT), you only send the fields you want to change.

```js
  if (parsed.data.variables) {
    for (const variable of parsed.data.variables) {
      await prisma.environmentVariable.upsert({
        where: {
          environmentId_key: {
            environmentId: existing.id,
            key: variable.key,
          },
        },
        update: {
          value: variable.value,
          isSecret: variable.isSecret ?? false,
        },
        create: {
          environmentId: existing.id,
          key: variable.key,
          value: variable.value,
          isSecret: variable.isSecret ?? false,
        },
      });
    }
  }
```

**Lines 83-104:** This is the **upsert loop** -- one of the most important patterns in this file. For each variable the caller sent, we use Prisma's `upsert` operation:

- The `where` clause uses a **compound unique key**: `environmentId_key` is a unique constraint on the combination of `environmentId` and `key`. This means each environment can have at most one variable named `DATABASE_URL`, one named `API_KEY`, etc.
- If a variable with that key already exists in this environment, the `update` block runs (change the value).
- If it does not exist yet, the `create` block runs (make a new one).

This is called an **upsert** -- "update or insert." It saves us from writing separate "does it exist?" logic.

```js
  await writeAuditEntry({
    teamId: existing.application.teamId,
    applicationId: existing.application.id,
    environmentId: existing.id,
    actorUserId: actor?.id,
    action: "environment.updated",
    entityType: "Environment",
    entityId: existing.id,
    details: parsed.data,
  });

  const response = await prisma.environment.findUnique({
    where: { id: updatedEnvironment.id },
    include: {
      variables: true,
    },
  });

  return NextResponse.json(response);
}
```

**Lines 106-125:** After making changes, we write an audit log entry (recording who changed what) and then re-fetch the environment with its variables to return the current state. The reason we re-fetch instead of returning `updatedEnvironment` is that the update query on line 75 does not include the variables. We need a fresh read to get the complete picture.

---

## Concepts Taught

### The Upsert Pattern

An "upsert" is a database operation that says: "Create this record if it does not exist, or update it if it does." It is one of the most useful patterns in backend development.

Without upsert, you would need to write this:

```js
const exists = await prisma.environmentVariable.findUnique({
  where: { environmentId_key: { environmentId, key } },
});
if (exists) {
  await prisma.environmentVariable.update({ ... });
} else {
  await prisma.environmentVariable.create({ ... });
}
```

That is three database calls instead of one, and it has a **race condition** -- between the `findUnique` and the `create`, another request could create the same variable, causing a duplicate key error.

The upsert does it atomically in a single operation. It is safer and simpler.

### Nullable vs Optional in Zod

This is a subtle but important distinction:

```js
lockReason: z.string().nullable().optional()
```

- **`.optional()`** means the field can be **absent** from the object entirely. The caller can simply not include it.
- **`.nullable()`** means the field can be **present but set to `null`**.

Together, `.nullable().optional()` allows three states:
1. `{ id: "abc" }` -- `lockReason` is absent (optional). We do not touch the existing value.
2. `{ id: "abc", lockReason: null }` -- `lockReason` is explicitly `null` (nullable). This means "clear the lock reason."
3. `{ id: "abc", lockReason: "Deploying hotfix" }` -- `lockReason` is a string. This means "set the lock reason to this."

This three-state distinction is crucial for partial updates. Without `nullable`, you could not distinguish between "I did not send this field" and "I want to clear this field."

### Deploy Locking

Deploy locking is a safety mechanism. When an environment is locked:
- No new deployments can be pushed to it.
- The lock reason explains why (e.g., "Investigating production incident" or "Maintenance window in progress").

This prevents well-meaning teammates from deploying during a critical moment. Think of it like a "do not disturb" sign on a hotel door. You can see this check enforced in `app/api/cli/deploy/route.js` where it returns HTTP 423 (Locked) if `environment.deployLocked` is true.

### Conditional Filter Pattern

```js
where: {
  ...(applicationId ? { applicationId } : {}),
}
```

This pattern builds a Prisma `where` clause dynamically. If `applicationId` is provided, we filter by it. If not, the spread of an empty object (`{}`) adds nothing to the `where` clause, so no filter is applied. This is a clean way to handle optional query parameters without `if/else` blocks.

---

## Common Mistakes

1. **Confusing `nullable()` and `optional()` in Zod.** Using only `.optional()` means you cannot send `null` to clear a value. Using only `.nullable()` means the field is required (but can be null). You need both for the three-state behavior described above.

2. **Running upserts without a unique constraint.** The `environmentId_key` compound unique constraint must exist in your database schema. Without it, Prisma has no way to know which record to update vs create, and the upsert will fail.

3. **Forgetting to re-fetch after updates.** After updating the environment lock state and upserting variables in separate operations, the `updatedEnvironment` object only reflects the lock change. You must re-query to include the latest variables in the response.

4. **Using `parsed.data.deployLocked !== undefined` vs checking truthiness.** The check uses `!== undefined` deliberately. If you wrote `if (parsed.data.deployLocked)` instead, sending `deployLocked: false` to unlock would be ignored because `false` is falsy. Always use strict `undefined` checks when dealing with optional boolean fields.

5. **Not wrapping the upsert loop in a transaction.** This is actually a potential issue in the current code. If the third variable in a list of five fails, the first two have already been saved. The environment ends up in a partially updated state. In a production system, you might want to wrap this loop in a `prisma.$transaction()`.

---

## Mini Exercises

### Exercise 1: Three States of lockReason

Write three different JSON request bodies for the PATCH endpoint that demonstrate the three states of `lockReason`:
1. One that does not mention lockReason at all.
2. One that clears it.
3. One that sets it to a message.

For each, explain what happens to the existing lockReason in the database.

<details>
<summary>Answer</summary>

1. `{ "id": "env-1", "deployLocked": true }` -- lockReason is not mentioned, so the conditional spread on line 79 produces `{}`. The existing lockReason in the database is untouched.

2. `{ "id": "env-1", "lockReason": null }` -- lockReason is explicitly null. The conditional spread produces `{ lockReason: null }`, and the database field is set to null (cleared).

3. `{ "id": "env-1", "lockReason": "Maintenance window until 3am" }` -- lockReason is a string. The database field is set to that string.
</details>

### Exercise 2: Spot the Race Condition

Imagine two people send PATCH requests at the same time, both updating variables for the same environment. Person A sends `{ variables: [{ key: "API_URL", value: "https://a.com" }] }` and Person B sends `{ variables: [{ key: "API_URL", value: "https://b.com" }] }`. What value does `API_URL` end up with? Is this a problem? How would you fix it?

<details>
<summary>Answer</summary>

The final value depends on which upsert runs last -- it is a race condition. Person A's request might win, or Person B's might. This is called a "last write wins" situation. In many cases this is acceptable (the last person to save "wins"). If it is not acceptable, you could use optimistic locking (check a version number before updating) or a database transaction with row-level locking.
</details>

### Exercise 3: Add Variable Deletion

The current code can create or update variables, but it cannot delete them. How would you modify the upsert loop to support deleting a variable? One approach: add a `deleted: z.boolean().optional()` field to the variable schema, and if it is true, delete the variable instead of upserting it. Write the code for this.

<details>
<summary>Hint</summary>

Inside the `for` loop, before the upsert, add:
```js
if (variable.deleted) {
  await prisma.environmentVariable.deleteMany({
    where: {
      environmentId: existing.id,
      key: variable.key,
    },
  });
  continue; // skip the upsert
}
```
Using `deleteMany` instead of `delete` avoids an error if the variable does not exist.
</details>

---

## Further Reading

- [Prisma Upsert Documentation](https://www.prisma.io/docs/reference/api-reference/prisma-client-reference#upsert) -- Official docs on how upsert works with compound unique keys.
- [Zod Documentation on nullable vs optional](https://zod.dev/?id=nullable) -- Understand the difference between these two modifiers.
- [HTTP PATCH semantics (MDN)](https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods/PATCH) -- Why PATCH sends partial updates, unlike PUT which replaces the whole resource.
- [Optimistic Concurrency Control](https://en.wikipedia.org/wiki/Optimistic_concurrency_control) -- How to handle the race condition mentioned in Exercise 2.
- Related project files: `lib/audit.js` (the audit writer), `lib/rbac.js` (the permission system), `app/api/cli/deploy/route.js` (where deploy lock is enforced).
