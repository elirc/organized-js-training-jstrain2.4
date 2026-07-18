"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "@/lib/api";
import clsx from "clsx";

export function AppSelector({
  teams,
  selectedAppId,
  selectedEnvironmentId,
  onSelectApp,
  onSelectEnvironment,
}) {
  const queryClient = useQueryClient();
  const [newApp, setNewApp] = useState({
    name: "",
    repoUrl: "",
    buildCommand: "npm run build",
    startCommand: "npm run start",
  });

  const applications = useMemo(
    () =>
      teams.flatMap((team) =>
        team.applications.map((application) => ({
          ...application,
          teamId: team.id,
          teamName: team.name,
        })),
      ),
    [teams],
  );

  const selectedApp = applications.find((application) => application.id === selectedAppId);

  const createApp = useMutation({
    mutationFn: (payload) =>
      fetchJson("/api/applications", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      setNewApp({
        name: "",
        repoUrl: "",
        buildCommand: "npm run build",
        startCommand: "npm run start",
      });
    },
  });

  return (
    <aside className="panel stack">
      <div className="row space">
        <h2>Applications</h2>
        <span className="muted">{applications.length} total</span>
      </div>

      <div className="stack">
        {applications.map((application) => (
          <button
            type="button"
            key={application.id}
            className={clsx("appButton", selectedAppId === application.id && "appButtonActive")}
            onClick={() => onSelectApp(application.id)}
          >
            <span>{application.name}</span>
            <span className="muted">{application.teamName}</span>
          </button>
        ))}
      </div>

      {selectedApp ? (
        <div className="stack">
          <h3>Environments</h3>
          <div className="chips">
            {selectedApp.environments.map((environment) => (
              <button
                type="button"
                key={environment.id}
                className={clsx(
                  "chip",
                  selectedEnvironmentId === environment.id && "chipActive",
                  environment.deployLocked && "chipWarn",
                )}
                onClick={() => onSelectEnvironment(environment.id)}
              >
                {environment.slug}
                {environment.deployLocked ? " (locked)" : ""}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          if (!applications.length) return;
          createApp.mutate({
            teamId: applications[0].teamId,
            ...newApp,
          });
        }}
      >
        <h3>Create App</h3>
        <input
          placeholder="app name"
          value={newApp.name}
          onChange={(event) => setNewApp((current) => ({ ...current, name: event.target.value }))}
          required
        />
        <input
          placeholder="repo url"
          value={newApp.repoUrl}
          onChange={(event) => setNewApp((current) => ({ ...current, repoUrl: event.target.value }))}
          required
        />
        <button type="submit" disabled={createApp.isPending}>
          {createApp.isPending ? "Creating..." : "Create Application"}
        </button>
      </form>
    </aside>
  );
}
