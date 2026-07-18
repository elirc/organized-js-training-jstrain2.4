# Guide: lib/platform-service.js

## Purpose

This is the **service layer** — the most important business logic file in the project. It sits between the API route handlers and the database, orchestrating complex operations that involve multiple database calls and audit logging. Instead of putting this logic directly in the API routes (which would make them bloated and hard to reuse), it's extracted here so both the web API and CLI API can share it.

## Line-by-Line Walkthrough

### Imports (Lines 1-3)
```js
import { prisma } from "@/lib/prisma";
import { writeAuditEntry } from "@/lib/audit";
import { canTransitionStatus, nextPatchVersion } from "@/lib/deployments";
```
This file brings together the database, audit logging, and deployment business rules. It's the **orchestrator**.

### Loading Application Context (Lines 5-23)
```js
export async function loadApplicationContext(applicationId) {
  return prisma.application.findUnique({
    where: { id: applicationId },
    include: {
      team: true,
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
}
```
Loads an application with all its related data in a single query. Prisma's `include` creates SQL JOINs under the hood. Without `include`, you'd get just the application row with no related data.

The `orderBy: { stageOrder: "asc" }` ensures pipeline stages come back in the correct order (Build before Test before Deploy).

### Creating a Deployment (Lines 25-71)
```js
export async function createDeployment({
  applicationId,
  environmentId,
  actorUserId,
  commitSha,
  commitMessage,
  version,
  pipelineId,
  promotedFromId,
}) {
```
This function handles the full "create a new deployment" workflow.

```js
  const existingDeployments = await prisma.deployment.findMany({
    where: { applicationId },
    select: { version: true },
  });
  const resolvedVersion =
    version || nextPatchVersion(existingDeployments.map((deployment) => deployment.version));
```
**Auto-versioning:** If the caller doesn't provide a version, the function:
1. Fetches all existing versions for this app
2. Uses `nextPatchVersion` to calculate the next one (e.g., `v1.8.1` → `v1.8.2`)

`select: { version: true }` is a performance optimization — only fetch the `version` column, not the entire deployment record.

```js
  const deployment = await prisma.deployment.create({
    data: {
      applicationId,
      environmentId,
      actorUserId,
      pipelineId,
      status: "BUILDING",
      version: resolvedVersion,
      commitSha: commitSha || Math.random().toString(16).slice(2, 9),
      commitMessage: commitMessage || "Manual deploy",
      promotedFromId,
      diffSummary: "Pending build diff",
    },
  });
```
Creates the deployment with:
- Status starts at `BUILDING` (the first state in the state machine)
- If no commit SHA provided, generates a random one (for manual/test deploys)
- `promotedFromId` links to a staging deployment if this is a promotion

```js
  await writeAuditEntry({
    applicationId,
    environmentId,
    actorUserId,
    action: "deployment.started",
    entityType: "Deployment",
    entityId: deployment.id,
    details: { status: deployment.status, version: deployment.version },
  });

  return deployment;
}
```
Audit trail: records who started the deployment, for which app, in which environment.

### Transitioning Deployment Status (Lines 73-108)
```js
export async function transitionDeployment({ deploymentId, toStatus, actorUserId }) {
  const deployment = await prisma.deployment.findUnique({
    where: { id: deploymentId },
  });

  if (!deployment) {
    throw new Error("Deployment not found");
  }

  if (!canTransitionStatus(deployment.status, toStatus)) {
    throw new Error(`Invalid transition ${deployment.status} -> ${toStatus}`);
  }
```
**State machine enforcement:** Before changing the status, it validates the transition is legal. You can't go from `LIVE` to `BUILDING` — that makes no sense.

```js
  const updated = await prisma.deployment.update({
    where: { id: deploymentId },
    data: {
      status: toStatus,
      completedAt: ["LIVE", "FAILED", "ROLLED_BACK"].includes(toStatus) ? new Date() : null,
    },
  });
```
When a deployment reaches a terminal or final state (`LIVE`, `FAILED`, `ROLLED_BACK`), it records the completion timestamp. The `BUILDING` → `DEPLOYING` transition doesn't set `completedAt` because the deployment is still in progress.

### Rolling Back (Lines 110-148)
```js
export async function rollbackDeployment({ deploymentId, actorUserId }) {
  const deployment = await prisma.deployment.findUnique({
    where: { id: deploymentId },
  });

  if (!deployment) {
    throw new Error("Deployment not found");
  }

  const rollback = await prisma.deployment.create({
    data: {
      applicationId: deployment.applicationId,
      environmentId: deployment.environmentId,
      pipelineId: deployment.pipelineId,
      actorUserId,
      version: deployment.version,
      commitSha: deployment.commitSha,
      commitMessage: `Rollback to ${deployment.version}`,
      status: "ROLLED_BACK",
      rollbackOfId: deploymentId,
      diffSummary: `Rollback created from deployment ${deploymentId}`,
      completedAt: new Date(),
    },
  });
```
A rollback creates a NEW deployment record that:
- Copies the version and commit from the original deployment
- Sets `rollbackOfId` to link back to what was rolled back
- Status is immediately `ROLLED_BACK` with a completion time (rollbacks are instant)

**Design choice:** Rather than modifying the original deployment, a rollback creates a new record. This preserves history — you can always see that a rollback happened, when, and by whom.

### Querying Deployment Logs (Lines 150-183)
```js
export async function listDeploymentLogs({
  deploymentId,
  severity,
  keyword,
  from,
  to,
  take = 1000,
}) {
  const where = {
    deploymentId,
    ...(severity ? { severity } : {}),
    ...(keyword ? { message: { contains: keyword } } : {}),
    ...(from || to ? {
      timestamp: {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      },
    } : {}),
  };

  return prisma.deploymentLog.findMany({
    where,
    orderBy: { timestamp: "asc" },
    take,
  });
}
```
This is a **dynamic query builder**. The `where` clause is constructed conditionally — only filters that have values are included. The spread operator (`...`) merges conditions together.

- `severity` — filter by log level (e.g., only ERROR logs)
- `keyword` — text search in log messages (`contains` = SQL LIKE)
- `from`/`to` — time range filter (`gte` = greater than or equal, `lte` = less than or equal)
- `take` — limits the number of results (pagination)

## Concepts Taught
- **Service layer pattern** — separating business logic from HTTP handling
- **State machine enforcement** — validating transitions before allowing them
- **Auto-versioning** — deriving the next version from existing data
- **Audit trail** — recording every important action
- **Dynamic query building** — constructing database queries based on optional parameters
- **Immutable history** — creating new records instead of modifying existing ones (for rollbacks)
- **Error throwing** — using exceptions for "this shouldn't happen" scenarios

## Common Mistakes
- Calling `createDeployment` without checking permissions first — this function doesn't check RBAC; the API route is responsible for that. Separating "can they?" from "do it" is intentional but must be done consistently.
- Not awaiting `writeAuditEntry` — if you forget `await`, the function returns before the audit entry is saved. If the server crashes, you lose the audit trail.
- Building the `where` clause with `null` values — Prisma interprets `{ severity: null }` as "WHERE severity IS NULL", not "no filter." The conditional spread prevents this.

## Mini Exercises
1. Add a `cancelDeployment` function that transitions a `BUILDING` deployment to `FAILED` and writes an audit entry with action `"deployment.cancelled"`.
2. The `listDeploymentLogs` function doesn't support pagination offset. How would you add a `skip` parameter?
3. What would happen if two people called `createDeployment` simultaneously for the same app? Could they get the same version number? How would you prevent that?

## Further Reading
- Search: "service layer pattern node.js"
- Search: "dynamic query building prisma"
- Search: "conditional object spread javascript"
