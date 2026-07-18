# Guide: lib/store.js

## Purpose

This file creates the client-side state store using Zustand. It manages **UI state** — which application is selected, which environment is selected, which deployment is being viewed, and what log filters are active. This is different from **server state** (the actual data from the database), which is managed by TanStack Query.

## Line-by-Line Walkthrough

```js
import { create } from "zustand";
```
Imports Zustand's `create` function. Zustand is a tiny state management library (3KB) that's much simpler than Redux.

```js
export const usePlatformStore = create((set) => ({
```
`create` takes a function that receives a `set` function. You use `set` to update state. The function returns an object with:
- State values (data)
- State setters (functions that modify data)

The result `usePlatformStore` is a **React hook** — you call it inside components to read and update state.

```js
  selectedAppId: null,
  selectedEnvironmentId: null,
  selectedDeploymentId: null,
  logFilters: {
    severity: "",
    keyword: "",
  },
```
Initial state: nothing is selected, no filters applied. These values are read by components like `PlatformDashboard` to know what to display.

```js
  setSelectedAppId: (selectedAppId) =>
    set(() => ({
      selectedAppId,
      selectedEnvironmentId: null,
      selectedDeploymentId: null,
    })),
```
**Cascading reset:** When you select a different app, the environment and deployment selections are reset to `null`. This is because the old selections belong to the previous app and would be invalid.

Think of it like a navigation hierarchy: Country → City → Street. If you change the country, the city and street must reset.

```js
  setSelectedEnvironmentId: (selectedEnvironmentId) =>
    set(() => ({
      selectedEnvironmentId,
      selectedDeploymentId: null,
    })),
```
Same pattern: changing the environment resets the deployment (but keeps the app selection).

```js
  setSelectedDeploymentId: (selectedDeploymentId) => set(() => ({ selectedDeploymentId })),
  setLogFilters: (logFilters) => set(() => ({ logFilters })),
}));
```
These don't reset anything else — they're leaf-level selections.

**How `set` works:** `set` takes a function that returns an object. Zustand merges that object with the current state (shallow merge). So `set(() => ({ selectedAppId: "abc" }))` only updates `selectedAppId` — all other state values are preserved.

## Concepts Taught
- **Global state management** — sharing state across components without prop drilling
- **Zustand** — a minimal alternative to Redux
- **Cascading resets** — maintaining state consistency when parent selections change
- **Shallow merge** — `set` merges the returned object, not replaces it
- **Hooks pattern** — `usePlatformStore` is a custom React hook

**Extra example:** A simpler Zustand store for a counter:
```js
const useCounter = create((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
  reset: () => set(() => ({ count: 0 })),
}));

// In a component:
const { count, increment } = useCounter();
```

## Common Mistakes
- Storing server data (like the list of applications) in Zustand — that belongs in TanStack Query. Zustand is for UI state only.
- Forgetting the cascading resets — if `setSelectedAppId` didn't reset `selectedEnvironmentId`, the environment panel could show data from the wrong app.
- Using `set({ ... })` instead of `set(() => ({ ... }))` — both work, but the function form is safer when you need the previous state.

## Mini Exercises
1. Add a `selectedPipelineId` state value. Which setter should reset it? (Hint: think about the hierarchy.)
2. What happens if a component calls `setLogFilters({ severity: "ERROR" })` — does the `keyword` filter disappear? Why or why not?
3. How would you add a `resetAll` function that clears all selections back to the initial state?

## Further Reading
- Search: "zustand react tutorial"
- Search: "react state management comparison 2024"
- Search: "prop drilling react problem"
