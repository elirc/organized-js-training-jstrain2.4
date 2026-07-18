# Guide: lib/metrics.js

## Purpose

This file transforms raw monitoring data points into chart-friendly time series. The database stores one metric per timestamp (potentially many per hour). This module groups them into hourly buckets and computes averages, so the chart shows one smooth data point per hour instead of jagged individual readings.

## Line-by-Line Walkthrough

### Aggregation (Lines 1-29)

```js
export function aggregateMetricsForCharts(metrics) {
  return metrics.reduce((accumulator, metric) => {
```
`Array.reduce()` is a powerful method that processes every item in an array and builds up a single result. Here, it builds an object where each key is an hour-bucket and each value is the accumulated totals for that hour.

- `accumulator` — the result being built up (starts as `{}`)
- `metric` — the current item from the array

```js
    const bucketTime = new Date(metric.timestamp);
    bucketTime.setMinutes(0, 0, 0);
    const bucketKey = bucketTime.toISOString();
```
**Time bucketing:** Takes a timestamp like `2024-01-15T14:37:22Z` and rounds it down to `2024-01-15T14:00:00Z`. This groups all metrics from the same hour into the same bucket.

- `setMinutes(0, 0, 0)` — sets minutes, seconds, and milliseconds to zero. This is a mutation — it changes the Date object in place.

```js
    if (!accumulator[bucketKey]) {
      accumulator[bucketKey] = {
        timestamp: bucketKey,
        samples: 0,
        uptimePct: 0,
        responseTimeMs: 0,
        errorRatePct: 0,
        cpuPct: 0,
        memoryMb: 0,
      };
    }
```
If this is the first metric in this hour, create the bucket with zero totals. The `samples` counter tracks how many data points fall in this bucket (needed for averaging later).

```js
    const bucket = accumulator[bucketKey];
    bucket.samples += 1;
    bucket.uptimePct += metric.uptimePct;
    bucket.responseTimeMs += metric.responseTimeMs;
    bucket.errorRatePct += metric.errorRatePct;
    bucket.cpuPct += metric.cpuPct;
    bucket.memoryMb += metric.memoryMb;

    return accumulator;
  }, {});
}
```
Accumulates totals. After processing all metrics, each bucket contains the SUM of all values for that hour and the COUNT of samples. The `{}` at the end is the initial value of the accumulator.

### Finalization (Lines 31-42)

```js
export function finalizeMetricBuckets(buckets) {
  return Object.values(buckets)
    .map((bucket) => ({
      timestamp: bucket.timestamp,
      uptimePct: bucket.uptimePct / bucket.samples,
      responseTimeMs: bucket.responseTimeMs / bucket.samples,
      errorRatePct: bucket.errorRatePct / bucket.samples,
      cpuPct: bucket.cpuPct / bucket.samples,
      memoryMb: bucket.memoryMb / bucket.samples,
    }))
    .sort((a, b) => (a.timestamp > b.timestamp ? 1 : -1));
}
```
1. `Object.values(buckets)` — converts the object `{ "2024-01-15T14:00:00Z": {...}, ... }` into an array of bucket objects
2. `.map(...)` — divides each total by the sample count to get the AVERAGE
3. `.sort(...)` — sorts chronologically so the chart shows time left-to-right

**Why two separate functions?** This is the **aggregate-then-finalize** pattern. You can't compute a running average in a single pass without knowing how many items each bucket will contain. By accumulating totals first and averaging second, the math is always correct regardless of how many metrics fall in each bucket.

## Concepts Taught
- **Array.reduce()** — the most versatile array method, used for aggregation
- **Time bucketing** — grouping continuous data into discrete intervals
- **Running totals** — accumulating values for later averaging
- **Two-pass processing** — aggregate then finalize
- **Object as accumulator** — using object keys for grouping

**Extra example:** A simpler use of reduce to count word frequencies:
```js
const words = ["hello", "world", "hello"];
const counts = words.reduce((acc, word) => {
  acc[word] = (acc[word] || 0) + 1;
  return acc;
}, {});
// { hello: 2, world: 1 }
```

## Common Mistakes
- Dividing by zero — if a bucket somehow has `samples: 0`, you'd get `NaN`. The code avoids this because you only create a bucket when you have at least one sample.
- Mutating the original Date object — `bucketTime.setMinutes(0, 0, 0)` mutates `bucketTime`, but since it's a new Date created from the metric's timestamp, the original metric is unaffected.
- Forgetting to sort — charts need chronologically ordered data. Without `.sort()`, buckets might appear in hash-map order (unpredictable).

## Mini Exercises
1. Modify `aggregateMetricsForCharts` to bucket by 30-minute intervals instead of hourly. (Hint: round minutes to 0 or 30.)
2. Add a `maxResponseTimeMs` field that tracks the highest response time in each bucket, not just the average.
3. What would happen if `metrics` was an empty array? Trace through both functions.

## Further Reading
- Search: "Array.reduce javascript examples"
- Search: "time series data aggregation"
- Search: "data bucketing for charts"
