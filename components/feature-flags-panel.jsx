"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "@/lib/api";

export function FeatureFlagsPanel({ application }) {
  const queryClient = useQueryClient();
  const [newFlag, setNewFlag] = useState({
    key: "",
    type: "BOOLEAN",
    defaultValue: "false",
    description: "",
  });

  const createFlag = useMutation({
    mutationFn: (payload) =>
      fetchJson("/api/feature-flags", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      setNewFlag({
        key: "",
        type: "BOOLEAN",
        defaultValue: "false",
        description: "",
      });
    },
  });

  const updateFlag = useMutation({
    mutationFn: (payload) =>
      fetchJson("/api/feature-flags", {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
    },
  });

  return (
    <section className="panel stack">
      <h2>Feature Flags</h2>

      <div className="stack">
        {application.featureFlags.map((flag) => (
          <article className="entityRow" key={flag.id}>
            <div className="row space">
              <strong>{flag.key}</strong>
              <span className={`badge ${flag.enabled ? "statuslive" : "statusfailed"}`}>
                {flag.enabled ? "enabled" : "disabled"}
              </span>
            </div>
            <p className="muted tiny">{flag.description || "No description"}</p>
            <p className="tiny mono">default: {flag.defaultValue}</p>
            <p className="tiny mono">
              depends on: {flag.dependencies.length ? flag.dependencies.map((dep) => dep.dependsOnFlag.key).join(", ") : "none"}
            </p>
            <div className="row gap">
              <button
                type="button"
                className="tinyButton"
                onClick={() =>
                  updateFlag.mutate({
                    id: flag.id,
                    enabled: !flag.enabled,
                  })
                }
              >
                {flag.enabled ? "disable" : "enable"}
              </button>
              <button
                type="button"
                className="tinyButton warn"
                onClick={() =>
                  updateFlag.mutate({
                    id: flag.id,
                    killSwitch: !flag.killSwitch,
                  })
                }
              >
                kill switch: {flag.killSwitch ? "on" : "off"}
              </button>
            </div>
          </article>
        ))}
      </div>

      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          createFlag.mutate({
            applicationId: application.id,
            ...newFlag,
          });
        }}
      >
        <h3>Create Flag</h3>
        <input
          required
          placeholder="flag key"
          value={newFlag.key}
          onChange={(event) => setNewFlag((current) => ({ ...current, key: event.target.value }))}
        />
        <select
          value={newFlag.type}
          onChange={(event) => setNewFlag((current) => ({ ...current, type: event.target.value }))}
        >
          <option value="BOOLEAN">BOOLEAN</option>
          <option value="STRING">STRING</option>
          <option value="JSON">JSON</option>
        </select>
        <input
          required
          placeholder="default value"
          value={newFlag.defaultValue}
          onChange={(event) => setNewFlag((current) => ({ ...current, defaultValue: event.target.value }))}
        />
        <input
          placeholder="description"
          value={newFlag.description}
          onChange={(event) => setNewFlag((current) => ({ ...current, description: event.target.value }))}
        />
        <button type="submit" disabled={createFlag.isPending}>
          {createFlag.isPending ? "Creating..." : "Create Flag"}
        </button>
      </form>
    </section>
  );
}
