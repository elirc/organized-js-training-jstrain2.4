# Guide: package.json

## Purpose

This is the project's manifest file. It tells npm (Node Package Manager) what this project is called, what scripts you can run, and what libraries it depends on. Every Node.js project has one. Think of it as the project's resume — it lists everything the project needs to function.

## Line-by-Line Walkthrough

### Lines 1-4: Project Identity
```json
{
  "name": "jstrain2.4",
  "version": "0.1.0",
  "private": true,
```
- `name` — the project name. Used if you ever publish this as a package (we won't).
- `version` — follows semantic versioning (major.minor.patch). `0.1.0` means "first minor version, pre-release."
- `private: true` — prevents accidentally publishing to the npm registry. Always set this for internal apps.

### Lines 5-14: Scripts
```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "db:generate": "prisma generate",
  "db:migrate": "prisma migrate dev",
  "db:seed": "node prisma/seed.js",
  "db:setup": "node scripts/setup-db.js"
},
```
Scripts are shortcuts you run with `npm run <name>`. For example, `npm run dev` runs `next dev`.

- `dev` — starts the development server with hot reloading
- `build` — creates optimized production files
- `start` — runs the production build
- `lint` — checks code for style issues and potential bugs
- `db:generate` — creates TypeScript/JS types from the Prisma schema so your IDE gives you autocomplete
- `db:migrate` — applies database schema changes (not used in this project due to tooling issues)
- `db:seed` — populates the database with sample data
- `db:setup` — the full setup: generate client, create tables, seed data

### Lines 15-29: Dependencies
These are libraries your code `import`s at runtime:

| Package | What it does |
|---------|-------------|
| `@prisma/client` | Talks to the database (auto-generated from schema) |
| `@tanstack/react-query` | Manages server data fetching, caching, and synchronization |
| `@tanstack/react-virtual` | Renders only visible items in long lists (virtualization) |
| `clsx` | Conditionally joins CSS class names: `clsx("btn", isActive && "active")` |
| `dayjs` | Lightweight date formatting (like Moment.js but 2KB instead of 300KB) |
| `next` | The full-stack React framework (routing, server, bundling) |
| `prisma` | ORM CLI and engine for database operations |
| `react` / `react-dom` | The core React library and its browser renderer |
| `reactflow` | Visual graph/flowchart renderer for the pipeline DAG |
| `recharts` | Charting library built on React and D3 |
| `uuid` | Generates unique IDs (not actually used much — Prisma handles IDs) |
| `zod` | Runtime schema validation for API request bodies |
| `zustand` | Tiny state management for React (3KB, simpler than Redux) |

### Lines 30-36: Dev Dependencies
Only needed during development, not in production:

| Package | What it does |
|---------|-------------|
| `@tailwindcss/postcss` | PostCSS plugin that processes Tailwind CSS |
| `eslint` | Code linter that catches bugs and enforces style |
| `eslint-config-next` | ESLint rules specific to Next.js |
| `tailwindcss` | Utility-first CSS framework |

## Concepts Taught
- **Package management** — how npm resolves, installs, and locks dependency versions
- **Semantic versioning in dependencies** — `^6.16.2` means "6.16.2 or higher, but below 7.0.0"
- **Dev vs production dependencies** — `devDependencies` aren't shipped to users
- **npm scripts** — custom commands as aliases for common tasks

## Common Mistakes
- Forgetting `npm install` after cloning — you'll get "module not found" errors
- Confusing `dependencies` and `devDependencies` — if your app needs it at runtime, it goes in `dependencies`
- Editing `package-lock.json` manually — never do this, let npm manage it

## Mini Exercises
1. Add a new script called `"db:reset"` that runs `"node scripts/setup-db.js"` — how is this different from `db:setup`? (Trick question: it's the same. But naming communicates intent.)
2. What happens if you change `"private": true` to `false` and run `npm publish`? Why is `private` important?
3. Look at the version numbers with `^` prefixes. What's the difference between `^6.16.2`, `~6.16.2`, and `6.16.2`?

## Further Reading
- Search: "npm package.json documentation"
- Search: "semantic versioning explained"
- Search: "npm scripts guide"
