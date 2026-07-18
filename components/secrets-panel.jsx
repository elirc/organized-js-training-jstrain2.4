"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "@/lib/api";

export function SecretsPanel({ application }) {
  const queryClient = useQueryClient();
  const [newSecret, setNewSecret] = useState({
    key: "",
    value: "",
    description: "",
  });
  const [rotateSecretId, setRotateSecretId] = useState("");
  const [rotateSecretValue, setRotateSecretValue] = useState("");

  const createSecret = useMutation({
    mutationFn: (payload) =>
      fetchJson("/api/secrets", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      setNewSecret({ key: "", value: "", description: "" });
    },
  });

  const rotateSecret = useMutation({
    mutationFn: (payload) =>
      fetchJson("/api/secrets", {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      setRotateSecretId("");
      setRotateSecretValue("");
    },
  });

  return (
    <section className="panel stack">
      <h2>Secrets</h2>
      <div className="stack">
        {application.secrets.map((secret) => (
          <article className="entityRow" key={secret.id}>
            <div className="row space">
              <strong>{secret.key}</strong>
              <span className="badge statuslive">v{secret.versions[0]?.version ?? 0}</span>
            </div>
            <p className="tiny mono">masked: {secret.maskedValue}</p>
            <p className="muted tiny">rotation every {secret.rotationIntervalDays} days</p>
            <p className="tiny">
              used by: {secret.usages.map((usage) => `${usage.serviceName}/${usage.environment?.slug || "n/a"}`).join(", ")}
            </p>
            <button
              type="button"
              className="tinyButton"
              onClick={() => {
                setRotateSecretId(secret.id);
                setRotateSecretValue("");
              }}
            >
              rotate
            </button>
          </article>
        ))}
      </div>

      {rotateSecretId ? (
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            rotateSecret.mutate({
              id: rotateSecretId,
              value: rotateSecretValue,
            });
          }}
        >
          <h3>Rotate Secret</h3>
          <input
            required
            placeholder="new secret value"
            value={rotateSecretValue}
            onChange={(event) => setRotateSecretValue(event.target.value)}
          />
          <div className="row gap">
            <button type="submit" disabled={rotateSecret.isPending}>
              {rotateSecret.isPending ? "Rotating..." : "Confirm Rotation"}
            </button>
            <button type="button" className="tinyButton" onClick={() => setRotateSecretId("")}>
              cancel
            </button>
          </div>
        </form>
      ) : null}

      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          createSecret.mutate({
            applicationId: application.id,
            ...newSecret,
          });
        }}
      >
        <h3>Create Secret</h3>
        <input
          required
          placeholder="SECRET_KEY"
          value={newSecret.key}
          onChange={(event) => setNewSecret((current) => ({ ...current, key: event.target.value }))}
        />
        <input
          required
          placeholder="value"
          value={newSecret.value}
          onChange={(event) => setNewSecret((current) => ({ ...current, value: event.target.value }))}
        />
        <input
          placeholder="description"
          value={newSecret.description}
          onChange={(event) => setNewSecret((current) => ({ ...current, description: event.target.value }))}
        />
        <button type="submit" disabled={createSecret.isPending}>
          {createSecret.isPending ? "Creating..." : "Create Secret"}
        </button>
      </form>
    </section>
  );
}
