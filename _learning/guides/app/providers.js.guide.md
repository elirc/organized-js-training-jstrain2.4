# Guide: `app/providers.js` -- The TanStack Query Provider

## Purpose

The Orbit Deploy Console needs to fetch data from API endpoints -- deployments, logs, metrics, feature flags, and more. TanStack Query (formerly called React Query) handles all of that data fetching: it manages caching, loading states, error states, background refetching, and stale data. But for any component to use TanStack Query's hooks (like `useQuery`), the entire component tree must be wrapped in a `QueryClientProvider`.

That is what this file does. It creates a single `QueryClient` instance and wraps the app in the provider.

There is a complication, though: Next.js App Router components are Server Components by default, and providers (which use React context) only work on the client. So this file needs the `"use client"` directive. The root layout imports this component and wraps `children` with it, keeping the layout itself as a Server Component while still providing client-side context to the rest of the tree.

---

## The Actual Code

```js
"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export function Providers({ children }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
```

---

## Line-by-Line Walkthrough

### Line 1: The `"use client"` directive

```js
"use client";
```

This is the first line of the file, before any imports. It is a special string literal that tells Next.js: "This file (and everything it exports) is a Client Component." Client Components run in the browser. They can use React hooks (`useState`, `useEffect`, etc.), browser APIs, and event handlers.

Why is this needed here? Because `QueryClientProvider` uses React context internally, and React context only works in Client Components. If you removed `"use client"`, Next.js would try to render this as a Server Component, and you would get an error like: "You're importing a component that needs createContext. It only works in a Client Component."

Important: `"use client"` does not mean the component is never rendered on the server. It still gets server-rendered for the initial HTML. The directive means the component will also be hydrated (made interactive) on the client, and it can use client-only features like hooks.

### Lines 3-4: Imports

```js
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
```

- **`useState`** -- A React hook that stores a value in component state. We are going to use it for something slightly unusual (more on that below).

- **`QueryClient`** -- This is the core of TanStack Query. It is the object that manages the cache, tracks all active queries, and coordinates background refetching. You create one instance and pass it to the provider.

- **`QueryClientProvider`** -- A React context provider. It makes the `QueryClient` instance available to every descendant component via React context. Any component that calls `useQuery()` internally does `useContext()` to find the nearest `QueryClientProvider` and access the client.

### Lines 6-18: The Providers component

```js
export function Providers({ children }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  // ...
}
```

This is the trickiest part of the file, and it is worth spending time on.

**Why `useState` and not just `const queryClient = new QueryClient()`?**

If you wrote `const queryClient = new QueryClient()` at the top of the function, a new `QueryClient` would be created every time the component re-renders. Each new client would have an empty cache, which means all your cached data would be thrown away and every query would restart from scratch on every render. That would be terrible for performance and user experience.

`useState` solves this. React guarantees that the initializer function (the arrow function passed to `useState`) only runs once -- during the very first render. On all subsequent renders, `useState` returns the same value that was created the first time. So our `QueryClient` is created once and reused forever.

**Why not `useRef`?**

You might have seen people suggest `useRef` for this pattern. That would also work, but `useState` is the officially recommended approach from the TanStack Query documentation for Next.js App Router setups. The key reason: `useState` guarantees the initializer runs during rendering (which is safe for server-side rendering), while `useRef` initialization can have subtle timing differences.

**The `() =>` arrow function syntax:**

```js
useState(() => new QueryClient({ ... }))
```

This is called a "lazy initializer." Instead of passing a value directly to `useState`, we pass a function that returns the value. React calls this function once. If we wrote `useState(new QueryClient({ ... }))` without the arrow function, `new QueryClient()` would be called on every render (JavaScript evaluates function arguments before calling the function), and then `useState` would just ignore the result on re-renders. The lazy initializer avoids creating throwaway objects.

**The configuration options:**

```js
defaultOptions: {
  queries: {
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  },
},
```

- **`staleTime: 10_000`** -- This is 10,000 milliseconds (10 seconds). The `10_000` syntax uses JavaScript's numeric separator (`_`) for readability -- it is identical to writing `10000`. After fetching data, TanStack Query considers it "fresh" for 10 seconds. During that time, if a component mounts that uses the same query, TanStack Query will serve the cached data immediately without making a new network request. After 10 seconds, the data is "stale," and TanStack Query may refetch it in the background next time it is needed. This prevents the dashboard from hammering the API with requests every time you switch between tabs or components.

- **`refetchOnWindowFocus: false`** -- By default, TanStack Query refetches all stale queries whenever the user switches back to the browser tab. For an internal developer console, this behavior is unnecessary and can cause confusing UI flickers. Turning it off means data only refreshes when you explicitly trigger it (by navigating, by a mutation invalidating the cache, or by the stale time expiring and the query being re-used).

### Line 19: The return

```js
return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
```

The `QueryClientProvider` wraps whatever `children` are passed in. Because this component is used inside `layout.js` like `<Providers>{children}</Providers>`, the `children` here is the entire page tree. Every page and every component in the app has access to the query client.

---

## Concepts Taught

| Concept | Where It Appears |
|---|---|
| `"use client"` directive | Line 1 |
| React Context / Providers pattern | `QueryClientProvider` wrapping `children` |
| `useState` with a lazy initializer | `useState(() => new QueryClient(...))` |
| TanStack Query setup | `QueryClient`, `QueryClientProvider` |
| Stale time and caching strategy | `staleTime: 10_000` |
| Numeric separators in JavaScript | `10_000` |
| The provider/consumer pattern in React | The entire file |

---

## Common Mistakes

### 1. Creating the QueryClient outside the component

```js
// Do NOT do this in a Next.js App Router project:
const queryClient = new QueryClient();

export function Providers({ children }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
```

This creates a single `QueryClient` at the module level, which is shared across all requests on the server. In a server-rendered environment, different users' data could bleed into each other's caches. Always create the client inside the component using `useState`.

### 2. Forgetting `"use client"`

If you remove the `"use client"` directive, you will get an error because `useState` is a client-side hook and `QueryClientProvider` uses React context. Both require a Client Component.

### 3. Setting `staleTime` too low or too high

- **Too low (e.g., 0):** Every time a component mounts, TanStack Query will refetch, even if the data was just fetched a moment ago. This causes unnecessary network traffic and can make the UI feel jumpy.
- **Too high (e.g., 60_000 or more):** Users will see stale data for a long time. In a deployment console, this could mean a deployment that finished 30 seconds ago still shows as "BUILDING."
- **10,000ms (10 seconds)** is a reasonable middle ground for a dashboard that updates frequently but does not need real-time data.

### 4. Not understanding the `children` pattern

The `Providers` component does not render any visible UI itself. It only provides context. If you forget to render `{children}`, nothing will appear on screen:

```js
// Bug: children are not rendered
return <QueryClientProvider client={queryClient} />;
```

Always pass `{children}` through.

### 5. Adding multiple providers in the wrong order

If you later add more providers (like a theme provider or auth provider), the order matters. Providers that are closer to the root (outer) can be consumed by providers that are deeper (inner). For example, if your auth provider needs to make queries, it should be inside the `QueryClientProvider`, not outside it.

---

## Mini Exercises

### Exercise 1: Change the stale time and observe the effect

Temporarily change `staleTime` to `0` (zero):

```js
staleTime: 0,
```

Open the browser's Network tab, navigate around the app, and watch how many API requests are made. Then change it to `60_000` (60 seconds) and do the same. Notice the tradeoff: fewer requests with a higher stale time, but more stale data.

Return it to `10_000` when you are done.

### Exercise 2: Add a second provider

Suppose you want to add a `ThemeProvider` for dark/light mode. Modify the `Providers` component to nest multiple providers:

```js
return (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      {children}
    </ThemeProvider>
  </QueryClientProvider>
);
```

Ask yourself: Why is `ThemeProvider` inside `QueryClientProvider` and not the other way around? (Answer: It depends on dependencies. If `ThemeProvider` does not need query data, the order does not technically matter. But if it did need to make API calls for theme preferences, it would need to be inside `QueryClientProvider` to access the query client.)

### Exercise 3: Trace what `children` is

In `layout.js`, the code reads:

```js
<Providers>{children}</Providers>
```

And in `providers.js`, `children` is passed through to `QueryClientProvider`. When you visit the homepage:

1. What is `children` inside `RootLayout`? (Answer: the `<Home />` component from `app/page.js`.)
2. What is `children` inside `Providers`? (Answer: the same `<Home />` component -- it was passed through from the layout.)
3. What is `children` inside `QueryClientProvider`? (Answer: still the same `<Home />` component.)

The `children` prop flows from the layout, through the provider, and into the context provider. Each wrapper adds functionality (context, in this case) without changing what gets rendered.

---

## Further Reading

- [TanStack Query: Quick Start](https://tanstack.com/query/latest/docs/framework/react/quick-start) -- Setting up QueryClient and QueryClientProvider.
- [TanStack Query: Important Defaults](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults) -- What staleTime, refetchOnWindowFocus, and other defaults do.
- [Next.js: Client Components](https://nextjs.org/docs/app/building-your-application/rendering/client-components) -- When and why to use `"use client"`.
- [React: useState with initializer function](https://react.dev/reference/react/useState#avoiding-recreating-the-initial-state) -- Official docs on the lazy initializer pattern.
- [React: Context](https://react.dev/learn/passing-data-deeply-with-context) -- How the provider/consumer pattern works under the hood.
