# Guide: lib/audit.js

## Purpose

This file provides a single function that writes an audit log entry to the database. Audit logs record "who did what, when, and to which resource." They're essential for compliance, debugging, and understanding what happened when things go wrong. Almost every write operation in the app calls this function.

## Line-by-Line Walkthrough

```js
import { prisma } from "@/lib/prisma";
```
Database connection for writing audit entries.

```js
export async function writeAuditEntry({
  organizationId,
  teamId,
  applicationId,
  environmentId,
  actorUserId,
  action,
  entityType,
  entityId,
  details,
}) {
```
This function uses **destructured parameters** — instead of accepting a single object and accessing `params.organizationId`, it pulls out each field by name. This makes it immediately clear what data an audit entry contains.

Notice: most parameters are optional (they can be `undefined`). An audit entry for a team-level action might not have an `applicationId`. An audit entry for a system action might not have an `actorUserId`.

```js
  return prisma.auditLogEntry.create({
    data: {
      organizationId,
      teamId,
      applicationId,
      environmentId,
      actorUserId,
      action,
      entityType,
      entityId,
      detailsJson: details ? JSON.stringify(details) : null,
    },
  });
}
```
- `prisma.auditLogEntry.create({ data: {...} })` — creates a new row in the `AuditLogEntry` table.
- `detailsJson: details ? JSON.stringify(details) : null` — the `details` parameter is a JavaScript object, but the database column is a string. `JSON.stringify` converts the object to a string for storage. If no details are provided, store `null`.
- When you use **property shorthand** like `{ organizationId }`, it's the same as `{ organizationId: organizationId }`. JavaScript lets you skip the value when the key and variable name match.

## Concepts Taught
- **Audit logging** — recording actions for accountability and debugging
- **Parameter destructuring** — extracting named values from function arguments
- **JSON serialization** — converting objects to strings for database storage
- **Property shorthand** — `{ x }` is equivalent to `{ x: x }`
- **Nullable fields** — not every audit entry needs every field

**Extra example:** A simpler audit log for a blog:
```js
async function logAction(userId, action, postId) {
  await db.auditLog.create({
    data: { userId, action, postId, timestamp: new Date() }
  });
}
// Usage: logAction(user.id, "post.deleted", "abc123");
```

## Common Mistakes
- Forgetting to `await` this function — the audit entry might not be written before the response is sent. In this codebase, some calls don't `await` it (fire-and-forget), which means audit entries could be lost if the server crashes mid-write.
- Storing sensitive data in audit details — don't log secret values, passwords, or tokens in the audit trail
- Not calling `writeAuditEntry` when adding new features — every new write operation should have a corresponding audit entry

## Mini Exercises
1. The `details` parameter is serialized with `JSON.stringify`. What would happen if `details` contained a circular reference (object A references object B which references object A)?
2. Add a `severity` parameter to `writeAuditEntry` (values: "low", "medium", "high"). How would you need to modify the Prisma schema to support this?
3. Where in the codebase is `writeAuditEntry` called? Find at least 3 files that use it and note what `action` strings they pass.

## Further Reading
- Search: "audit logging best practices"
- Search: "JSON.stringify javascript MDN"
- Search: "compliance audit trail requirements"
