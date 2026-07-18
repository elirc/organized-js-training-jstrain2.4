export function aggregateMetricsForCharts(metrics) {
  return metrics.reduce((accumulator, metric) => {
    const bucketTime = new Date(metric.timestamp);
    bucketTime.setMinutes(0, 0, 0);
    const bucketKey = bucketTime.toISOString();

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
