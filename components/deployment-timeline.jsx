"use client";

import dayjs from "dayjs";
import clsx from "clsx";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "@/lib/api";

function statusBadge(status) {
  return `status${status.toLowerCase()}`;
}

export function DeploymentTimeline({
  application,
  selectedEnvironmentId,
  selectedDeploymentId,
  onSelectDeployment,
}) {
  const queryClient = useQueryClient();
  const deployments =
    application?.deployments?.filter((deployment) =>
      selectedEnvironmentId ? deployment.environmentId === selectedEnvironmentId : true,
    ) || [];

  const createDeploy = useMutation({
    mutationFn: (payload) =>
      fetchJson("/api/deployments", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
    },
  });

  const transition = useMutation({
    mutationFn: ({ id, toStatus }) =>
      fetchJson(`/api/deployments/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "transition", toStatus }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
    },
  });

  const rollback = useMutation({
    mutationFn: (id) =>
      fetchJson(`/api/deployments/${id}/rollback`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
    },
  });

  const environment = application?.environments?.find((item) => item.id === selectedEnvironmentId);
  const activePipeline = application?.pipelines?.[0];

  return (
    <section className="panel stack">
      <div className="row space">
        <h2>Deployment Lifecycle</h2>
        <div className="row gap">
          <button
            type="button"
            onClick={() =>
              createDeploy.mutate({
                applicationId: application.id,
                environmentId: selectedEnvironmentId || application.environments[0]?.id,
                pipelineId: activePipeline?.id,
              })
            }
            disabled={createDeploy.isPending || !application?.environments?.length}
          >
            {createDeploy.isPending ? "Deploying..." : "New Deploy"}
          </button>
          <span className="muted">
            {environment
              ? `${environment.slug}${environment.deployLocked ? " (locked)" : ""}`
              : "all environments"}
          </span>
        </div>
      </div>

      <div className="timeline">
        {deployments.map((deployment) => (
          <button
            type="button"
            key={deployment.id}
            className={clsx("timelineItem", selectedDeploymentId === deployment.id && "timelineItemActive")}
            onClick={() => onSelectDeployment(deployment.id)}
          >
            <div className="row space">
              <strong>{deployment.version}</strong>
              <span className={clsx("badge", statusBadge(deployment.status))}>{deployment.status}</span>
            </div>
            <p>{deployment.commitMessage}</p>
            <div className="row space tiny">
              <span>{deployment.environment.slug}</span>
              <span>{dayjs(deployment.startedAt).format("MMM D, HH:mm")}</span>
            </div>
            <div className="row gap">
              {deployment.status === "BUILDING" ? (
                <button
                  type="button"
                  className="tinyButton"
                  onClick={(event) => {
                    event.stopPropagation();
                    transition.mutate({ id: deployment.id, toStatus: "DEPLOYING" });
                  }}
                >
                  mark deploying
                </button>
              ) : null}

              {deployment.status === "DEPLOYING" ? (
                <>
                  <button
                    type="button"
                    className="tinyButton"
                    onClick={(event) => {
                      event.stopPropagation();
                      transition.mutate({ id: deployment.id, toStatus: "LIVE" });
                    }}
                  >
                    mark live
                  </button>
                  <button
                    type="button"
                    className="tinyButton warn"
                    onClick={(event) => {
                      event.stopPropagation();
                      transition.mutate({ id: deployment.id, toStatus: "FAILED" });
                    }}
                  >
                    mark failed
                  </button>
                </>
              ) : null}

              {["FAILED", "LIVE"].includes(deployment.status) ? (
                <button
                  type="button"
                  className="tinyButton"
                  onClick={(event) => {
                    event.stopPropagation();
                    rollback.mutate(deployment.id);
                  }}
                >
                  rollback
                </button>
              ) : null}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
