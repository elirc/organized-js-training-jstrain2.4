"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "@/lib/api";

export function EnvironmentPanel({ application, selectedEnvironmentId }) {
  const queryClient = useQueryClient();
  const [draftVarKey, setDraftVarKey] = useState("");
  const [draftVarValue, setDraftVarValue] = useState("");
  const [draftVarSecret, setDraftVarSecret] = useState(false);

  const environment = useMemo(
    () =>
      application.environments.find((item) => item.id === selectedEnvironmentId) ||
      application.environments[0] ||
      null,
    [application.environments, selectedEnvironmentId],
  );

  const updateEnvironment = useMutation({
    mutationFn: (payload) =>
      fetchJson("/api/environments", {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      setDraftVarKey("");
      setDraftVarValue("");
      setDraftVarSecret(false);
    },
  });

  if (!environment) {
    return <section className="panel">No environment available.</section>;
  }

  return (
    <section className="panel stack">
      <div className="row space">
        <h2>Environment</h2>
        <span className="muted">{environment.slug}</span>
      </div>
      <div className="row gap">
        <button
          type="button"
          className="tinyButton"
          onClick={() =>
            updateEnvironment.mutate({
              id: environment.id,
              deployLocked: !environment.deployLocked,
              lockReason: !environment.deployLocked ? "Manual lock from dashboard" : null,
            })
          }
          disabled={updateEnvironment.isPending}
        >
          {environment.deployLocked ? "unlock deploys" : "lock deploys"}
        </button>
        <span className="muted tiny">{environment.lockReason || "no lock reason"}</span>
      </div>

      <div className="stack">
        {environment.variables.map((variable) => (
          <article className="entityRow" key={variable.id}>
            <div className="row space">
              <strong>{variable.key}</strong>
              <span className="tiny mono">{variable.isSecret ? variable.maskedValue : variable.value}</span>
            </div>
          </article>
        ))}
      </div>

      <form
        className="row gap wrap"
        onSubmit={(event) => {
          event.preventDefault();
          updateEnvironment.mutate({
            id: environment.id,
            variables: [
              {
                key: draftVarKey,
                value: draftVarValue,
                isSecret: draftVarSecret,
              },
            ],
          });
        }}
      >
        <input
          required
          placeholder="ENV_KEY"
          value={draftVarKey}
          onChange={(event) => setDraftVarKey(event.target.value)}
        />
        <input
          required
          placeholder="value"
          value={draftVarValue}
          onChange={(event) => setDraftVarValue(event.target.value)}
        />
        <label className="row tiny gap">
          <input type="checkbox" checked={draftVarSecret} onChange={(event) => setDraftVarSecret(event.target.checked)} />
          secret
        </label>
        <button type="submit" disabled={updateEnvironment.isPending}>
          add variable
        </button>
      </form>
    </section>
  );
}
