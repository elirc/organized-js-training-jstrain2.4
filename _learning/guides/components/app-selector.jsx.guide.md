# Guide: app-selector.jsx

## Purpose

This is the sidebar component that lets users browse and select applications, switch between environments, and create new applications. It is the main navigation control for the entire dashboard. When a user clicks an app or environment here, the whole page updates to show that selection's data.

This component teaches several important real-world patterns: **controlled form components**, **useMutation for writing data**, **cache invalidation** (telling TanStack Query to re-fetch after a change), and **conditional CSS classes** with clsx.

## Line-by-Line Walkthrough

### Lines 1-6: Imports
```jsx
"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "@/lib/api";
import clsx from "clsx";
```
Let's understand each import:

- `useMemo` -- caches a computed value so it only recalculates when its dependencies change.
- `useState` -- holds local component state (the form data for creating a new app).
- `useMutation` -- the TanStack Query hook for *writing* data (POST, PATCH, DELETE). This is the counterpart to `useQuery` which *reads* data.
- `useQueryClient` -- gives us access to the query cache so we can tell it "hey, the data changed, go re-fetch."
- `fetchJson` -- our project's wrapper around the browser's `fetch` API (defined in `lib/api.js`).
- `clsx` -- a tiny utility for building CSS class strings conditionally. Instead of writing messy string concatenation, you write `clsx("base", condition && "extra")`.

### Lines 8-14: The Component Signature (Props)
```jsx
export function AppSelector({
  teams,
  selectedAppId,
  selectedEnvironmentId,
  onSelectApp,
  onSelectEnvironment,
}) {
```
This component receives five props from its parent (`PlatformDashboard`):

- `teams` -- the array of teams, each containing an array of applications.
- `selectedAppId` -- which app is currently highlighted (comes from Zustand store).
- `selectedEnvironmentId` -- which environment chip is highlighted.
- `onSelectApp` -- a callback function to call when the user clicks an app. This is actually `setSelectedAppId` from the Zustand store, but the child doesn't need to know that.
- `onSelectEnvironment` -- same pattern for environments.

Notice the naming: `on` + action. This is a React convention for callback props. The parent decides *what happens* when an app is selected; this component just decides *when* to call the callback.

### Lines 15-21: Setting Up the Query Client and Form State
```jsx
  const queryClient = useQueryClient();
  const [newApp, setNewApp] = useState({
    name: "",
    repoUrl: "",
    buildCommand: "npm run build",
    startCommand: "npm run start",
  });
```
`useQueryClient()` gives us a reference to TanStack Query's cache manager. We will need it later to invalidate (refresh) cached data after creating a new app.

`useState` initializes the form state as an object with four fields. Notice that `buildCommand` and `startCommand` have default values -- this is a good UX pattern. Most apps use these exact commands, so pre-filling them saves the user time. The user can still change them, but the defaults handle the common case.

**This is a "controlled component" pattern.** The form inputs' values are controlled by React state. Every keystroke updates the state, and the state drives what's displayed. The alternative (uncontrolled components) lets the browser manage form state, but controlled components give you more control -- you can validate on every keystroke, transform input, or reset the form programmatically.

### Lines 23-33: Flattening Teams into Applications
```jsx
  const applications = useMemo(
    () =>
      teams.flatMap((team) =>
        team.applications.map((application) => ({
          ...application,
          teamId: team.id,
          teamName: team.name,
        })),
      ),
    [teams],
  );
```
The API gives us data organized by teams: `[{ name: "Backend", applications: [...] }, { name: "Frontend", applications: [...] }]`. But the sidebar shows a flat list of all applications. So we flatten it.

`flatMap` is doing two things at once here:
1. For each team, it maps over that team's applications.
2. For each application, it creates a new object that includes the original application data (`...application` spread operator) plus the `teamId` and `teamName` from the parent team.
3. `flatMap` then flattens the nested arrays into a single array.

This is called **denormalization** -- we are duplicating the team name onto each application for convenience, so we don't have to look it up later.

The `[teams]` dependency means this only recalculates when the `teams` array changes.

### Line 35: Finding the Selected App
```jsx
  const selectedApp = applications.find((application) => application.id === selectedAppId);
```
We need the full application object to render its environments below. `find` returns the first match or `undefined`.

### Lines 37-52: The Create App Mutation
```jsx
  const createApp = useMutation({
    mutationFn: (payload) =>
      fetchJson("/api/applications", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      setNewApp({
        name: "",
        repoUrl: "",
        buildCommand: "npm run build",
        startCommand: "npm run start",
      });
    },
  });
```
This is one of the most important patterns in the whole project, so let's go through it carefully.

**`useMutation`** is TanStack Query's tool for operations that *change* data on the server (as opposed to `useQuery` which *reads* data). It returns an object with:
- `createApp.mutate(payload)` -- call this to trigger the mutation.
- `createApp.isPending` -- `true` while the request is in flight.
- `createApp.isError` -- `true` if the request failed.

**`mutationFn`** is the function that actually makes the API call. It receives whatever you pass to `createApp.mutate(...)`. Here it:
1. Takes a `payload` object.
2. Sends it as a POST request to `/api/applications`.
3. `JSON.stringify(payload)` converts the JavaScript object into a JSON string for the HTTP body.

**`onSuccess`** runs after the server responds with success. It does two critical things:

1. **Cache invalidation:** `queryClient.invalidateQueries({ queryKey: ["bootstrap"] })` tells TanStack Query "the bootstrap data is now stale." TanStack will immediately re-fetch the bootstrap data, which contains all applications. When the new data arrives, every component using that data automatically re-renders with the new app included. This is the magic of TanStack Query -- you don't have to manually update the app list.

2. **Form reset:** It resets `newApp` back to the default values, clearing the form. This is a good UX pattern -- after successfully creating something, clear the form so the user isn't confused about whether it worked.

### Lines 54-73: Rendering the App List
```jsx
  return (
    <aside className="panel stack">
      <div className="row space">
        <h2>Applications</h2>
        <span className="muted">{applications.length} total</span>
      </div>

      <div className="stack">
        {applications.map((application) => (
          <button
            type="button"
            key={application.id}
            className={clsx("appButton", selectedAppId === application.id && "appButtonActive")}
            onClick={() => onSelectApp(application.id)}
          >
            <span>{application.name}</span>
            <span className="muted">{application.teamName}</span>
          </button>
        ))}
      </div>
```
Let's break down the key patterns:

**`applications.map(...)`** -- this is how you render a list in React. For each application, we produce a `<button>` element. React requires a unique `key` prop on each item so it can efficiently track which items changed, were added, or were removed.

**`type="button"`** -- by default, `<button>` elements inside a `<form>` have `type="submit"`, which submits the form when clicked. Setting `type="button"` prevents this. Since our buttons are for navigation (selecting an app), not form submission, we need this.

**`clsx("appButton", selectedAppId === application.id && "appButtonActive")`** -- this is where `clsx` shines. It produces the CSS class string:
- If the app is NOT selected: `"appButton"` (just the base class)
- If the app IS selected: `"appButton appButtonActive"` (base class plus the highlight class)

The `&&` operator works because in JavaScript, `true && "something"` returns `"something"`, and `false && "something"` returns `false`. `clsx` ignores `false` values. This is much cleaner than string concatenation: `"appButton" + (isSelected ? " appButtonActive" : "")`.

**`onClick={() => onSelectApp(application.id)}`** -- when clicked, it calls the parent's callback with this app's ID. This updates the Zustand store, which triggers re-renders across the entire dashboard.

### Lines 75-96: Environment Chips
```jsx
      {selectedApp ? (
        <div className="stack">
          <h3>Environments</h3>
          <div className="chips">
            {selectedApp.environments.map((environment) => (
              <button
                type="button"
                key={environment.id}
                className={clsx(
                  "chip",
                  selectedEnvironmentId === environment.id && "chipActive",
                  environment.deployLocked && "chipWarn",
                )}
                onClick={() => onSelectEnvironment(environment.id)}
              >
                {environment.slug}
                {environment.deployLocked ? " (locked)" : ""}
              </button>
            ))}
          </div>
        </div>
      ) : null}
```
This section only renders when an app is selected (`selectedApp ?`). This is **conditional rendering** -- a fundamental React pattern.

The `clsx` call here uses three arguments:
1. `"chip"` -- always applied (base style).
2. `selectedEnvironmentId === environment.id && "chipActive"` -- highlighted when selected.
3. `environment.deployLocked && "chipWarn"` -- a warning style when deploys are locked.

This means a chip can have multiple states simultaneously: it could be both active AND locked, getting both `chipActive` and `chipWarn` classes. `clsx` handles combining them cleanly.

The `{environment.deployLocked ? " (locked)" : ""}` adds a text indicator next to locked environments. The ternary operator (`condition ? valueIfTrue : valueIfFalse`) is the inline way to do if/else in JSX.

### Lines 98-125: The Create App Form
```jsx
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          if (!applications.length) return;
          createApp.mutate({
            teamId: applications[0].teamId,
            ...newApp,
          });
        }}
      >
        <h3>Create App</h3>
        <input
          placeholder="app name"
          value={newApp.name}
          onChange={(event) => setNewApp((current) => ({ ...current, name: event.target.value }))}
          required
        />
        <input
          placeholder="repo url"
          value={newApp.repoUrl}
          onChange={(event) => setNewApp((current) => ({ ...current, repoUrl: event.target.value }))}
          required
        />
        <button type="submit" disabled={createApp.isPending}>
          {createApp.isPending ? "Creating..." : "Create Application"}
        </button>
      </form>
```
This is a **controlled form**. Let's understand every piece:

**`event.preventDefault()`** -- without this, the browser would do a full page reload when the form submits (the default HTML behavior). We prevent that because we want to handle submission with JavaScript.

**`createApp.mutate({ teamId: applications[0].teamId, ...newApp })`** -- triggers the mutation. It merges the `teamId` (from the first available team) with the form data. The `...newApp` spread includes `name`, `repoUrl`, `buildCommand`, and `startCommand`.

**The input's `onChange` handler:**
```jsx
onChange={(event) => setNewApp((current) => ({ ...current, name: event.target.value }))}
```
This is the **functional updater pattern** for useState. Instead of passing the new value directly, you pass a function that receives the current state and returns the new state. `{ ...current, name: event.target.value }` creates a new object with all existing fields, but overwrites just the `name`. This is important because `useState` does not merge objects like the old class-based `setState` did -- you must spread the old state yourself.

**`disabled={createApp.isPending}`** -- disables the submit button while the request is in flight. This prevents double-submission. The text also changes to "Creating..." to give the user feedback.

**`required`** on the inputs -- this is native HTML form validation. The browser will prevent submission and show an error tooltip if these fields are empty. Free validation with zero JavaScript.

## Concepts Taught

- **Controlled components** -- form inputs whose values are driven by React state, giving you full control over the form
- **useMutation** -- TanStack Query's hook for creating, updating, or deleting data on the server
- **Cache invalidation** -- telling TanStack Query to re-fetch data after a mutation changes it on the server
- **clsx for conditional classes** -- cleanly building CSS class strings based on component state
- **flatMap for denormalization** -- transforming a nested data structure into a flat list enriched with parent data
- **The functional updater pattern** -- using `setState(current => ...)` when the new state depends on the old state
- **Callback props** -- passing functions from parent to child so children can communicate events upward

## Common Mistakes

- **Forgetting `event.preventDefault()` in form submissions.** The page reloads, your state is lost, and your mutation never fires. This is one of the most common bugs for beginners.
- **Mutating state directly.** Writing `newApp.name = event.target.value` instead of creating a new object. React only re-renders when state *reference* changes. Mutating the existing object means React sees the same reference and skips the re-render.
- **Forgetting to invalidate queries after a mutation.** If you skip `queryClient.invalidateQueries(...)`, the new app exists in the database but the UI still shows the old list. The user has to manually refresh the page.
- **Using `key={index}` instead of `key={application.id}`.** Array indices break when items are reordered, added, or removed. Always use a stable, unique identifier.
- **Not disabling the submit button during pending state.** Without `disabled={createApp.isPending}`, a user on a slow connection might click "Create" five times and create five duplicate apps.

## Mini Exercises

1. **Add a team name column.** Right now each app button shows `application.name` and `application.teamName`. Modify the button so it also shows `application.repoUrl` in a small muted span below the team name. Where would you add it inside the `<button>` JSX? What className would you use to make it small?

2. **Add a "clear form" button.** Add a `<button type="button">` next to the submit button that resets the `newApp` state back to its defaults when clicked. Why does it need `type="button"` instead of `type="submit"`? What happens if you accidentally use `type="submit"`?

3. **Show an error message when createApp fails.** `useMutation` provides `createApp.isError` and `createApp.error`. Add a conditional `<p>` element below the form that shows the error message in red when `createApp.isError` is `true`. The error message is at `createApp.error.message`. (Hint: use the same conditional rendering pattern as the environment chips section: `{createApp.isError ? <p>...</p> : null}`.)

## Further Reading

- Search: "React controlled vs uncontrolled components"
- Search: "TanStack React Query useMutation tutorial"
- Search: "TanStack Query cache invalidation guide"
- Search: "clsx npm conditional classnames"
- Search: "JavaScript flatMap array method"
- Search: "React functional state updates useState"
