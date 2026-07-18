# Guide: platform-dashboard.jsx

## Purpose

This is the main orchestrator component for the entire Orbit Deploy Console. Think of it as the "conductor" of an orchestra -- it does not play any instrument itself, but it tells every other component what to do and when to do it. It fetches all the data the application needs, manages which app/environment/deployment is currently selected, and arranges every panel on the screen.

If you are coming from basic tutorials where a single component does everything, this file teaches you how real production apps are structured: one top-level component coordinates many specialized child components.

## Line-by-Line Walkthrough

### Line 1: The "use client" Directive
```jsx
"use client";
```
Next.js 13+ treats every component as a **server component** by default. Server components render on the server and send pure HTML to the browser -- they cannot use hooks like `useState` or `useEffect`. By writing `"use client"` at the very top, we tell Next.js "this component runs in the browser." We need this because our dashboard uses `useEffect`, `useMemo`, and TanStack Query's `useQuery` -- all of which are browser-only hooks.

**Key rule:** If a component uses any React hook or browser API, it must be a client component.

### Lines 3-15: The Imports
```jsx
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/api";
import { usePlatformStore } from "@/lib/store";
import { AppSelector } from "@/components/app-selector";
import { DeploymentTimeline } from "@/components/deployment-timeline";
import { PipelineGraph } from "@/components/pipeline-graph";
import { LogStreamPanel } from "@/components/log-stream-panel";
import { MonitoringPanel } from "@/components/monitoring-panel";
import { FeatureFlagsPanel } from "@/components/feature-flags-panel";
import { SecretsPanel } from "@/components/secrets-panel";
import { AuditPanel } from "@/components/audit-panel";
import { EnvironmentPanel } from "@/components/environment-panel";
```
Let's group these by category:

1. **React hooks** (`useEffect`, `useMemo`) -- built-in tools for side effects and memoization.
2. **TanStack Query** (`useQuery`) -- a library that handles fetching data from the server, caching it, and re-fetching when needed. It replaces the manual `useEffect` + `useState` + loading/error pattern you may have seen in tutorials.
3. **Project utilities** (`fetchJson`, `usePlatformStore`) -- our own helper for making HTTP requests, and our Zustand store for global state.
4. **Child components** (everything else) -- every panel you see on screen is its own component file.

The `@/` prefix is a path alias configured in `jsconfig.json`. Instead of writing `../../lib/api`, we write `@/lib/api`. It always points to the project root.

### Lines 17-25: Reading Global State from Zustand
```jsx
export function PlatformDashboard() {
  const {
    selectedAppId,
    selectedEnvironmentId,
    selectedDeploymentId,
    setSelectedAppId,
    setSelectedEnvironmentId,
    setSelectedDeploymentId,
  } = usePlatformStore();
```
`usePlatformStore` is a Zustand store -- a tiny global state container. It holds three pieces of state that many components need to know about:

- `selectedAppId` -- which application the user is looking at
- `selectedEnvironmentId` -- which environment (staging, production, etc.)
- `selectedDeploymentId` -- which specific deployment

We also grab the setter functions (`setSelectedAppId`, etc.) so we can update these values. This is **destructuring** -- we pull exactly the properties we need out of the object the store returns.

**Why Zustand instead of passing props everywhere?** Because `selectedAppId` is needed by the sidebar, the timeline, the pipeline graph, and more. Passing it through every layer of components would create "prop drilling," which gets messy fast. Zustand lets any component read or write this state directly.

### Lines 27-30: Fetching Bootstrap Data
```jsx
  const bootstrap = useQuery({
    queryKey: ["bootstrap"],
    queryFn: () => fetchJson("/api/bootstrap"),
  });
```
This is the single most important data call in the entire app. `useQuery` from TanStack Query does several things automatically:

1. On mount, it calls `fetchJson("/api/bootstrap")` to hit our API.
2. It tracks loading state (`bootstrap.isLoading`), error state (`bootstrap.error`), and the data itself (`bootstrap.data`).
3. It **caches** the result under the key `["bootstrap"]`. If another component asks for `["bootstrap"]`, TanStack returns the cached data instantly instead of making another network request.
4. It automatically re-fetches when the browser tab regains focus.

The `queryKey` is like a name tag for this piece of data. Later, when a mutation succeeds (like creating a new app), we call `queryClient.invalidateQueries({ queryKey: ["bootstrap"] })` to tell TanStack "the bootstrap data is stale, go fetch it again."

### Lines 32-36: Deriving Teams and Applications with useMemo
```jsx
  const teams = useMemo(() => bootstrap.data?.teams ?? [], [bootstrap.data]);
  const applications = useMemo(
    () => teams.flatMap((team) => team.applications),
    [teams],
  );
```
`useMemo` is a performance optimization. It says "only recalculate this value when the dependencies change." Let's break down each line:

**Line 32:** `bootstrap.data?.teams ?? []`
- `?.` is optional chaining -- if `bootstrap.data` is `null` or `undefined`, it returns `undefined` instead of crashing.
- `?? []` is the nullish coalescing operator -- if the left side is `null` or `undefined`, use `[]` (an empty array) instead. This prevents errors when the data hasn't loaded yet.
- The dependency array `[bootstrap.data]` means: only re-run this calculation when `bootstrap.data` changes.

**Lines 33-36:** `teams.flatMap((team) => team.applications)`
- `flatMap` is like `map` followed by `flat`. Each team has an array of applications. `map` would give you `[[app1, app2], [app3]]` (an array of arrays). `flatMap` gives you `[app1, app2, app3]` (a single flat array).
- The dependency is `[teams]`. Since `teams` only changes when `bootstrap.data` changes, this creates a **chain of derived values** -- a very common pattern.

### Lines 38-47: Auto-Selecting the Default App (useEffect #1)
```jsx
  useEffect(() => {
    if (!applications.length) return;
    if (!selectedAppId) {
      setSelectedAppId(applications[0].id);
      return;
    }
    if (!applications.find((application) => application.id === selectedAppId)) {
      setSelectedAppId(applications[0].id);
    }
  }, [applications, selectedAppId, setSelectedAppId]);
```
This effect runs whenever `applications` or `selectedAppId` changes. It handles three scenarios:

1. **No applications loaded yet** (`!applications.length`) -- do nothing and wait.
2. **No app is selected** (`!selectedAppId`) -- automatically select the first app. This is the "default selection" pattern. When the page first loads, nothing is selected, so this picks one for you.
3. **The selected app no longer exists** (the `find` check) -- if someone deleted the app you were looking at, fall back to the first app.

This is a **defensive programming** pattern. Instead of hoping the data is always perfect, the code handles every edge case gracefully.

### Line 49: Finding the Selected App Object
```jsx
  const selectedApp = applications.find((application) => application.id === selectedAppId);
```
We need the full application object (with its environments, deployments, etc.), not just the ID. `find` returns the first item that matches, or `undefined` if nothing matches.

### Lines 51-60: Auto-Selecting the Default Environment (useEffect #2)
```jsx
  useEffect(() => {
    if (!selectedApp) return;
    if (!selectedEnvironmentId) {
      setSelectedEnvironmentId(selectedApp.environments[0]?.id || null);
      return;
    }
    if (!selectedApp.environments.find((environment) => environment.id === selectedEnvironmentId)) {
      setSelectedEnvironmentId(selectedApp.environments[0]?.id || null);
    }
  }, [selectedApp, selectedEnvironmentId, setSelectedEnvironmentId]);
```
Same pattern as above, but for environments. Notice the **cascading reset** behavior: when you select a new app, the Zustand store's `setSelectedAppId` automatically clears `selectedEnvironmentId` to `null` (look at `/lib/store.js` to see this). Then this effect fires and picks the new app's first environment.

The `?.id || null` pattern handles the case where the app has zero environments -- `selectedApp.environments[0]` would be `undefined`, so `undefined?.id` gives `undefined`, and `undefined || null` gives `null`.

### Lines 62-74: Auto-Selecting the Default Deployment (useEffect #3)
```jsx
  useEffect(() => {
    if (!selectedApp) return;
    const deployments = selectedApp.deployments.filter((deployment) =>
      selectedEnvironmentId ? deployment.environmentId === selectedEnvironmentId : true,
    );
    if (!deployments.length) {
      setSelectedDeploymentId(null);
      return;
    }
    if (!selectedDeploymentId || !deployments.find((deployment) => deployment.id === selectedDeploymentId)) {
      setSelectedDeploymentId(deployments[0].id);
    }
  }, [selectedApp, selectedEnvironmentId, selectedDeploymentId, setSelectedDeploymentId]);
```
This is the third level of the cascade. It filters deployments by the selected environment (or shows all if no environment is selected), then picks the first one. The ternary `selectedEnvironmentId ? ... : true` is a **conditional filter** -- when `selectedEnvironmentId` is null, the filter passes everything through.

**The three useEffects together form a cascade:**
1. App changes --> pick default environment
2. Environment changes --> pick default deployment
3. Deployment changes --> update the UI

This is like a set of dominoes. Changing the app topples the environment, which topples the deployment.

### Lines 76-86: Loading, Error, and Empty States
```jsx
  if (bootstrap.isLoading) {
    return <main className="pageLoading">Loading internal platform...</main>;
  }

  if (bootstrap.error) {
    return <main className="pageLoading">Failed to load platform: {bootstrap.error.message}</main>;
  }

  if (!selectedApp) {
    return <main className="pageLoading">No applications found. Run `npm run db:seed` and refresh.</main>;
  }
```
Every production component that fetches data must handle three states before rendering the "happy path":

1. **Loading** -- data is being fetched.
2. **Error** -- the fetch failed.
3. **Empty** -- the fetch succeeded but there's no data.

These are **early returns**. Each `if` checks a bad condition and returns simple UI. Only if all checks pass does the code continue to the main render below. This is called the "guard clause" pattern.

### Lines 88-136: The Main Render
```jsx
  return (
    <main className="page">
      <header className="topBar">
        <div>
          <h1>Orbit Deploy Console</h1>
          <p>Internal developer platform for deploys, logs, feature controls, and infrastructure governance.</p>
        </div>
        <div className="stack alignEnd">
          <span className="muted">{bootstrap.data.name}</span>
          <span className="mono tiny">CLI mirror: /api/cli/*</span>
        </div>
      </header>

      <div className="layout">
        <AppSelector
          teams={teams}
          selectedAppId={selectedAppId}
          selectedEnvironmentId={selectedEnvironmentId}
          onSelectApp={setSelectedAppId}
          onSelectEnvironment={setSelectedEnvironmentId}
        />

        <section className="content stack">
          <DeploymentTimeline
            application={selectedApp}
            selectedEnvironmentId={selectedEnvironmentId}
            selectedDeploymentId={selectedDeploymentId}
            onSelectDeployment={setSelectedDeploymentId}
          />

          <div className="twoCol">
            <PipelineGraph application={selectedApp} />
            <EnvironmentPanel application={selectedApp} selectedEnvironmentId={selectedEnvironmentId} />
          </div>

          <LogStreamPanel deploymentId={selectedDeploymentId} />

          <MonitoringPanel applicationId={selectedApp.id} environmentId={selectedEnvironmentId} />

          <div className="twoCol">
            <FeatureFlagsPanel application={selectedApp} />
            <SecretsPanel application={selectedApp} />
          </div>

          <AuditPanel application={selectedApp} />
        </section>
      </div>
    </main>
  );
```
This is where the "orchestrator" role becomes clear. The dashboard does not contain any deployment cards, pipeline nodes, or log entries itself. Instead, it passes the right data to each child component as **props**:

- `AppSelector` gets `teams`, the current selections, and callback functions (`onSelectApp`, `onSelectEnvironment`).
- `DeploymentTimeline` gets the `application` object and the selected IDs.
- `PipelineGraph` just needs the `application` to find its pipeline.
- `LogStreamPanel` only needs the `deploymentId` to fetch logs for that deployment.

Notice the naming convention for callback props: `onSelectApp`, `onSelectEnvironment`, `onSelectDeployment`. The `on` prefix signals "this prop is a function that will be called when something happens." This is a universal React convention.

The layout structure is:
- `<header>` across the top
- `<AppSelector>` as a sidebar
- `<section className="content">` for all the main panels, stacked vertically with some in two-column layouts (`twoCol`)

## Concepts Taught

- **Orchestrator pattern** -- one component coordinates many child components without doing the detailed work itself
- **"use client" directive** -- opting into client-side rendering in Next.js App Router
- **useQuery (TanStack Query)** -- declarative data fetching with built-in caching, loading states, and error handling
- **useMemo** -- caching computed values to avoid unnecessary recalculations on every render
- **useEffect cascades** -- chaining multiple effects so that a change at one level automatically resets and re-selects defaults at lower levels
- **Zustand** -- lightweight global state management that avoids prop drilling
- **Guard clauses / early returns** -- handling loading, error, and empty states before the happy path
- **Derived state** -- computing `teams` and `applications` from raw API data rather than storing them separately
- **Prop naming conventions** -- `on` prefix for callbacks, descriptive names for data props

## Common Mistakes

- **Forgetting the dependency array in useEffect or useMemo.** If you leave it off, the effect runs on *every* render. If you use an empty array `[]`, it only runs once and never updates. You need to list every variable the effect reads from.
- **Putting derived state in useState.** Beginners often do `const [applications, setApplications] = useState([])` and then sync it with an effect. This creates bugs because now you have two sources of truth. Instead, use `useMemo` to derive it directly from the source data.
- **Not handling loading/error states.** If you skip the guard clauses and go straight to rendering `selectedApp.name`, the component crashes with "Cannot read property 'name' of undefined" while data is still loading.
- **Calling setters inside render (outside useEffect).** If you wrote `if (!selectedAppId) setSelectedAppId(...)` directly in the component body (not inside useEffect), React would throw an error about updating state during render. Side effects must go in useEffect.
- **Infinite loops in useEffect.** If you create a new object or array inside useEffect and set it as state, and that state is in the dependency array, you get an infinite loop. The three effects here avoid this by only calling setters conditionally.

## Mini Exercises

1. **Add a fourth useEffect** that logs a message to the console whenever the selected app changes. It should print something like `"Switched to app: My App Name"`. Where in the cascade should it go? What should be in its dependency array? (Hint: you need `selectedApp` in the dependency array, and you should check `if (!selectedApp) return` first.)

2. **Break the cascade on purpose.** Go to `lib/store.js` and remove the line `selectedEnvironmentId: null` from the `setSelectedAppId` setter. Now switch between apps in the UI. What happens? Why does the environment from the old app sometimes still appear? This exercise teaches you why the cascading reset matters.

3. **Add a "last updated" timestamp.** TanStack Query tracks when data was last fetched in `bootstrap.dataUpdatedAt`. Add a line in the header that shows `"Data fetched: {dayjs(bootstrap.dataUpdatedAt).format('HH:mm:ss')}"`. You will need to import `dayjs` at the top of the file. This teaches you how to access TanStack Query metadata.

## Further Reading

- Search: "TanStack React Query useQuery guide"
- Search: "React useMemo vs useState when to use"
- Search: "Zustand React state management tutorial"
- Search: "Next.js use client vs server components explained"
- Search: "React useEffect dependency array rules"
