# Guide: `app/page.js` -- The Homepage

## Purpose

This is the shortest file in the entire Orbit Deploy Console, and that is by design. The homepage's only job is to render the `PlatformDashboard` component. It acts as a thin routing layer: Next.js sees `app/page.js` and knows "this is the component to render when the user visits `/`." All the actual UI logic lives somewhere else.

This pattern -- pages that do almost nothing except delegate to a component -- is extremely common in professional Next.js codebases. It keeps routing concerns separate from UI concerns.

---

## The Actual Code

```js
import { PlatformDashboard } from "@/components/platform-dashboard";

export default function Home() {
  return <PlatformDashboard />;
}
```

That is it. Five lines (including the blank line). Let us make sure you understand every piece.

---

## Line-by-Line Walkthrough

### Line 1: The import

```js
import { PlatformDashboard } from "@/components/platform-dashboard";
```

This imports the `PlatformDashboard` component from the `components/` directory at the project root. Let us break down the syntax:

- **`{ PlatformDashboard }`** -- The curly braces mean this is a named import. The `platform-dashboard` module exports a function called `PlatformDashboard` using `export function PlatformDashboard` (not `export default`). If it were a default export, you would write `import PlatformDashboard from ...` without the braces.

- **`@/components/platform-dashboard`** -- The `@/` prefix is a path alias defined in `jsconfig.json`. It resolves to the project root. So this is equivalent to writing something like `"../../components/platform-dashboard"` (the exact relative path depends on where the file is), but it is cleaner and does not break when you move files around. This alias is configured in the project's `jsconfig.json` with `"paths": { "@/*": ["./*"] }`.

### Lines 3-5: The component

```js
export default function Home() {
  return <PlatformDashboard />;
}
```

- **`export default`** -- Next.js requires that page files export their component as the default export. This is how the framework knows which component to render for this route. If you used a named export instead, Next.js would not find your page component.

- **`function Home()`** -- The function name `Home` is for your benefit as a developer. It shows up in React DevTools and error stack traces, making debugging easier. But Next.js does not care what you name it; only the `export default` matters.

- **`return <PlatformDashboard />`** -- The JSX renders the dashboard component. No props are passed, no layout is added, no data is fetched. The page is purely a pass-through.

### What is NOT in this file

Notice what this file does not do:

- **No `"use client"` directive.** That means this page is a React Server Component. It runs on the server, not in the browser. Server Components can import and render Client Components (like `PlatformDashboard`, which uses hooks and interactivity), but the page itself stays on the server. This is optimal because the page has no client-side logic of its own.

- **No `metadata` export.** The homepage could export its own `metadata` to override the title set in `layout.js`, but it does not need to. The root layout already sets `title: "Orbit Deploy Console"`, and that is fine for the homepage. If you added a `/settings` page, you might want to export `metadata` there to change the title to something like "Settings - Orbit Deploy Console."

- **No data fetching.** You could write `async function Home()` and `await` some data here (Server Components support top-level `await`), but this project fetches all its data inside the `PlatformDashboard` component using TanStack Query. That is a design choice -- data fetching happens at the component level, not the route level.

---

## Concepts Taught

| Concept | Where It Appears |
|---|---|
| Next.js App Router page convention | `app/page.js` maps to the `/` route |
| Named imports vs. default exports | `{ PlatformDashboard }` (named import), `export default function Home` (default export) |
| Path aliases | `@/components/platform-dashboard` |
| Thin page / delegation pattern | The entire file |
| Server Components (implicit) | No `"use client"` means this is a Server Component |

---

## Common Mistakes

### 1. Putting UI logic directly in the page file

You could technically write all of your dashboard JSX right here in `page.js`. But that makes the code harder to test, harder to reuse, and harder to reason about. By keeping pages thin, you can move `PlatformDashboard` to a different route later without rewriting any UI code. The page is a routing concern; the component is a UI concern.

### 2. Using a named export instead of a default export

```js
// This will NOT work as a page:
export function Home() {
  return <PlatformDashboard />;
}
```

Next.js specifically looks for `export default`. If you only have a named export, the route will render a blank page (or throw an error depending on the Next.js version). Always use `export default` for page components.

### 3. Adding `"use client"` when it is not needed

If you add `"use client"` to this file, it will still work, but you are turning the page into a Client Component unnecessarily. That means the browser has to download and execute this file's JavaScript, which is wasted effort since all it does is render another component. Let the component that actually needs client-side behavior (`PlatformDashboard`) handle its own `"use client"` declaration.

### 4. Confusing the file name with the function name

The route is determined by the file path (`app/page.js` = `/`), not by the function name (`Home`). You could name the function `Banana` and the route would still be `/`. The function name is just for developer convenience.

---

## Mini Exercises

### Exercise 1: Add a second page

Create a new file at `app/settings/page.js` that renders a placeholder component. You will need:

1. A new file at `app/settings/page.js`.
2. A default export function (call it anything you like).
3. For now, just return `<p>Settings coming soon</p>`.

Ask yourself: what URL will this page be available at? (Answer: `/settings`, because Next.js maps the folder structure to routes.)

### Exercise 2: Add page-level metadata

Override the root layout's title for the homepage by adding a `metadata` export to `page.js`:

```js
export const metadata = {
  title: "Dashboard - Orbit Deploy Console",
};
```

After adding this, the browser tab for the homepage should say "Dashboard - Orbit Deploy Console" instead of just "Orbit Deploy Console." The root layout's metadata is used as the default, but page-level metadata takes priority.

### Exercise 3: Trace what happens on first load

Walk through the rendering sequence when a user types `http://localhost:3000` into their browser:

1. Next.js receives the request for `/`.
2. It finds `app/page.js` as the matching route.
3. It renders `RootLayout` (from `app/layout.js`) and passes the `Home` component as `children`.
4. Inside `Home`, `<PlatformDashboard />` is returned.
5. `PlatformDashboard` is a Client Component (it has `"use client"`), so Next.js server-renders it, sends the HTML to the browser, then hydrates it on the client.
6. After hydration, TanStack Query hooks inside `PlatformDashboard` fire off API requests to fetch data.

Question: At which step does the user first see something on screen? (Answer: after step 5, when the server-rendered HTML arrives. The data from step 6 fills in afterward.)

---

## Further Reading

- [Next.js App Router: Pages](https://nextjs.org/docs/app/building-your-application/routing/pages) -- How `page.js` files define routes.
- [Next.js Server Components vs Client Components](https://nextjs.org/docs/app/building-your-application/rendering/server-components) -- Understanding when and why to use `"use client"`.
- [MDN: JavaScript Modules - import](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import) -- Named imports, default imports, and the difference between them.
- [Next.js: Project Organization](https://nextjs.org/docs/app/building-your-application/routing/colocation) -- Strategies for organizing components, pages, and utilities in App Router projects.
