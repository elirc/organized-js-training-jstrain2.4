# Guide: components/monitoring-panel.jsx

## Purpose

This component is the health dashboard for a deployed application. It polls the server every 20 seconds for fresh metrics, renders summary cards (uptime, response time, error rate, CPU usage), draws a time-series chart with two Y-axes, and shows the current status of health checks. It is a read-only monitoring view -- there are no forms or mutations. Everything here is about displaying data clearly and keeping it up to date automatically.

## Line-by-Line Walkthrough

### Imports

```js
"use client";
```
Client component directive for Next.js. This component uses hooks and browser APIs, so it must run in the browser.

```js
import dayjs from "dayjs";
import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchJson } from "@/lib/api";
```

The imports tell you what this component depends on:

- **dayjs** -- lightweight date formatting.
- **useQuery** -- TanStack Query's data-fetching hook with built-in caching, loading states, and automatic refetching.
- **Recharts components** -- a React charting library built on top of D3. Each import is a composable piece of a chart (the grid, the lines, the axes, etc.). Recharts uses a declarative approach -- you describe the chart with JSX, and the library handles all the SVG rendering.
- **fetchJson** -- our project's HTTP client wrapper.

### Data fetching with polling

```js
export function MonitoringPanel({ applicationId, environmentId }) {
  const query = useQuery({
    queryKey: ["monitoring", applicationId, environmentId],
    queryFn: () =>
      fetchJson(`/api/monitoring?applicationId=${applicationId}${environmentId ? `&environmentId=${environmentId}` : ""}`),
    enabled: Boolean(applicationId),
    refetchInterval: 20_000,
  });
```

The component takes `applicationId` and `environmentId` as props. The `environmentId` is optional -- if present, it is appended to the URL as a query parameter using a ternary expression.

The `queryKey` includes both IDs, so switching between applications or environments gives each combination its own cache entry.

**`refetchInterval: 20_000`** is the key line. This tells TanStack Query: "After the initial fetch succeeds, automatically re-fetch every 20,000 milliseconds (20 seconds)." This is called **polling**. Unlike the SSE approach in the log panel, polling is simpler but less real-time. The data can be up to 20 seconds stale. For monitoring metrics (which change slowly), this trade-off is fine. For fast-moving logs, it would not be.

The `20_000` uses JavaScript's numeric separator (`_`) for readability. It is identical to `20000` but easier to read at a glance.

`enabled: Boolean(applicationId)` prevents the query from running (and polling) when no application is selected. Without this, the query would fire with `applicationId=undefined` in the URL and get back an error.

### Loading and error states

```js
  if (query.isLoading) {
    return <section className="panel">Loading monitoring...</section>;
  }

  if (query.error) {
    return <section className="panel">Monitoring error: {query.error.message}</section>;
  }
```

Two guard clauses. The first handles the initial load (before any data arrives). The second handles errors -- if the API returns an error, `query.error` is set to the thrown Error object from `fetchJson`. Notice that after the first successful load, `isLoading` stays false even during refetches. The user sees stale data while the refresh happens in the background. TanStack Query does this intentionally to avoid a loading flash every 20 seconds.

### Destructuring the response

```js
  const { chartSeries, latest, healthChecks } = query.data;
```

The API returns an object with three fields:

- **chartSeries** -- an array of data points for the chart. Each point has a `timestamp`, `responseTimeMs`, and `errorRatePct`.
- **latest** -- the most recent metric snapshot. Contains `uptimePct`, `responseTimeMs`, `errorRatePct`, `cpuPct`, and `timestamp`.
- **healthChecks** -- an array of `{ service, status }` objects showing whether each service dependency is healthy.

### The header

```js
  return (
    <section className="panel stack">
      <div className="row space">
        <h2>Monitoring</h2>
        <span className="muted">
          latest {latest ? dayjs(latest.timestamp).format("MMM D HH:mm") : "n/a"}
        </span>
      </div>
```

Shows the title and when the latest data point was recorded. The `dayjs(...).format("MMM D HH:mm")` produces output like "Jan 15 14:30". The ternary handles the case where `latest` might be null.

### Metric cards

```js
      <div className="metricsGrid">
        <MetricCard label="Uptime %" value={latest?.uptimePct?.toFixed(2) || "n/a"} />
        <MetricCard label="Response ms" value={latest?.responseTimeMs?.toFixed(1) || "n/a"} />
        <MetricCard label="Error %" value={latest?.errorRatePct?.toFixed(2) || "n/a"} />
        <MetricCard label="CPU %" value={latest?.cpuPct?.toFixed(1) || "n/a"} />
      </div>
```

Four summary cards in a grid. Each uses optional chaining (`?.`) because `latest` could be null. `toFixed(2)` formats the number to 2 decimal places (e.g., `99.97`). The `|| "n/a"` fallback shows "n/a" if the value is undefined or null.

The `MetricCard` component is defined at the bottom of the file:

```js
function MetricCard({ label, value }) {
  return (
    <div className="metricCard">
      <span className="muted tiny">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
```

It is a simple presentational component -- no state, no hooks, just props in, JSX out. It is not exported because nothing outside this file needs it. This is a common pattern: define small helper components at the bottom of the file, right next to the only component that uses them.

### The chart

```js
      <div className="chartWrap">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartSeries}>
```

**ResponsiveContainer** is a Recharts wrapper that measures its parent element and passes the actual pixel width/height down to the chart inside. Without it, you would have to hardcode pixel dimensions. With it, the chart automatically resizes when the browser window changes. It is set to take 100% of the available width and a fixed height of 260 pixels.

**LineChart** is the main chart component. The `data` prop takes an array of objects. Recharts automatically maps object keys to data series based on the `dataKey` props on child components.

```js
            <CartesianGrid strokeDasharray="4 4" stroke="#1f3650" />
```

Draws the background grid lines. `strokeDasharray="4 4"` makes them dashed (4 pixels drawn, 4 pixels gap). The `stroke` color is a dark blue that blends with the dashboard's dark theme.

```js
            <XAxis
              dataKey="timestamp"
              tickFormatter={(value) => dayjs(value).format("MM/DD HH:mm")}
              minTickGap={18}
              stroke="#86a4c6"
            />
```

The X-axis shows timestamps. `dataKey="timestamp"` tells Recharts which field in the data objects to use for the horizontal axis. `tickFormatter` converts raw timestamp strings into human-readable labels like "01/15 14:30". `minTickGap={18}` prevents labels from overlapping by ensuring at least 18 pixels between tick marks. When the chart is narrow, Recharts will skip labels to maintain this gap.

```js
            <YAxis yAxisId="left" stroke="#86a4c6" />
            <YAxis yAxisId="right" orientation="right" stroke="#86a4c6" />
```

**Dual Y-axes.** This is the most interesting charting technique here. The left Y-axis shows response time in milliseconds (which might range from 50 to 500). The right Y-axis shows error rate percentage (which might range from 0 to 5). These two metrics have very different scales. If you plotted them on a single axis, one line would be squished flat at the bottom while the other takes up the full height.

Each axis gets a unique `yAxisId`. The lines below reference these IDs to specify which axis they belong to. `orientation="right"` puts the second axis on the right side of the chart.

```js
            <Tooltip
              labelFormatter={(value) => dayjs(value).format("MMM D, HH:mm")}
              contentStyle={{
                background: "#0e1b2b",
                border: "1px solid #34516f",
                borderRadius: 8,
              }}
            />
```

The Tooltip appears when you hover over the chart. `labelFormatter` formats the timestamp shown at the top of the tooltip. `contentStyle` overrides the default white tooltip with a dark-themed one that matches the dashboard.

```js
            <Line yAxisId="left" type="monotone" dataKey="responseTimeMs" stroke="#6be08e" strokeWidth={2} dot={false} />
            <Line yAxisId="right" type="monotone" dataKey="errorRatePct" stroke="#f06f62" strokeWidth={2} dot={false} />
```

Two line series:

- **responseTimeMs** (green, `#6be08e`) -- plotted against the left Y-axis.
- **errorRatePct** (red, `#f06f62`) -- plotted against the right Y-axis.

`type="monotone"` creates smooth curves that never overshoot the data points (monotone cubic interpolation). `dot={false}` hides the circle markers at each data point, keeping the chart clean when there are many points.

### Health check chips

```js
      <div className="chips">
        {healthChecks.map((check, index) => (
          <span className={`chip ${check.status === "healthy" ? "chipOk" : "chipWarn"}`} key={`${check.service}-${index}`}>
            {check.service}: {check.status}
          </span>
        ))}
      </div>
```

Each health check is displayed as a small "chip" (a rounded label). If the status is "healthy," it gets the `chipOk` class (likely green); otherwise, `chipWarn` (likely yellow or red). The key combines the service name and index for uniqueness.

## Concepts Taught

- **Polling with refetchInterval** -- a simple strategy for keeping data fresh. The client asks the server for new data at a fixed interval. Contrast this with SSE (server pushes data) or WebSockets (bidirectional). Polling is the easiest to implement and debug. Its downside is that data can be stale between fetches, and it creates more HTTP requests than push-based approaches.

- **Recharts and declarative charting** -- instead of imperatively drawing lines on a canvas, you declare the chart structure with JSX components. Recharts reads your `data` array and `dataKey` props to figure out what to draw. This is the React way of doing things: describe what you want, not how to draw it.

- **ResponsiveContainer** -- a pattern for making charts resize with their parent. The chart itself needs pixel dimensions to render SVG, but the container translates percentage-based width into actual pixels using a resize observer.

- **Dual Y-axes** -- a charting technique for comparing metrics with different scales on the same chart. Without dual axes, the smaller-scale metric would be an unreadable flat line.

- **Optional chaining with fallbacks** -- `latest?.uptimePct?.toFixed(2) || "n/a"` is a defensive chain that handles null/undefined at any level. This prevents crashes when data is missing.

- **Helper components that are not exported** -- `MetricCard` is a private component. Keeping small helpers close to their consumer (in the same file, not exported) reduces complexity and makes the code easier to navigate.

## Common Mistakes

- **Setting refetchInterval too low.** Polling every 1 second with `refetchInterval: 1000` hammers the server and database. For monitoring data that changes slowly, 20 seconds is appropriate. For truly real-time needs, use SSE or WebSockets instead of rapid polling.

- **Forgetting `enabled: Boolean(applicationId)`.** Without this guard, the query fires immediately with `undefined` in the URL, causing a 400 error. The polling would then retry every 20 seconds, flooding the console with errors.

- **Hardcoding chart dimensions.** If you write `<LineChart width={800} height={260}>` instead of wrapping it in `ResponsiveContainer`, the chart will overflow or be clipped on smaller screens. Always use `ResponsiveContainer` for charts in responsive layouts.

- **Plotting different-scale metrics on one Y-axis.** If response time is 200ms and error rate is 0.5%, putting both on the same axis makes the error rate line invisible. Dual Y-axes solve this.

- **Not formatting timestamps on the X-axis.** Raw ISO timestamps like "2024-01-15T14:30:00Z" are unreadable as axis labels. Always use a formatter to show only the relevant parts.

## Mini Exercises

1. **Add a third line to the chart.** The `latest` object includes `cpuPct`. Add CPU percentage as a third line on the chart. Should it share one of the existing Y-axes, or does it need a third? Think about the scale: CPU percentage ranges from 0 to 100, which is different from both response time and error rate. (Hint: you can have more than two Y-axes, or you could share the right axis if the scales are close enough.)

2. **Add conditional coloring to MetricCard.** Right now, all four metric cards look the same. Modify `MetricCard` to accept a `threshold` prop. If the value exceeds the threshold, change the text color to red. For example, if error rate exceeds 5% or response time exceeds 1000ms, the card should visually warn the user.

3. **Show a "last updated" relative time.** Instead of showing the absolute timestamp ("Jan 15 14:30"), show a relative time like "12 seconds ago" that updates. (Hint: look into `dayjs.extend(relativeTime)` and the `dayjs(...).fromNow()` method. You will need a small interval or a state update to keep the relative time fresh.)

## Further Reading

- Search: "Recharts getting started guide React"
- Search: "TanStack Query refetchInterval polling pattern"
- Search: "Recharts dual Y-axis LineChart example"
- Search: "responsive charts in React with Recharts"
- Search: "polling vs server-sent events vs websockets comparison"
