# Guide: components/log-stream-panel.jsx

## Purpose

This is the real-time log viewer for a deployment. It fetches historical logs, then opens a persistent server-sent events (SSE) connection so new log lines appear instantly as the server emits them. Because a deployment can produce thousands of log lines per second, the component uses virtualization -- a technique where only the rows you can actually see on screen are rendered as real DOM elements. The rest are "virtual." Without this, the browser would choke trying to render 10,000+ DOM nodes at once.

This is the most technically dense component in the project. It ties together refs, multiple pieces of state, data fetching, real-time streaming, memoized filtering, and virtualized rendering -- all inside a single component. If you can understand every line here, you can understand almost any React component in a production codebase.

## Line-by-Line Walkthrough

### Imports

```js
"use client";
```
This is a Next.js directive that marks the file as a client component. It runs in the browser, not on the server. We need this because we use hooks like `useState` and browser APIs like `EventSource`.

```js
import { useEffect, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/api";
```

A lot of imports here. Let's break them down:

- **useEffect** -- run side effects (like opening an SSE connection) after the component renders.
- **useMemo** -- cache the result of an expensive computation so it only re-runs when its dependencies change.
- **useRef** -- create a mutable reference that persists across renders. We use it to hold a pointer to the scroll container DOM element.
- **useState** -- store values that, when changed, cause the component to re-render.
- **dayjs** -- a tiny date formatting library. Much smaller than Moment.js.
- **useVirtualizer** -- the hook from `@tanstack/react-virtual` that handles only rendering visible rows.
- **useQuery** -- TanStack Query's hook for fetching and caching data.
- **fetchJson** -- our project's custom wrapper around the browser `fetch()` API (see the `lib/api.js` guide).

### State and refs

```js
export function LogStreamPanel({ deploymentId }) {
  const parentRef = useRef(null);
```
The component receives `deploymentId` as a prop -- this tells it which deployment's logs to show.

`parentRef` is a ref that will be attached to the scrollable `<div>` in the JSX. The virtualizer needs a reference to this element so it can measure how tall it is and figure out which rows are currently visible. Refs are like sticky notes you attach to a DOM element -- you can always read `parentRef.current` to get the actual element.

```js
  const [tailEnabled, setTailEnabled] = useState(true);
  const [severityFilter, setSeverityFilter] = useState("");
  const [keywordFilter, setKeywordFilter] = useState("");
  const [streamedLogs, setStreamedLogs] = useState([]);
```

Four pieces of state:

- **tailEnabled** -- whether the live SSE stream is active. When the user unchecks the "live tail" checkbox, we stop receiving new logs.
- **severityFilter** -- the currently selected severity level (empty string means "all"). Options are DEBUG, INFO, WARN, ERROR.
- **keywordFilter** -- free-text search inside log messages.
- **streamedLogs** -- the full array of log objects currently held in memory. This starts empty and gets populated by both the initial fetch and the live stream.

### Initial data fetch

```js
  const logsQuery = useQuery({
    queryKey: ["deployment-logs", deploymentId],
    queryFn: () => fetchJson(`/api/deployments/${deploymentId}/logs?take=4000`),
    enabled: Boolean(deploymentId),
  });
```

This fetches the most recent 4,000 log lines for the deployment. The `queryKey` includes `deploymentId` so TanStack Query caches results per deployment -- if you switch between deployments and switch back, it can show cached data immediately. The `enabled: Boolean(deploymentId)` prevents the query from firing when there is no deployment selected (if `deploymentId` is null or undefined, `Boolean(...)` returns false and the query stays dormant).

### Syncing fetched data into local state

```js
  useEffect(() => {
    setStreamedLogs(logsQuery.data || []);
  }, [logsQuery.data]);
```

Why not just use `logsQuery.data` directly? Because the SSE stream will keep adding new log entries. We need a local `streamedLogs` array that starts with the fetched data and then grows as new entries arrive from the stream. This `useEffect` runs whenever `logsQuery.data` changes (i.e., when the initial fetch completes) and copies the data into our local state. The `|| []` fallback handles the case where data is `undefined` (before the fetch resolves).

### SSE live streaming

```js
  useEffect(() => {
    if (!deploymentId || !tailEnabled) {
      return () => {};
    }
```

This effect opens the live connection. It has two guard conditions: if there is no deployment selected, or the user has turned off live tailing, we bail out. We still return an empty cleanup function `() => {}` because useEffect cleanup functions should always be functions (returning `undefined` is also fine, but returning something that is not a function will cause React to complain).

```js
    const source = new EventSource(`/api/deployments/${deploymentId}/logs/stream`);
```

**EventSource** is a browser-native API for Server-Sent Events (SSE). You give it a URL, and it opens a persistent HTTP connection. The server can push messages down that connection at any time. Unlike WebSockets, SSE is one-directional (server to client only), uses plain HTTP, and automatically reconnects if the connection drops. This makes it perfect for log streaming -- the server sends log lines, and we just listen.

Think of it like a radio. You tune into a station (the URL), and the station broadcasts to you. You do not talk back.

```js
    const onLog = (event) => {
      const payload = JSON.parse(event.data);
      setStreamedLogs((current) => [...current, payload].slice(-10000));
    };
```

The `onLog` handler runs every time the server sends a message with the event type "log". It parses the JSON data from the event, then uses a **functional state updater** (the `(current) => ...` form of `setStreamedLogs`) to append the new log entry to the array. The `.slice(-10000)` keeps only the last 10,000 entries in memory. Without this cap, a chatty deployment would eventually eat all the browser's memory.

Why use the functional updater `(current) => ...` instead of `setStreamedLogs([...streamedLogs, payload])`? Because this callback closes over `streamedLogs` from the render when the effect was created. If new logs arrive quickly (many times per render cycle), each call would be using the same stale `streamedLogs` reference and you would lose entries. The functional form always receives the most current state value.

```js
    source.addEventListener("log", onLog);
```

This subscribes to specifically the "log" event type on the SSE stream. The server defines the event type in its response. You could have other event types like "heartbeat" or "error" on the same connection.

```js
    return () => {
      source.removeEventListener("log", onLog);
      source.close();
    };
  }, [deploymentId, tailEnabled]);
```

**The cleanup function.** This is critical. When the component unmounts (the user navigates away) or when `deploymentId` or `tailEnabled` changes, React calls this cleanup function before running the effect again. It removes the event listener and closes the SSE connection. If you forget this, you leak connections -- the browser keeps receiving data in the background and burning CPU and memory, even though the component is gone. In a production app, leaked EventSource connections are a common and nasty bug.

The dependency array `[deploymentId, tailEnabled]` tells React: "Re-run this effect whenever either of these values changes." If the user toggles live tail off, the old connection closes. If they toggle it back on, a new connection opens.

### Filtering with useMemo

```js
  const filteredLogs = useMemo(() => {
    return streamedLogs.filter((entry) => {
      const matchesSeverity = severityFilter ? entry.severity === severityFilter : true;
      const matchesKeyword = keywordFilter
        ? entry.message.toLowerCase().includes(keywordFilter.toLowerCase())
        : true;
      return matchesSeverity && matchesKeyword;
    });
  }, [streamedLogs, severityFilter, keywordFilter]);
```

`useMemo` caches the filtered array. Filtering 10,000 entries is not free. Without `useMemo`, this filter would run on every single render -- including renders triggered by unrelated state changes (like hovering over a button). With `useMemo`, it only re-runs when `streamedLogs`, `severityFilter`, or `keywordFilter` actually change.

The filter logic itself is straightforward:
- If a severity filter is set, the entry's severity must match exactly.
- If a keyword filter is set, the entry's message must contain the keyword (case-insensitive).
- Both conditions must pass (`&&`).

### Virtualizer setup

```js
  const rowVirtualizer = useVirtualizer({
    count: filteredLogs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28,
    overscan: 8,
  });
```

This is where the performance magic happens. Instead of rendering 10,000 `<div>` elements, the virtualizer only renders the ones currently visible in the scroll viewport, plus a few extras above and below.

- **count** -- how many total items exist. The virtualizer does not need the actual data, just the count.
- **getScrollElement** -- returns the DOM element that scrolls. This is where `parentRef` connects: the virtualizer reads the element's scroll position and height.
- **estimateSize** -- returns the estimated pixel height of each row (28px). The virtualizer uses this to calculate the total scrollable height and determine which rows are visible.
- **overscan** -- render 8 extra rows above and below the visible area. This prevents flashing blank space when the user scrolls quickly. Higher overscan = smoother scrolling but more DOM nodes.

**How virtualization works:** Imagine a phone book with 10,000 names. Instead of printing all 10,000 on a very long page, you have a small window that shows only 20 names at a time. As you scroll, the window replaces the 20 visible names. The scroll bar's height is faked to look like all 10,000 exist, but only 20 + (8 * 2) = 36 DOM elements are ever in the page. This is why the browser stays fast.

### Early returns

```js
  if (!deploymentId) {
    return <section className="panel">Select a deployment to stream logs.</section>;
  }

  if (logsQuery.isLoading) {
    return <section className="panel">Loading logs...</section>;
  }
```

Guard clauses that bail out of rendering before we get to the complex JSX below. If there is no deployment or data is still loading, show a simple message.

### The render

```js
  return (
    <section className="panel stack">
      <div className="row space">
        <h2>Live Logs</h2>
        <div className="row gap">
          <label className="row tiny gap">
            <input type="checkbox" checked={tailEnabled} onChange={(event) => setTailEnabled(event.target.checked)} />
            live tail
          </label>
          <a href={`/api/deployments/${deploymentId}/logs?download=1`} className="tinyButton">
            export
          </a>
        </div>
      </div>
```

The header area. The checkbox controls `tailEnabled`. When the user unchecks it, the SSE cleanup function fires and the stream closes. When they re-check it, the effect re-runs and a new connection opens. The export link triggers a file download from the server (the `download=1` query parameter tells the API to set `Content-Disposition: attachment` headers).

```js
      <div className="row gap">
        <select value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)}>
          <option value="">all severities</option>
          <option value="DEBUG">DEBUG</option>
          <option value="INFO">INFO</option>
          <option value="WARN">WARN</option>
          <option value="ERROR">ERROR</option>
        </select>
        <input
          placeholder="search logs..."
          value={keywordFilter}
          onChange={(event) => setKeywordFilter(event.target.value)}
        />
        <span className="muted">{filteredLogs.length.toLocaleString()} rows</span>
      </div>
```

The filter controls. The severity dropdown and keyword input are **controlled components** -- their displayed value is always in sync with the React state. `toLocaleString()` adds comma separators to the row count (e.g., "8,432 rows" instead of "8432 rows").

```js
      <div ref={parentRef} className="logViewport">
```

This is the scroll container. The `ref={parentRef}` connects our `useRef` to this actual DOM element. The virtualizer reads this element's `scrollTop` and `clientHeight` to figure out which rows are in view.

```js
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
```

This inner div is the "spacer." Its height is the total size of all rows if they were all rendered (e.g., 10,000 rows * 28px = 280,000px). This tricks the browser into showing a proportionally correct scroll bar. `position: relative` establishes a positioning context for the absolutely positioned row elements inside.

```js
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const item = filteredLogs[virtualRow.index];

            return (
              <div
                key={item.id || `${virtualRow.index}-${item.timestamp}`}
                className={`logRow sev${item.severity.toLowerCase()}`}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <span>{dayjs(item.timestamp).format("HH:mm:ss")}</span>
                <span>[{item.severity}]</span>
                <span>{item.service}</span>
                <span>{item.message}</span>
              </div>
            );
          })}
```

`getVirtualItems()` returns only the rows that should be visible right now (plus the overscan buffer). Each `virtualRow` object has:

- **index** -- the position in the full data array.
- **size** -- the row height (28px from our `estimateSize`).
- **start** -- the pixel offset from the top of the container where this row should appear.

Every row is `position: absolute` and placed using `transform: translateY(...)`. Why `translateY` instead of setting `top` directly? Because CSS transforms are handled by the GPU's compositor thread, which means they do not trigger expensive layout recalculations. This is a key performance optimization. Setting `top` would force the browser to recalculate layout for every row on every scroll event.

The `className` includes the severity level (`sevdebug`, `sevinfo`, `sevwarn`, `severror`), so you can style rows differently based on their severity with CSS.

The key uses `item.id` when available, falling back to a combination of index and timestamp. Keys help React track which elements changed when the list updates.

Each row displays four fields: timestamp (formatted as hours:minutes:seconds), severity badge, service name, and the log message.

## Concepts Taught

- **EventSource / Server-Sent Events (SSE)** -- a browser API for receiving a one-way stream of events from a server over HTTP. Simpler than WebSockets when you only need server-to-client communication. The connection stays open, and the server pushes data whenever it wants. If the connection drops, EventSource automatically tries to reconnect.

- **Virtualization** -- a rendering technique where only the visible rows (plus a small buffer) are rendered as actual DOM elements. The rest are "virtual." The scroll container is given a fake height so the scroll bar looks correct. As the user scrolls, old rows are removed and new ones are added. This lets you display lists with tens of thousands of items without destroying browser performance.

- **Cleanup functions in useEffect** -- the function you return from `useEffect` is called when the component unmounts or before the effect re-runs. You must close connections, remove listeners, and cancel timers here. Forgetting cleanup leads to memory leaks and zombie connections.

- **useRef for DOM access** -- `useRef` gives you a stable container (`{ current: null }`) that persists across renders. After React attaches the ref to a DOM element, `ref.current` points to that element. Unlike state, changing a ref does not trigger a re-render.

- **Functional state updates** -- `setState(current => newValue)` ensures you are working with the latest state, even when multiple updates are batched. This is essential inside event handlers that fire rapidly (like SSE messages).

- **useMemo for performance** -- caches the result of a computation. The computation only re-runs when its dependencies change. Without it, filtering 10,000 items would happen on every render.

- **CSS transform positioning** -- using `translateY` instead of `top` for positioning avoids layout thrashing and leverages GPU acceleration. This is a standard technique in high-performance scrolling UIs.

- **Controlled components** -- form elements (inputs, selects, checkboxes) whose values are driven by React state. The displayed value always matches the state, and user input goes through `onChange` handlers.

## Common Mistakes

- **Forgetting to close the EventSource in the cleanup function.** This is the number one mistake. The stream keeps running in the background, wasting bandwidth and memory. If the component mounts and unmounts repeatedly (like switching tabs), you accumulate zombie connections. Always return a cleanup function that calls `source.close()`.

- **Not using functional state updates inside event listeners.** If you write `setStreamedLogs([...streamedLogs, payload])` inside the `onLog` handler, `streamedLogs` is captured from the render when the effect was created. Rapid SSE events will all see the same stale array, and you will lose most of the new entries. Always use the `(current) => ...` form.

- **Not capping the array size.** Without `.slice(-10000)`, the log array grows forever. A busy deployment can produce thousands of lines per minute. Eventually the browser runs out of memory and the tab crashes.

- **Rendering all rows without virtualization.** If you just do `filteredLogs.map(...)` to render 10,000 divs, the browser becomes unresponsive. The DOM is expensive -- each element costs memory and forces the browser to calculate layout. Virtualization is not optional for large lists.

- **Using `top` instead of `translateY` for positioned rows.** Setting the `top` CSS property triggers layout recalculation. `transform: translateY()` is composited by the GPU and does not trigger layout, making scrolling much smoother.

- **Creating a new EventSource on every render.** If you put the EventSource creation outside of `useEffect`, a new connection is opened on every render. The effect with a proper dependency array ensures the connection is created only once (per set of dependencies) and cleaned up properly.

## Mini Exercises

1. **Add an auto-scroll feature.** When `tailEnabled` is true and new logs arrive, the scroll container should automatically scroll to the bottom so the user always sees the latest line. But if the user has scrolled up manually (to inspect an older log), auto-scroll should pause so it does not yank them away. (Hint: compare `parentRef.current.scrollTop + parentRef.current.clientHeight` to `parentRef.current.scrollHeight` to detect whether the user is near the bottom.)

2. **Add a "pause" indicator.** When the user unchecks "live tail," the SSE connection closes and no new logs arrive. Add a visible warning banner that says "Live streaming paused -- new logs will not appear" so the user knows they are looking at a frozen snapshot.

3. **Debounce the keyword filter.** Right now, every keystroke in the keyword input triggers a re-filter of the entire log array. If there are 10,000 logs, typing "error" triggers 5 separate filters (one per character). Implement a debounce so the filter only runs after the user stops typing for 300ms. (Hint: use a `setTimeout` inside a `useEffect` with the keyword as a dependency, and clear the timeout in the cleanup function.)

## Further Reading

- Search: "MDN EventSource Server-Sent Events tutorial"
- Search: "tanstack react-virtual getting started guide"
- Search: "React useEffect cleanup function explained"
- Search: "CSS transform vs top performance layout thrashing"
- Search: "React useMemo when to use performance optimization"
- Search: "virtualized list vs infinite scroll differences"
