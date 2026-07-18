# Guide: components/feature-flags-panel.jsx

## Purpose

This component manages feature flags for an application. Feature flags (also called feature toggles) are switches that let you turn features on or off in a running application without deploying new code. This panel lists all existing flags with their status, lets you enable/disable them, activate kill switches, and create new flags.

Feature flags are a core practice in modern deployment workflows. They let you deploy code that is "dark" (present but disabled), then gradually enable it for specific users or environments. If something goes wrong, you flip the flag off instead of rolling back an entire deployment.

## Line-by-Line Walkthrough

### Imports and setup

```js
"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "@/lib/api";
```

Compared to the log or monitoring panels, this component imports `useMutation` and `useQueryClient` instead of `useQuery`. That is because this panel does not fetch its own data -- it receives the flags as a prop from the parent. But it does need to create and update flags, which are write operations (mutations).

- **useMutation** -- TanStack Query's hook for POST, PATCH, PUT, DELETE operations. It gives you loading states, error handling, and callbacks for success/failure.
- **useQueryClient** -- gives you direct access to the query cache, so you can tell TanStack Query to refetch data after a mutation succeeds.

```js
export function FeatureFlagsPanel({ application }) {
  const queryClient = useQueryClient();
  const [newFlag, setNewFlag] = useState({
    key: "",
    type: "BOOLEAN",
    defaultValue: "false",
    description: "",
  });
```

The component receives the entire `application` object as a prop. The feature flags live at `application.featureFlags`.

`newFlag` is a state object that holds the form data for creating a new flag. It has four fields with sensible defaults: the type starts as "BOOLEAN" and the default value starts as "false". Using an object for form state (instead of four separate `useState` calls) keeps related values grouped together.

### The create mutation

```js
  const createFlag = useMutation({
    mutationFn: (payload) =>
      fetchJson("/api/feature-flags", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      setNewFlag({
        key: "",
        type: "BOOLEAN",
        defaultValue: "false",
        description: "",
      });
    },
  });
```

`mutationFn` is the function that runs when you call `createFlag.mutate(payload)`. It sends a POST request with the new flag data.

`onSuccess` runs after the server responds successfully. It does two things:

1. **`queryClient.invalidateQueries({ queryKey: ["bootstrap"] })`** -- this tells TanStack Query: "The data cached under the key 'bootstrap' is now stale. Refetch it." The parent component fetched the application data using this key, so invalidating it causes a refetch, which brings back the updated flag list. This is the standard pattern for keeping the UI in sync after a mutation.

2. **Resets the form** -- clears all the input fields back to their defaults so the user can immediately create another flag.

### The update mutation

```js
  const updateFlag = useMutation({
    mutationFn: (payload) =>
      fetchJson("/api/feature-flags", {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
    },
  });
```

Similar to `createFlag`, but sends a PATCH request. PATCH means "update some fields of an existing resource." The payload includes the flag `id` plus whichever fields are being changed (like `enabled` or `killSwitch`). On success, it invalidates the cache to refresh the list.

### Rendering the flag list

```js
  return (
    <section className="panel stack">
      <h2>Feature Flags</h2>

      <div className="stack">
        {application.featureFlags.map((flag) => (
          <article className="entityRow" key={flag.id}>
            <div className="row space">
              <strong>{flag.key}</strong>
              <span className={`badge ${flag.enabled ? "statuslive" : "statusfailed"}`}>
                {flag.enabled ? "enabled" : "disabled"}
              </span>
            </div>
```

Each flag is rendered as an article. The badge shows "enabled" (green) or "disabled" (red) based on `flag.enabled`. The CSS class `statuslive` or `statusfailed` controls the color.

```js
            <p className="muted tiny">{flag.description || "No description"}</p>
            <p className="tiny mono">default: {flag.defaultValue}</p>
```

Shows the flag's description (with a fallback of "No description") and its default value. The `mono` class uses a monospace font, which is conventional for displaying configuration values.

```js
            <p className="tiny mono">
              depends on: {flag.dependencies.length ? flag.dependencies.map((dep) => dep.dependsOnFlag.key).join(", ") : "none"}
            </p>
```

**Flag dependencies.** A flag can depend on other flags. For example, a "dark-mode-v2" flag might depend on "dark-mode" being enabled first. The `dependencies` array contains objects with a `dependsOnFlag` relationship. This line maps over those dependencies and displays the keys of the parent flags, joined by commas. If there are no dependencies, it shows "none."

Dependency management prevents contradictory states. You would not want to enable "premium-checkout" if the base "checkout" feature is disabled.

```js
            <div className="row gap">
              <button
                type="button"
                className="tinyButton"
                onClick={() =>
                  updateFlag.mutate({
                    id: flag.id,
                    enabled: !flag.enabled,
                  })
                }
              >
                {flag.enabled ? "disable" : "enable"}
              </button>
```

The enable/disable toggle. Clicking it sends a PATCH with the flag's ID and the opposite of its current `enabled` value. The button text changes based on the current state -- if the flag is enabled, the button says "disable" (the action you can take), and vice versa.

```js
              <button
                type="button"
                className="tinyButton warn"
                onClick={() =>
                  updateFlag.mutate({
                    id: flag.id,
                    killSwitch: !flag.killSwitch,
                  })
                }
              >
                kill switch: {flag.killSwitch ? "on" : "off"}
              </button>
            </div>
```

**The kill switch.** This is a separate concept from enable/disable. A kill switch is an emergency override that forces the flag off for everyone, regardless of any targeting rules or rollout percentages. Think of it as pulling the fire alarm. The button has the `warn` class (likely styled with a red or orange color) to indicate it is a destructive/emergency action.

The difference between disabling and kill-switching:
- **Disable** -- turns the flag off through the normal workflow. Can be re-enabled.
- **Kill switch** -- an emergency override. When on, the flag is forcibly off. In many systems, the kill switch takes precedence over all other rules.

### The create form

```js
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          createFlag.mutate({
            applicationId: application.id,
            ...newFlag,
          });
        }}
      >
```

`event.preventDefault()` stops the browser from doing a full page navigation (the default behavior of form submission). Instead, we call `createFlag.mutate(...)` with the form data spread in, plus the `applicationId` to associate the new flag with the current application.

```js
        <h3>Create Flag</h3>
        <input
          required
          placeholder="flag key"
          value={newFlag.key}
          onChange={(event) => setNewFlag((current) => ({ ...current, key: event.target.value }))}
        />
```

A controlled input for the flag key. The `onChange` handler uses a functional state update `(current) => ({ ...current, key: event.target.value })` to merge the new key value into the existing state object without losing the other fields. The `...current` spread copies all existing fields, then `key: event.target.value` overrides just the `key` field.

This is the standard pattern for updating a single field in a state object. Without the spread, you would lose all other fields.

```js
        <select
          value={newFlag.type}
          onChange={(event) => setNewFlag((current) => ({ ...current, type: event.target.value }))}
        >
          <option value="BOOLEAN">BOOLEAN</option>
          <option value="STRING">STRING</option>
          <option value="JSON">JSON</option>
        </select>
```

A dropdown for the flag type. Feature flags are not always simple on/off switches:

- **BOOLEAN** -- true/false. The most common type. "Is this feature on?"
- **STRING** -- a text value. Used for things like "which variant of a button color should this user see?"
- **JSON** -- a structured configuration object. Used for complex feature configurations like `{ "maxRetries": 3, "timeout": 5000 }`.

```js
        <input
          required
          placeholder="default value"
          value={newFlag.defaultValue}
          onChange={(event) => setNewFlag((current) => ({ ...current, defaultValue: event.target.value }))}
        />
        <input
          placeholder="description"
          value={newFlag.description}
          onChange={(event) => setNewFlag((current) => ({ ...current, description: event.target.value }))}
        />
        <button type="submit" disabled={createFlag.isPending}>
          {createFlag.isPending ? "Creating..." : "Create Flag"}
        </button>
      </form>
```

The default value and description inputs follow the same pattern. The submit button uses `createFlag.isPending` to disable itself while the request is in flight and change its text to "Creating...". This prevents double-submission (the user clicking "Create" twice while the first request is still pending) and gives visual feedback that something is happening.

## Concepts Taught

- **Feature flags** -- a software development technique where features are wrapped in conditional checks controlled by configuration. This decouples deployment (putting code on the server) from release (making code available to users). You can deploy a feature on Monday but not enable it until Thursday, and if it breaks, you disable it in seconds instead of rolling back a deployment.

- **Kill switches** -- an emergency mechanism to force-disable a feature instantly, bypassing all normal rules. In a crisis (the new checkout flow is losing orders), you hit the kill switch and the old behavior is restored immediately. Every flag in a production system should have a kill switch.

- **Flag dependencies** -- a way to express that flag B only makes sense when flag A is also enabled. This prevents broken feature combinations and enforces logical ordering of feature rollouts.

- **useMutation for write operations** -- TanStack Query's `useMutation` handles the lifecycle of a write operation: idle, pending, success, error. It gives you `isPending` for loading states and `onSuccess`/`onError` callbacks for follow-up actions.

- **Cache invalidation after mutations** -- after a create or update succeeds, you tell TanStack Query that cached data is stale using `queryClient.invalidateQueries(...)`. This triggers a refetch so the UI shows the latest data. This is the standard "mutate, then invalidate" pattern.

- **Functional state updates with object spread** -- `setNewFlag((current) => ({ ...current, key: value }))` is the idiomatic way to update one field in a state object without losing the other fields.

- **Controlled forms** -- every input's `value` is driven by React state, and every keystroke flows through an `onChange` handler. This gives React full control over the form data, making validation and submission straightforward.

## Common Mistakes

- **Forgetting `event.preventDefault()` on form submission.** Without it, the browser navigates away (or refreshes the page), and the mutation never completes. You will see a brief flash and wonder why nothing happened.

- **Not invalidating the cache after a mutation.** If you skip `queryClient.invalidateQueries(...)`, the mutation succeeds on the server but the UI still shows stale data. The user will not see the new flag they just created until they manually refresh the page. This is confusing and feels broken.

- **Overwriting the entire state object.** If you write `setNewFlag({ key: event.target.value })` instead of `setNewFlag((current) => ({ ...current, key: event.target.value }))`, you lose the `type`, `defaultValue`, and `description` fields. Always spread the existing state first.

- **Not disabling the submit button during pending state.** Without `disabled={createFlag.isPending}`, the user can click "Create" multiple times rapidly, sending duplicate requests. This creates duplicate flags on the server.

- **Confusing kill switch with disable.** They sound similar but have different semantics in production. Disable is a normal operational toggle. Kill switch is an emergency override. Code consuming the flags should check the kill switch first.

## Mini Exercises

1. **Add a confirmation dialog for the kill switch.** The kill switch is an emergency action that affects all users immediately. Add a `window.confirm("Are you sure? This will force-disable this flag for all users.")` check before calling `updateFlag.mutate(...)`. Only proceed if the user confirms.

2. **Add form validation for the flag key.** Flag keys often follow a naming convention like `SCREAMING_SNAKE_CASE` or `kebab-case`. Add validation that checks if the key matches a pattern (e.g., only lowercase letters, numbers, and hyphens). Show an error message if the pattern does not match. (Hint: use a regex like `/^[a-z0-9-]+$/` and a piece of state for the error message.)

3. **Show a loading state on the toggle buttons.** Right now, the enable/disable and kill switch buttons do not show any feedback while the PATCH request is in flight. Use `updateFlag.isPending` to disable the button that was clicked. (Challenge: `isPending` is true for any in-flight update, not just the one for a specific flag. How would you track which flag's mutation is pending? Hint: look at `useMutation`'s `variables` property.)

## Further Reading

- Search: "feature flags best practices Martin Fowler"
- Search: "TanStack Query useMutation invalidateQueries pattern"
- Search: "feature flag kill switch pattern"
- Search: "React controlled forms tutorial"
- Search: "optimistic UI updates TanStack Query"
