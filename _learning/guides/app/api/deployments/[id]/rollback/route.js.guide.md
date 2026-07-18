# Guide: Deployment Rollback Endpoint

**File:** `app/api/deployments/[id]/rollback/route.js`

---

## Purpose

This file defines a POST endpoint that rolls back a deployment to a previous state. When something goes wrong after a deploy -- a bug slips through, a config is broken, the app crashes -- you need a fast way to get back to the version that was working. That is what this endpoint does.

The key insight here is that a rollback does **not** undo the old deployment. It creates a **brand-new deployment** that happens to use the same code and configuration as a previous one. This is a critical design decision that we will explore in depth.

---

## Line-by-Line Walkthrough

```js
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActor, getTeamRole } from "@/lib/session";
import { canDeployToEnvironment, canPerform } from "@/lib/rbac";
import { rollbackDeployment } from "@/lib/platform-service";
```

**Lines 1-5:** We import five things:
- `NextResponse` -- Next.js helper for building HTTP responses.
- `prisma` -- Our database client for reading deployment records.
- `getActor` and `getTeamRole` -- Session helpers that tell us *who* is making this request and what role they have on the team.
- `canPerform` and `canDeployToEnvironment` -- Two RBAC (Role-Based Access Control) functions. This endpoint requires **two** permission checks, which is unusual and worth paying attention to.
- `rollbackDeployment` -- The service function that does the actual work. Our route handler is just the gatekeeper.

```js
export async function POST(request, { params }) {
  const actor = await getActor(request);
```

**Lines 7-8:** We export a `POST` handler. Next.js App Router hands us the `request` object and a `params` object. Because this file lives at `deployments/[id]/rollback/route.js`, the `params.id` will contain the deployment ID from the URL. For example, a POST to `/api/deployments/abc123/rollback` means `params.id` is `"abc123"`.

We immediately figure out who the caller is with `getActor`. This returns a user object (or possibly null/undefined if the request is unauthenticated).

```js
  const deployment = await prisma.deployment.findUnique({
    where: { id: params.id },
    include: {
      application: true,
      environment: true,
    },
  });

  if (!deployment) {
    return NextResponse.json({ error: "Deployment not found" }, { status: 404 });
  }
```

**Lines 10-19:** We load the deployment from the database. Notice the `include` block -- we are not just loading the deployment itself, but also its related `application` and `environment` records. We need these because:
1. The application tells us which **team** owns this deployment (for the RBAC check).
2. The environment tells us its **slug** (like "production" or "staging"), which we need for the second permission check.

If the deployment does not exist, we return a 404. Always validate that the resource exists before doing anything else.

```js
  const role = await getTeamRole({
    userId: actor?.id,
    teamId: deployment.application.teamId,
  });

  if (!canPerform(role, "rollback")) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  if (!canDeployToEnvironment(role, deployment.environment.slug)) {
    return NextResponse.json({ error: "Cannot rollback this environment" }, { status: 403 });
  }
```

**Lines 22-33:** Here is the two-layer RBAC check. First we look up the user's role on the team that owns this application. Then we ask two questions:

1. **Can this role perform rollbacks at all?** A viewer probably cannot. An admin can. This is the "action" check.
2. **Can this role deploy to this specific environment?** Maybe a developer can roll back staging, but only a lead can roll back production. This is the "environment" check.

Both must pass. If either fails, we return 403 Forbidden. Notice the error messages are different -- this helps the frontend show a useful message to the user.

```js
  const rollback = await rollbackDeployment({
    deploymentId: deployment.id,
    actorUserId: actor?.id,
  });

  return NextResponse.json(rollback, { status: 201 });
}
```

**Lines 35-41:** If all checks pass, we delegate to `rollbackDeployment`. We pass the deployment ID and who triggered it. The service function handles all the complex logic -- creating a new deployment record, copying the right configuration, setting the status.

We return **201 Created**, not 200 OK. This is a deliberate choice: a rollback creates a new deployment record. The HTTP 201 status code means "a new resource was created as a result of this request."

---

## Concepts Taught

### What Is a Rollback?

In deployment systems, a "rollback" means returning to a previously known-good state. Imagine you deploy version 5 of your app, and it starts crashing. A rollback to version 4 gets your users back to a working experience as fast as possible.

### Why Create a New Record Instead of Modifying the Old One?

This is one of the most important architectural decisions in this file. When you roll back from version 5 to version 4, the system does **not** delete version 5 or mark it as "undone." Instead, it creates version 6 -- which happens to be identical to version 4.

Why? Three reasons:

1. **Audit trail.** You can see exactly what happened: version 5 was deployed at 2pm, and at 2:15pm someone rolled back (creating version 6). If you modified the old record, you would lose the history of what went wrong.

2. **Safety.** If you modify or delete the version 5 record, and the rollback itself has a bug, you have lost information about both the broken deploy AND the failed rollback. With immutable records, you can always trace what happened.

3. **Consistency.** Every deployment goes through the same pipeline. A rollback is just another deployment. This means your monitoring, notifications, and logs all work the same way whether it is a fresh deploy or a rollback.

This pattern is called **append-only** or **immutable history**, and it is used in banking systems, version control (git), and event sourcing architectures.

### Two-Layer RBAC

Most endpoints in this project check a single permission. This one checks two. That is because rollback is a high-stakes operation -- it changes what is running in an environment. The two checks answer different questions:
- `canPerform("rollback")` -- "Does your role allow rollbacks in general?"
- `canDeployToEnvironment(role, slug)` -- "Does your role allow changes to THIS environment?"

This means you could have a role that can roll back staging but not production.

### The Route Handler as Gatekeeper

Notice how thin this file is. It does not contain any business logic about how rollbacks work. It validates the request, checks permissions, and delegates to `rollbackDeployment`. This is the **thin controller** pattern. The route handles HTTP concerns (parsing requests, returning responses, status codes). The service handles domain concerns (what a rollback actually does).

---

## Common Mistakes

1. **Returning 200 instead of 201.** Since a rollback creates a new deployment, the correct status is 201 Created. Many beginners default to 200 for all successful responses, but using the right status code makes your API more predictable and self-documenting.

2. **Forgetting the second RBAC check.** It is tempting to think "if they can rollback, they can rollback anything." But in a real organization, production access is often restricted to a smaller group. Always think about whether environment-level permissions are needed.

3. **Trying to modify the old deployment record.** Beginners sometimes want to set `deployment.status = "rolled_back"` and save it. This loses history and violates the append-only pattern. The original deployment record should remain as-is, and a new one is created.

4. **Not including related records in the database query.** If you forget `include: { application: true, environment: true }`, you will not have the `teamId` or environment `slug` needed for the RBAC checks. The code would crash with "Cannot read property 'teamId' of undefined."

5. **Using optional chaining (`actor?.id`) without understanding it.** The `?.` means "if actor is null or undefined, give me undefined instead of crashing." This is important because `getActor` might return null for unauthenticated requests. The RBAC check will then fail gracefully (a null userId will not match any role).

---

## Mini Exercises

### Exercise 1: Trace the Failure Path

Suppose a user with the role "viewer" makes a POST request to `/api/deployments/abc123/rollback`, and deployment `abc123` exists. Walk through the code line by line. Which line returns a response? What status code does the user get? What JSON body?

<details>
<summary>Answer</summary>

The code loads the deployment (lines 10-16), finds it exists, then gets the team role (line 22-25). When it calls `canPerform("viewer", "rollback")`, this returns `false` because viewers cannot perform rollbacks. The code hits line 28 and returns:

```json
{ "error": "Insufficient permissions" }
```

with status code **403**. The second RBAC check on line 31 is never reached.
</details>

### Exercise 2: Why 201 and Not 200?

Explain in your own words why this endpoint returns HTTP 201 instead of 200. Then think of another endpoint in a typical application that should also return 201.

<details>
<summary>Answer</summary>

201 means "Created" -- a new resource was made. The rollback creates a new deployment record in the database. Other endpoints that should return 201: creating a user account, posting a comment, uploading a file -- any time a POST creates a new persistent resource.
</details>

### Exercise 3: Add Deploy Lock Checking

Look at how `app/api/cli/deploy/route.js` checks for `environment.deployLocked` before allowing a deploy. This rollback endpoint does **not** check the deploy lock. Should it? Write a few lines of code that would add a deploy lock check after the RBAC checks. Think about whether a locked environment should also block rollbacks, or if rollbacks should always be allowed (since they are an emergency measure).

<details>
<summary>Hint</summary>

There is no single right answer here. Arguments for checking: "locked means locked, no changes." Arguments against: "rollbacks are for emergencies, and you might need to roll back precisely because something is broken and you locked deploys to prevent further damage." This is a real design discussion teams have.
</details>

---

## Further Reading

- [HTTP Status Codes (MDN)](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status) -- Understand when to use 200 vs 201 vs 204.
- [Role-Based Access Control (OWASP)](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) -- Security best practices for authorization.
- [Immutable Data Patterns](https://en.wikipedia.org/wiki/Append-only) -- Why append-only designs are common in critical systems.
- [Next.js Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers) -- How dynamic route segments like `[id]` work.
- Related project files: `lib/platform-service.js` (the `rollbackDeployment` function), `lib/rbac.js` (the permission functions).
