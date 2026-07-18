# Guide: deployment-timeline.jsx

## Purpose

This component displays a vertical timeline of deployments for the currently selected application. Each deployment card shows its version, commit message, status, and timestamp. More importantly, it lets users *take actions* on deployments -- create a new one, move it through status transitions (BUILDING -> DEPLOYING -> LIVE), mark it as failed, or roll it back.

This is probably the most action-heavy component in the project. It teaches you how to build a **state machine UI** (where buttons change depending on the current status), how to handle **event bubbling** when you have buttons inside buttons, and how to manage **multiple mutations** in a single component.

## Line-by-Line Walkthrough

### Lines 1-6: Imports
```jsx
"use client";

import dayjs from "dayjs";
import clsx from "clsx";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "@/lib/api";
```
Two new imports here:

- **`dayjs`** -- a lightweight date formatting library. It takes raw dates like `"2025-01-15T14:30:00Z"` and turns them into human-readable strings like `"Jan 15, 14:30"`. It is only 2KB, compared to the older `moment.js` which is 300KB. In production, bundle size matters.
- **`clsx`** -- conditional CSS class builder, same as in `app-selector.jsx`.

Note that this component does NOT import `useState`. It has no local state. All the data it needs comes from props, and all the actions it takes are mutations that update the server and invalidate the cache.

### Lines 8-10: The statusBadge Helper
```jsx
function statusBadge(status) {
  return `status${status.toLowerCase()}`;
}
```
This is a plain helper function (not a component -- notice no JSX return). It converts a status like `"BUILDING"` into a CSS class name like `"statusbuilding"`. The CSS file defines different colors for each status class.

This function lives *outside* the component. It doesn't need any React context, props, or state -- it is pure transformation logic. Keeping helpers outside the component is good practice because:
1. They don't get recreated on every render.
2. They are easier to test.
3. They communicate "this is just a utility, not React-specific."

### Lines 12-17: The Component Signature
```jsx
export function DeploymentTimeline({
  application,
  selectedEnvironmentId,
  selectedDeploymentId,
  onSelectDeployment,
}) {
```
Four props:
- `application` -- the full selected application object (with deployments, environments, pipelines).
- `selectedEnvironmentId` -- used to filter which deployments to show.
- `selectedDeploymentId` -- which deployment card is highlighted.
- `onSelectDeployment` -- callback to update the global selection when a card is clicked.

### Lines 18-22: Filtering Deployments
```jsx
  const queryClient = useQueryClient();
  const deployments =
    application?.deployments?.filter((deployment) =>
      selectedEnvironmentId ? deployment.environmentId === selectedEnvironmentId : true,
    ) || [];
```
This line does a lot:

1. `application?.deployments?.filter(...)` -- optional chaining ensures we don't crash if `application` or `deployments` is null.
2. The filter callback: if an environment is selected, only show deployments for that environment. If no environment is selected (`selectedEnvironmentId` is null/falsy), the ternary returns `true`, which means "keep everything."
3. `|| []` -- if the entire expression is null/undefined (because `application` was null), fall back to an empty array. This prevents `.map()` from crashing later.

This is a **conditional filter** pattern you will see in many real applications -- "filter by X if X is set, otherwise show all."

### Lines 24-54: Three Mutations
```jsx
  const createDeploy = useMutation({
    mutationFn: (payload) =>
      fetchJson("/api/deployments", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
    },
  });

  const transition = useMutation({
    mutationFn: ({ id, toStatus }) =>
      fetchJson(`/api/deployments/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "transition", toStatus }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
    },
  });

  const rollback = useMutation({
    mutationFn: (id) =>
      fetchJson(`/api/deployments/${id}/rollback`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
    },
  });
```
Three mutations, three different server operations:

**`createDeploy`** -- POST to `/api/deployments`. Creates a brand new deployment. The payload includes `applicationId`, `environmentId`, and optionally `pipelineId`.

**`transition`** -- PATCH to `/api/deployments/{id}`. Changes a deployment's status. Notice the destructured parameter `{ id, toStatus }` -- the caller passes an object, and the function pulls out the pieces it needs. The PATCH method signals "I'm updating an existing resource, not creating a new one."

**`rollback`** -- POST to `/api/deployments/{id}/rollback`. Creates a rollback deployment. This is a separate endpoint because rollback is a complex operation (the server needs to find the previous good version).

All three mutations have the same `onSuccess`: invalidate the bootstrap query. This is the "write, then re-fetch" pattern. After any change, we tell TanStack Query "the data is stale" and it automatically re-fetches, updating every component that depends on it.

**Why three separate mutations instead of one?** Because each represents a fundamentally different action with different parameters, different API endpoints, and different HTTP methods. Combining them into one would make the code harder to read and maintain.

### Lines 56-57: Finding Context Data
```jsx
  const environment = application?.environments?.find((item) => item.id === selectedEnvironmentId);
  const activePipeline = application?.pipelines?.[0];
```
Two quick lookups:
- `environment` -- used to show the environment name and lock status in the header.
- `activePipeline` -- the first pipeline, passed to `createDeploy` so the server knows which pipeline to run.

### Lines 59-83: The Header and New Deploy Button
```jsx
  return (
    <section className="panel stack">
      <div className="row space">
        <h2>Deployment Lifecycle</h2>
        <div className="row gap">
          <button
            type="button"
            onClick={() =>
              createDeploy.mutate({
                applicationId: application.id,
                environmentId: selectedEnvironmentId || application.environments[0]?.id,
                pipelineId: activePipeline?.id,
              })
            }
            disabled={createDeploy.isPending || !application?.environments?.length}
          >
            {createDeploy.isPending ? "Deploying..." : "New Deploy"}
          </button>
          <span className="muted">
            {environment
              ? `${environment.slug}${environment.deployLocked ? " (locked)" : ""}`
              : "all environments"}
          </span>
        </div>
      </div>
```
The "New Deploy" button:
- `environmentId: selectedEnvironmentId || application.environments[0]?.id` -- uses the selected environment, or falls back to the first one. The `||` operator picks the first truthy value.
- `disabled={createDeploy.isPending || !application?.environments?.length}` -- disabled in two cases: a deploy is already in progress, or there are no environments to deploy to.
- The label switches between "Deploying..." and "New Deploy" based on `isPending`, giving the user instant feedback.

### Lines 85-155: The Timeline Cards
```jsx
      <div className="timeline">
        {deployments.map((deployment) => (
          <button
            type="button"
            key={deployment.id}
            className={clsx("timelineItem", selectedDeploymentId === deployment.id && "timelineItemActive")}
            onClick={() => onSelectDeployment(deployment.id)}
          >
```
Each deployment is rendered as a `<button>`. The entire card is clickable -- clicking it selects that deployment (which updates the log stream, monitoring, etc.). The `clsx` call highlights the active card.

```jsx
            <div className="row space">
              <strong>{deployment.version}</strong>
              <span className={clsx("badge", statusBadge(deployment.status))}>{deployment.status}</span>
            </div>
            <p>{deployment.commitMessage}</p>
            <div className="row space tiny">
              <span>{deployment.environment.slug}</span>
              <span>{dayjs(deployment.startedAt).format("MMM D, HH:mm")}</span>
            </div>
```
The card body shows:
- **Version** (like "v1.3.7") and **status badge** (BUILDING, DEPLOYING, LIVE, FAILED).
- **Commit message** -- what changed in this deploy.
- **Environment slug** and **timestamp** formatted by dayjs. `"MMM D, HH:mm"` produces strings like "Jan 15, 14:30". `MMM` = abbreviated month, `D` = day, `HH:mm` = 24-hour time.

### Lines 102-153: Conditional Action Buttons and event.stopPropagation
```jsx
            <div className="row gap">
              {deployment.status === "BUILDING" ? (
                <button
                  type="button"
                  className="tinyButton"
                  onClick={(event) => {
                    event.stopPropagation();
                    transition.mutate({ id: deployment.id, toStatus: "DEPLOYING" });
                  }}
                >
                  mark deploying
                </button>
              ) : null}

              {deployment.status === "DEPLOYING" ? (
                <>
                  <button
                    type="button"
                    className="tinyButton"
                    onClick={(event) => {
                      event.stopPropagation();
                      transition.mutate({ id: deployment.id, toStatus: "LIVE" });
                    }}
                  >
                    mark live
                  </button>
                  <button
                    type="button"
                    className="tinyButton warn"
                    onClick={(event) => {
                      event.stopPropagation();
                      transition.mutate({ id: deployment.id, toStatus: "FAILED" });
                    }}
                  >
                    mark failed
                  </button>
                </>
              ) : null}

              {["FAILED", "LIVE"].includes(deployment.status) ? (
                <button
                  type="button"
                  className="tinyButton"
                  onClick={(event) => {
                    event.stopPropagation();
                    rollback.mutate(deployment.id);
                  }}
                >
                  rollback
                </button>
              ) : null}
            </div>
```
This is the **state machine UI** -- different buttons appear depending on the deployment's current status:

| Current Status | Available Actions |
|---|---|
| `BUILDING` | "mark deploying" |
| `DEPLOYING` | "mark live", "mark failed" |
| `LIVE` | "rollback" |
| `FAILED` | "rollback" |

This maps to a real deployment lifecycle: code is built, then deployed, then either goes live or fails. Live and failed deployments can be rolled back.

**`event.stopPropagation()` -- this is critical.** These small action buttons live *inside* the larger card button. Without `stopPropagation()`, clicking "mark live" would:
1. Fire the "mark live" click handler (good).
2. **Also** fire the card's click handler and select the deployment (bad -- or at least unwanted).

This happens because of **event bubbling** -- a core browser behavior. When you click an element, the click event fires on that element, then on its parent, then on its parent's parent, all the way up to `<html>`. `event.stopPropagation()` says "stop here, don't bubble up." This prevents the parent button's `onClick` from firing.

**The `<>...</>` syntax** (React Fragment) wraps the two DEPLOYING buttons without adding an extra DOM element. You need it because JSX expressions must return a single element, but we want two buttons side by side.

**`["FAILED", "LIVE"].includes(deployment.status)`** -- a clean way to check if a value is one of several options. It is more readable than `deployment.status === "FAILED" || deployment.status === "LIVE"`, especially as the list grows.

## Concepts Taught

- **State machine UI** -- showing different controls based on the current state of an entity, mapping to a real-world lifecycle
- **Event bubbling and stopPropagation** -- understanding how click events travel up the DOM tree and how to prevent it when you have nested interactive elements
- **Multiple mutations in one component** -- organizing several independent server operations (create, transition, rollback) as separate `useMutation` hooks
- **Conditional rendering** -- using `condition ? <JSX> : null` to show or hide elements based on state
- **Date formatting with dayjs** -- transforming raw ISO timestamps into human-readable strings
- **Conditional filtering** -- filtering an array only when a filter value is present, otherwise showing everything
- **HTTP method semantics** -- POST for creating, PATCH for updating, and separate endpoints for distinct operations

## Common Mistakes

- **Forgetting `event.stopPropagation()` on nested buttons.** The symptom: clicking "mark live" also selects the deployment card, and you see both the transition AND the selection happen. The fix is always `event.stopPropagation()` when you have clickable elements inside other clickable elements.
- **Using `event.preventDefault()` instead of `event.stopPropagation()`.** These are different things. `preventDefault` stops the browser's default action (like form submission or link navigation). `stopPropagation` stops the event from bubbling to parent elements. Here we need `stopPropagation` because the "default action" of a button click is nothing -- it is the *parent's click handler* we want to prevent.
- **Hardcoding status strings.** If you write `"building"` instead of `"BUILDING"`, the comparison fails silently. There is no error, the button just never appears. In production, you would often define these as constants: `const STATUS = { BUILDING: "BUILDING", ... }`.
- **Not handling the empty deployments case.** If `deployments` is an empty array, `.map()` simply returns nothing -- no crash, but no content either. Our code handles this implicitly, but a more polished UI might show "No deployments yet" in this case.
- **Forgetting `type="button"` on the action buttons.** Without it, if these buttons were somehow inside a form, clicking them would submit the form instead of running the onClick handler.

## Mini Exercises

1. **Add a "CANCELLED" status.** Currently, a deployment that is BUILDING can only move to DEPLOYING. Add a "cancel build" button that appears when `deployment.status === "BUILDING"`. It should call `transition.mutate({ id: deployment.id, toStatus: "CANCELLED" })`. Don't forget `event.stopPropagation()`. Where in the conditional rendering chain does this new button belong?

2. **Add a confirmation step to rollback.** Rollbacks are dangerous in production. Modify the rollback button's onClick handler to call `window.confirm("Are you sure you want to rollback?")` before executing `rollback.mutate(...)`. `window.confirm()` returns `true` if the user clicks OK and `false` if they click Cancel. Only call `rollback.mutate()` if it returns `true`. (Hint: `if (!window.confirm("...")) return;`)

3. **Show relative timestamps.** Instead of showing `"Jan 15, 14:30"`, show how long ago the deployment started, like `"3 hours ago"`. dayjs has a plugin for this called `relativeTime`. You would need to: (a) `import relativeTime from "dayjs/plugin/relativeTime"`, (b) call `dayjs.extend(relativeTime)` once at the top of the file, and (c) replace `dayjs(...).format("MMM D, HH:mm")` with `dayjs(...).fromNow()`. Try it.

## Further Reading

- Search: "JavaScript event bubbling explained"
- Search: "event.stopPropagation vs event.preventDefault"
- Search: "React conditional rendering patterns"
- Search: "dayjs format date JavaScript"
- Search: "state machine UI pattern frontend"
- Search: "HTTP methods POST vs PUT vs PATCH"
