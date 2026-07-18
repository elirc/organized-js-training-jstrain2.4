import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { aggregateMetricsForCharts, finalizeMetricBuckets } from "@/lib/metrics";

async function runHealthCheck(service) {
  await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 90) + 20));
  if (Math.random() < 0.1) {
    throw new Error(`${service} failed`);
  }
  return { service, status: "healthy" };
}

export async function GET(request) {
  const url = new URL(request.url);
  const applicationId = url.searchParams.get("applicationId");
  const environmentId = url.searchParams.get("environmentId");

  if (!applicationId) {
    return NextResponse.json({ error: "applicationId is required" }, { status: 400 });
  }

  const metrics = await prisma.monitoringMetric.findMany({
    where: {
      applicationId,
      ...(environmentId ? { environmentId } : {}),
    },
    orderBy: { timestamp: "asc" },
    take: 500,
  });

  const buckets = aggregateMetricsForCharts(metrics);
  const chartSeries = finalizeMetricBuckets(buckets);

  const latest = chartSeries.at(-1);
  const checks = await Promise.allSettled([
    runHealthCheck("api"),
    runHealthCheck("worker"),
    runHealthCheck("db"),
    runHealthCheck("cache"),
  ]);

  return NextResponse.json({
    latest,
    chartSeries,
    healthChecks: checks.map((check) =>
      check.status === "fulfilled" ? check.value : { service: "unknown", status: "unhealthy" },
    ),
  });
}
