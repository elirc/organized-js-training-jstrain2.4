# Guide: lib/api.js

## Purpose

This is a thin HTTP client helper that wraps the browser's built-in `fetch()` API. It adds two things: automatic JSON headers and standardized error handling. Every component in the app uses this function to talk to the API, ensuring consistent behavior across all requests.

## Line-by-Line Walkthrough

```js
export async function fetchJson(url, options) {
```
An async function that takes a URL and optional fetch options (method, body, headers, etc.).

```js
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
```
Calls the native `fetch()` with:
- All original options spread in (`...options`) — this preserves `method`, `body`, etc.
- `Content-Type: application/json` header — tells the server we're sending JSON
- Any additional headers from `options` spread on top

**The order matters:** `"Content-Type": "application/json"` is set first, then `options?.headers` is spread after. If the caller provides their own `Content-Type`, it overrides the default.

`options?.headers ?? {}` — uses optional chaining (`?.`) in case `options` is undefined, and nullish coalescing (`??`) to default to an empty object.

```js
  if (!response.ok) {
    let message = "Request failed";
    try {
      const errorPayload = await response.json();
      message = errorPayload.error || message;
    } catch {
      // Keep generic error message.
    }
    throw new Error(message);
  }
```
**Error handling:**
1. `response.ok` is `true` for status codes 200-299, `false` otherwise
2. If the request failed, try to parse the error message from the response body (our API routes return `{ error: "..." }`)
3. If parsing fails (maybe the response isn't JSON), use a generic message
4. Throw an error — TanStack Query catches this and puts it in `query.error`

The `try/catch` around `response.json()` is defensive — the server might return non-JSON error pages (like a 502 from a proxy).

```js
  return response.json();
}
```
If the response is OK, parse and return the JSON body. This is the happy path.

## Concepts Taught
- **HTTP client wrapper** — centralizing fetch configuration
- **The fetch API** — the browser's built-in way to make HTTP requests
- **Error normalization** — converting various error formats into a consistent Error object
- **Content-Type header** — tells the server how to parse the request body
- **Defensive programming** — the try/catch handles unexpected response formats
- **Spread operator for options merging** — combining defaults with overrides

**Extra example:** A simpler fetch wrapper without error parsing:
```js
async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
```

## Common Mistakes
- Not setting `Content-Type` for POST/PATCH requests — the server won't know how to parse the body and might return 400
- Forgetting to `JSON.stringify` the body — `fetch` doesn't automatically serialize objects. You must do `body: JSON.stringify(data)`. This wrapper doesn't do that for you (the callers do it).
- Swallowing errors silently — without the `throw`, the component would never know the request failed. TanStack Query needs the thrown error to update its state.

## Mini Exercises
1. Add a `timeout` feature: if the request takes longer than 10 seconds, throw a "Request timed out" error. (Hint: look up `AbortController`.)
2. The empty `catch` block on line 15 silently ignores parse errors. Is this a good practice? What would you log here in a production app?
3. How would you add an `Authorization: Bearer <token>` header to every request made through this function?

## Further Reading
- Search: "fetch API MDN documentation"
- Search: "javascript error handling best practices"
- Search: "AbortController fetch timeout"
