# Guide: lib/deployments.js

## Purpose

This file contains pure business logic related to deployments — no database calls, no API handling, just rules and calculations. It defines the deployment state machine (which status transitions are valid), semantic version parsing, and a utility for masking sensitive strings. These functions are imported by both the service layer and the API bootstrap endpoint.

## Line-by-Line Walkthrough

### State Machine (Lines 1-12)

```js
export const DEPLOYMENT_TRANSITIONS = {
  BUILDING: ["DEPLOYING", "FAILED"],
  DEPLOYING: ["LIVE", "FAILED"],
  LIVE: ["ROLLED_BACK"],
  FAILED: ["ROLLED_BACK"],
  ROLLED_BACK: [],
};
```
This is a **state machine** defined as a lookup table. Each key is a current state, and the value is an array of states it can transition to.

Reading it in English:
- A `BUILDING` deployment can become `DEPLOYING` (build succeeded) or `FAILED` (build broke)
- A `DEPLOYING` deployment can become `LIVE` (deploy succeeded) or `FAILED` (deploy broke)
- A `LIVE` deployment can only be `ROLLED_BACK` (reverted to a previous version)
- A `FAILED` deployment can only be `ROLLED_BACK`
- A `ROLLED_BACK` deployment is **terminal** — no more transitions. The empty array `[]` means "you can't go anywhere from here."

```js
export function canTransitionStatus(fromStatus, toStatus) {
  const allowed = DEPLOYMENT_TRANSITIONS[fromStatus] ?? [];
  return allowed.includes(toStatus);
}
```
Simple validation: "is `toStatus` in the list of allowed transitions from `fromStatus`?"

### Version Parsing (Lines 14-19)

```js
export function toVersionNumber(version) {
  return version
    .replace(/^v/i, "")
    .split(".")
    .map((chunk) => Number.parseInt(chunk, 10) || 0);
}
```
Converts a version string like `"v1.8.1"` into an array of numbers `[1, 8, 1]`:
1. `.replace(/^v/i, "")` — removes the leading "v" (case-insensitive regex: `^` = start, `/i` = case-insensitive)
2. `.split(".")` — splits `"1.8.1"` into `["1", "8", "1"]`
3. `.map(chunk => Number.parseInt(chunk, 10) || 0)` — converts each string to a number. `|| 0` handles cases like `"beta"` → `NaN` → `0`

### Version Comparison (Lines 21-40)

```js
export function compareVersions(a, b) {
  const parsedA = toVersionNumber(a);
  const parsedB = toVersionNumber(b);
  const maxLength = Math.max(parsedA.length, parsedB.length);

  for (let index = 0; index < maxLength; index += 1) {
    const aPart = parsedA[index] ?? 0;
    const bPart = parsedB[index] ?? 0;

    if (aPart > bPart) return 1;
    if (aPart < bPart) return -1;
  }

  return 0;
}
```
Compares two version strings. Returns:
- `1` if `a` is newer than `b`
- `-1` if `a` is older than `b`
- `0` if they're equal

This function can be passed to `Array.sort()` because it follows the standard comparator contract (positive, negative, or zero).

**Why `maxLength`?** Handles versions with different numbers of parts: `"1.0"` vs `"1.0.0"`. Missing parts are treated as `0` via `?? 0`.

### Auto-Version Generation (Lines 42-52)

```js
export function nextPatchVersion(existingVersions) {
  if (!existingVersions.length) {
    return "v1.0.0";
  }

  const sorted = [...existingVersions].sort(compareVersions);
  const latest = sorted[sorted.length - 1];
  const [major, minor, patch] = toVersionNumber(latest);

  return `v${major}.${minor}.${patch + 1}`;
}
```
Generates the next version number by:
1. If no versions exist, start at `v1.0.0`
2. Sort all existing versions numerically
3. Take the latest (highest) version
4. Increment the patch number: `v1.8.1` → `v1.8.2`

**Note:** `[...existingVersions]` creates a copy before sorting because `.sort()` mutates arrays in place. Without the spread, we'd modify the caller's array — a subtle bug.

### Secret Masking (Lines 54-64)

```js
export function maskedSecret(value) {
  if (!value) return "";
  if (value.length < 6) return "*".repeat(value.length);
  return `${value.slice(0, 2)}${"*".repeat(value.length - 4)}${value.slice(-2)}`;
}
```
Converts `"super-secret-key"` to `"su*************ey"`:
- Very short values are fully masked (can't show first/last chars if there aren't enough)
- Longer values show 2 chars at each end with asterisks in between

## Concepts Taught
- **State machine pattern** — modeling valid transitions as data, not code
- **Semantic versioning (SemVer)** — MAJOR.MINOR.PATCH convention
- **Comparator functions** — the contract for `Array.sort()` callbacks
- **Regular expressions** — `^v/i` for pattern matching
- **Array spread for cloning** — `[...array]` to avoid mutation
- **Data masking** — hiding sensitive info while keeping it recognizable

**Extra example:** A state machine for an e-commerce order:
```js
const ORDER_TRANSITIONS = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED", "RETURNED"],
  DELIVERED: ["RETURNED"],
  RETURNED: [],
  CANCELLED: [],
};
```

## Common Mistakes
- Forgetting to clone before sorting — `.sort()` modifies the original array
- String comparison of versions — `"9.0.0" > "10.0.0"` is `true` in string comparison because `"9" > "1"`. Always parse to numbers first.
- Not handling the empty array case in `nextPatchVersion` — without the guard, `sorted[sorted.length - 1]` would be `undefined`

## Mini Exercises
1. What does `compareVersions("v2.0.0", "v1.99.99")` return? Trace through the code.
2. Modify `nextPatchVersion` to increment the MINOR version instead of PATCH. What changes?
3. What would `maskedSecret("ab")` return? What about `maskedSecret("")`?

## Further Reading
- Search: "finite state machine javascript"
- Search: "semantic versioning spec semver.org"
- Search: "Array.sort comparator function MDN"
