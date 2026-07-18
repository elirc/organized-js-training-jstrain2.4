# Guide: jsconfig.json

## Purpose

This tiny file tells your code editor and Next.js how to resolve import paths. Specifically, it sets up the `@/` path alias so you can write `import { prisma } from "@/lib/prisma"` instead of messy relative paths like `import { prisma } from "../../../lib/prisma"`.

## Line-by-Line Walkthrough

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

- `compilerOptions` — settings for how JavaScript/TypeScript is processed. Even though this is a JS project (not TypeScript), Next.js reads this file.
- `paths` — a mapping from import aliases to file system locations.
- `"@/*": ["./*"]` — this says: "whenever you see `@/something`, look for it at `./something` relative to the project root."

### What this enables:

```js
// Without alias (fragile, hard to read):
import { prisma } from "../../lib/prisma";

// With alias (clean, always works regardless of file depth):
import { prisma } from "@/lib/prisma";
```

## Concepts Taught
- **Path aliases** — mapping short names to file system paths
- **Developer experience (DX)** — small configurations that make daily coding easier
- **Module resolution** — how Node.js and bundlers find the file when you `import` something

## Common Mistakes
- Forgetting the `*` wildcard — `"@/"` without `*` wouldn't match `@/lib/prisma`
- Using `@/` in Node.js scripts (like `prisma/seed.js`) — path aliases only work through the bundler (Next.js/Webpack/Turbopack), not in raw `node` execution. That's why `seed.js` uses `require()` with normal paths.

## Mini Exercises
1. What import path would you write to import a file at `components/monitoring-panel.jsx`?
2. If you added `"~/*": ["./components/*"]` to paths, what would `import X from "~/audit-panel"` resolve to?

## Further Reading
- Search: "next.js path aliases jsconfig"
- Search: "typescript path mapping explained"
