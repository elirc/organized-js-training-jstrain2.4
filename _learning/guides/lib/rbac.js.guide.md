# Guide: lib/rbac.js

## Purpose

This file implements Role-Based Access Control (RBAC) — the system that decides "can this user do this action?" It's one of the simplest but most critical files in the project. Every API endpoint that modifies data checks permissions through these functions.

## Line-by-Line Walkthrough

```js
const ENV_DEPLOY_PERMISSIONS = {
  OWNER: ["dev", "staging", "production"],
  DEPLOYER: ["dev", "staging"],
  VIEWER: [],
};
```
A lookup table that maps roles to which environments they can deploy to:
- **OWNER** — can deploy anywhere, including production
- **DEPLOYER** — can deploy to dev and staging, but NOT production
- **VIEWER** — cannot deploy anywhere

This is an environment-level permission layer on top of the action-level permissions below.

```js
const ACTIONS = {
  view: ["OWNER", "DEPLOYER", "VIEWER"],
  deploy: ["OWNER", "DEPLOYER"],
  rollback: ["OWNER", "DEPLOYER"],
  lockDeploys: ["OWNER"],
  editSecrets: ["OWNER", "DEPLOYER"],
  editFlags: ["OWNER", "DEPLOYER"],
};
```
A lookup table mapping actions to which roles can perform them. Notice:
- Everyone can `view`
- Only `OWNER` can `lockDeploys` (this is a high-risk operation)
- `DEPLOYER` can deploy but can't lock — they can do their job but can't block others

```js
export function canPerform(role, action) {
  const allowed = ACTIONS[action] ?? [];
  return allowed.includes(role);
}
```
Checks if a role is in the list of allowed roles for an action.
- `ACTIONS[action]` looks up the action in the table
- `?? []` — if the action doesn't exist in the table, default to an empty array (deny by default)
- `.includes(role)` — checks if the role is in the allowed list

**The security principle:** deny by default. If an action isn't listed, nobody can do it.

```js
export function canDeployToEnvironment(role, envSlug) {
  const allowedEnvs = ENV_DEPLOY_PERMISSIONS[role] ?? [];
  return allowedEnvs.includes(envSlug);
}
```
Same pattern, but checks environment-level permissions. A DEPLOYER can `deploy` (action check passes), but if they try to deploy to `production` (environment check), they're blocked.

## Concepts Taught
- **RBAC (Role-Based Access Control)** — the most common permission model in enterprise software
- **Lookup table pattern** — using objects as maps instead of if/else chains
- **Defense in depth** — two layers of permission checks (action + environment)
- **Deny by default** — if something isn't explicitly allowed, it's denied
- **Nullish coalescing (`??`)** — defaulting to a safe value when a key is missing

**Extra example:** Here's how a simpler RBAC might look for a blog:
```js
const BLOG_ACTIONS = {
  readPost: ["admin", "editor", "reader"],
  writePost: ["admin", "editor"],
  deletePost: ["admin"],
};
```

## Common Mistakes
- Using `||` instead of `??` for the default — `||` would also catch `0`, `""`, and `false`, while `??` only catches `null`/`undefined`. Here it doesn't matter since actions are strings, but `??` is more precise.
- Forgetting to check both action AND environment permissions — the deployment route checks both because they answer different questions
- Hardcoding role checks in API routes instead of using this centralized module — that leads to inconsistency ("I added a new role but forgot to update 5 endpoints")

## Mini Exercises
1. Add a new action `"deleteApp"` that only `OWNER` can perform. What one line do you add?
2. Add a new role `"ADMIN"` that can do everything including `lockDeploys`. What lines change?
3. What would happen if you called `canPerform("DEPLOYER", "deleteEverything")`? Why is this safe?

## Further Reading
- Search: "RBAC explained for developers"
- Search: "principle of least privilege"
- Search: "OWASP access control cheat sheet"
