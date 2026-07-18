# Guide: lib/session.js

## Purpose

This file handles user identification — figuring out "who is making this request?" It provides two functions: one to get the current user, and one to get that user's role on a specific team. In a real production app, this would integrate with an authentication provider (OAuth, JWT tokens, etc.). Here it's a simplified placeholder that reads from an HTTP header.

## Line-by-Line Walkthrough

```js
import { prisma } from "@/lib/prisma";
```
Imports the shared database connection to look up user records.

```js
export async function getActor(request) {
  const emailHeader = request.headers.get("x-user-email");
  const email = emailHeader || "owner@acme.dev";
```
- `request.headers.get("x-user-email")` — reads a custom HTTP header. In a real app, this would be a JWT token or session cookie.
- If no header is set, defaults to `"owner@acme.dev"` — the seed data owner. This means during development, you're always logged in as the owner.

```js
  const actor = await prisma.user.findUnique({
    where: { email },
  });

  if (actor) {
    return actor;
  }

  return prisma.user.findFirst({
    orderBy: { createdAt: "asc" },
  });
}
```
1. Look up the user by email
2. If found, return them
3. If not found (e.g., the header contains an email that doesn't exist in the DB), fall back to the oldest user in the system

**Honesty note:** This fallback is a convenience for development. In production, if the user doesn't exist, you should return a 401 (Unauthorized) response, not silently fall back to another user.

```js
export async function getTeamRole({ userId, teamId }) {
  if (!userId || !teamId) {
    return "VIEWER";
  }
```
Guard clause: if either value is missing, default to the most restrictive role. This is safe because VIEWER has the least permissions.

```js
  const member = await prisma.teamMember.findUnique({
    where: {
      teamId_userId: {
        teamId,
        userId,
      },
    },
  });

  return member?.role ?? "VIEWER";
}
```
- `teamId_userId` — this is Prisma's syntax for looking up a record by a compound unique constraint (`@@unique([teamId, userId])` in the schema).
- `member?.role` — optional chaining: if `member` is null (user isn't on this team), this returns `undefined` instead of crashing.
- `?? "VIEWER"` — if the user isn't a member of the team, they get VIEWER permissions (most restrictive).

## Concepts Taught
- **Authentication placeholder** — how to stub out auth during development
- **Guard clauses** — returning early for invalid inputs instead of nesting if/else
- **Optional chaining (`?.`)** — safely accessing properties that might not exist
- **Compound unique lookups** — querying by multiple fields that together form a unique constraint
- **Principle of least privilege** — defaulting to the most restrictive permissions

**Extra example:** In a real app, `getActor` might look like:
```js
export async function getActor(request) {
  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) throw new AuthError("No token provided");
  const decoded = verifyJWT(token); // throws if expired or invalid
  const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
  if (!user) throw new AuthError("User not found");
  return user;
}
```

## Common Mistakes
- Trusting HTTP headers without verification — anyone can set `x-user-email` to any value. In production, you must verify tokens cryptographically.
- Not handling the "user not found" case — the fallback here is convenient but would be a security hole in production.
- Forgetting that `getTeamRole` is `async` — it queries the database, so you must `await` it.

## Mini Exercises
1. What role would a user get if they're not a member of any team? Trace through the code.
2. How would you modify `getActor` to return `null` instead of falling back to another user? What would the API routes need to change?
3. If you wanted to support API keys instead of email headers, what would you change in `getActor`?

## Further Reading
- Search: "JWT authentication explained"
- Search: "HTTP authentication headers"
- Search: "principle of least privilege security"
