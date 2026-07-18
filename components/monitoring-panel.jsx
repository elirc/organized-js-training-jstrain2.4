"use client";

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

export function MonitoringPanel({ applicationId, environmentId }) {
  const query = useQuery({
    queryKey: ["monitoring", applicationId, environmentId],
    queryFn: () =>
      fetchJson(`/api/monitoring?applicationId=${applicationId}${environmentId ? `&environmentId=${environmentId}` : ""}`),
    enabled: Boolean(applicationId),
    refetchInterval: 20_000,
  });

  if (query.isLoading) {
    return <section className="panel">Loading monitoring...</section>;
  }

  if (query.error) {
    return <section className="panel">Monitoring error: {query.error.message}</section>;
  }

  const { chartSeries, latest, healthChecks } = query.data;

  return (
    <section className="panel stack">
      <div className="row space">
        <h2>Monitoring</h2>
        <span className="muted">
          latest {latest ? dayjs(latest.timestamp).format("MMM D HH:mm") : "n/a"}
        </span>
      </div>

      <div className="metricsGrid">
        <MetricCard label="Uptime %" value={latest?.uptimePct?.toFixed(2) || "n/a"} />
        <MetricCard label="Response ms" value={latest?.responseTimeMs?.toFixed(1) || "n/a"} />
        <MetricCard label="Error %" value={latest?.errorRatePct?.toFixed(2) || "n/a"} />
        <MetricCard label="CPU %" value={latest?.cpuPct?.toFixed(1) || "n/a"} />
      </div>

      <div className="chartWrap">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartSeries}>
            <CartesianGrid strokeDasharray="4 4" stroke="#1f3650" />
            <XAxis
              dataKey="timestamp"
              tickFormatter={(value) => dayjs(value).format("MM/DD HH:mm")}
              minTickGap={18}
              stroke="#86a4c6"
            />
            <YAxis yAxisId="left" stroke="#86a4c6" />
            <YAxis yAxisId="right" orientation="right" stroke="#86a4c6" />
            <Tooltip
              labelFormatter={(value) => dayjs(value).format("MMM D, HH:mm")}
              contentStyle={{
                background: "#0e1b2b",
                border: "1px solid #34516f",
                borderRadius: 8,
              }}
            />
            <Line yAxisId="left" type="monotone" dataKey="responseTimeMs" stroke="#6be08e" strokeWidth={2} dot={false} />
            <Line yAxisId="right" type="monotone" dataKey="errorRatePct" stroke="#f06f62" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="chips">
        {healthChecks.map((check, index) => (
          <span className={`chip ${check.status === "healthy" ? "chipOk" : "chipWarn"}`} key={`${check.service}-${index}`}>
            {check.service}: {check.status}
          </span>
        ))}
      </div>
    </section>
  );
}

function MetricCard({ label, value }) {
  return (
    <div className="metricCard">
      <span className="muted tiny">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
