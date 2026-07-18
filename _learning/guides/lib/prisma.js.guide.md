# Guide: lib/prisma.js

## Purpose

This file creates and exports a single database connection that the entire application shares. It solves a specific problem: during development, Next.js hot-reloads your code frequently, and without this pattern, each reload would create a NEW database connection, eventually exhausting resources.

## Line-by-Line Walkthrough

```js
import { PrismaClient } from "@prisma/client";
```
Imports the Prisma client — this is the auto-generated class that provides methods like `prisma.application.findMany()`. It was generated from `prisma/schema.prisma` when you ran `prisma generate`.

```js
const globalForPrisma = globalThis;
```
`globalThis` is a JavaScript built-in that refers to the global object. In Node.js, this is the `global` object. In browsers, it's `window`. The key property: **it survives module reloads**. When Next.js hot-reloads a file, the module is re-executed, but `globalThis` stays the same.

```js
export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
```
This is the singleton pattern:
1. Check if a Prisma client already exists on `globalThis`
2. If yes, reuse it (no new connection)
3. If no, create a new one

The `log` option configures what Prisma logs to the console:
- In development: warnings and errors (helpful for debugging)
- In production: only errors (less noise)

```js
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```
Stores the client on `globalThis` for reuse — but only in development. In production, modules don't hot-reload, so there's no risk of creating multiple connections.

## Concepts Taught
- **Singleton pattern** — ensuring only one instance exists
- **globalThis** — accessing the global object in any JavaScript environment
- **Hot module replacement (HMR)** — how dev servers reload code without restarting
- **Short-circuit evaluation** — `existingValue || newValue` returns the first truthy value
- **Environment-aware configuration** — behaving differently in dev vs production

## Common Mistakes
- Creating `new PrismaClient()` directly in every file that needs it — this creates multiple connections and will eventually crash
- Storing the client on `globalThis` in production — unnecessary and could leak memory in serverless environments
- Forgetting to import from `@/lib/prisma` and instead importing directly from `@prisma/client` — bypasses the singleton

## Mini Exercises
1. What would happen if you removed the `globalForPrisma.prisma = prisma` line? When would you notice the problem?
2. Add a third log level: in a new `"test"` environment, log nothing at all. How would you modify the ternary?
3. Why can't you use `let prisma` instead of `const prisma` here? (Hint: think about what `export const` means for consumers.)

## Further Reading
- Search: "prisma best practices next.js"
- Search: "singleton pattern javascript"
- Search: "globalThis javascript MDN"
