"use client";

import dayjs from "dayjs";

export function AuditPanel({ application }) {
  const auditEntries = application?.auditLogs?.slice(0, 40) || [];

  return (
    <section className="panel stack">
      <div className="row space">
        <h2>Audit Log</h2>
        <a className="tinyButton" href={`/api/audit?applicationId=${application.id}&download=1`}>
          export
        </a>
      </div>
      <div className="stack">
        {auditEntries.map((entry) => (
          <article key={entry.id} className="entityRow">
            <div className="row space">
              <strong>{entry.action}</strong>
              <span className="tiny muted">{dayjs(entry.createdAt).format("MMM D HH:mm:ss")}</span>
            </div>
            <p className="tiny mono">
              {entry.actor?.email || "system"} to {entry.entityType}/{entry.entityId}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
