"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/api";

export function LogStreamPanel({ deploymentId }) {
  const parentRef = useRef(null);
  const [tailEnabled, setTailEnabled] = useState(true);
  const [severityFilter, setSeverityFilter] = useState("");
  const [keywordFilter, setKeywordFilter] = useState("");
  const [streamedLogs, setStreamedLogs] = useState([]);

  const logsQuery = useQuery({
    queryKey: ["deployment-logs", deploymentId],
    queryFn: () => fetchJson(`/api/deployments/${deploymentId}/logs?take=4000`),
    enabled: Boolean(deploymentId),
  });

  useEffect(() => {
    setStreamedLogs(logsQuery.data || []);
  }, [logsQuery.data]);

  useEffect(() => {
    if (!deploymentId || !tailEnabled) {
      return () => {};
    }

    const source = new EventSource(`/api/deployments/${deploymentId}/logs/stream`);

    const onLog = (event) => {
      const payload = JSON.parse(event.data);
      setStreamedLogs((current) => [...current, payload].slice(-10000));
    };

    source.addEventListener("log", onLog);

    return () => {
      source.removeEventListener("log", onLog);
      source.close();
    };
  }, [deploymentId, tailEnabled]);

  const filteredLogs = useMemo(() => {
    return streamedLogs.filter((entry) => {
      const matchesSeverity = severityFilter ? entry.severity === severityFilter : true;
      const matchesKeyword = keywordFilter
        ? entry.message.toLowerCase().includes(keywordFilter.toLowerCase())
        : true;
      return matchesSeverity && matchesKeyword;
    });
  }, [streamedLogs, severityFilter, keywordFilter]);

  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: filteredLogs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28,
    overscan: 8,
  });

  if (!deploymentId) {
    return <section className="panel">Select a deployment to stream logs.</section>;
  }

  if (logsQuery.isLoading) {
    return <section className="panel">Loading logs...</section>;
  }

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

      <div ref={parentRef} className="logViewport">
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
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
        </div>
      </div>
    </section>
  );
}
