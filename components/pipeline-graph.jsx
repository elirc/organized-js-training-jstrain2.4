"use client";

import { useMemo, useState } from "react";
import ReactFlow, { Background, Controls } from "reactflow";
import "reactflow/dist/style.css";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "@/lib/api";

export function PipelineGraph({ application }) {
  const queryClient = useQueryClient();
  const pipeline = application?.pipelines?.[0];
  const [draftStages, setDraftStages] = useState([]);

  const nodesAndEdges = useMemo(() => {
    if (!pipeline) {
      return { nodes: [], edges: [] };
    }

    const nodes = [];
    const edges = [];

    pipeline.stages
      .slice()
      .sort((a, b) => a.stageOrder - b.stageOrder)
      .forEach((stage, stageIndex) => {
        nodes.push({
          id: stage.id,
          position: { x: stageIndex * 290, y: 20 },
          data: {
            label: `${stage.name}${stage.requiresApproval ? " (approval)" : ""}`,
          },
          style: {
            background: "#132336",
            color: "#f4f6f9",
            border: "1px solid #476487",
            borderRadius: "10px",
            width: 220,
            minHeight: 72,
          },
        });

        stage.steps
          .slice()
          .sort((a, b) => a.stepOrder - b.stepOrder)
          .forEach((step, stepIndex) => {
            const stepId = `${stage.id}-${step.id}`;
            nodes.push({
              id: stepId,
              position: { x: stageIndex * 290, y: 130 + stepIndex * 95 },
              data: {
                label: `${step.name}: ${step.command}`,
              },
              style: {
                background: "#0e1b2b",
                color: "#dce8f8",
                border: "1px solid #365172",
                borderRadius: "8px",
                width: 220,
                minHeight: 56,
                fontSize: 12,
              },
            });

            edges.push({
              id: `edge-${stage.id}-${stepId}`,
              source: stage.id,
              target: stepId,
            });
          });

        if (stageIndex > 0) {
          edges.push({
            id: `stage-edge-${pipeline.stages[stageIndex - 1].id}-${stage.id}`,
            source: pipeline.stages[stageIndex - 1].id,
            target: stage.id,
            animated: true,
          });
        }
      });

    return { nodes, edges };
  }, [pipeline]);

  const savePipeline = useMutation({
    mutationFn: (payload) =>
      fetchJson("/api/pipelines", {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      setDraftStages([]);
    },
  });

  const editableStages = draftStages.length
    ? draftStages
    : (pipeline?.stages || [])
        .slice()
        .sort((a, b) => a.stageOrder - b.stageOrder)
        .map((stage) => ({
          id: stage.id,
          name: stage.name,
          stageOrder: stage.stageOrder,
          requiresApproval: stage.requiresApproval,
          autoRollback: stage.autoRollback,
          steps: stage.steps
            .slice()
            .sort((a, b) => a.stepOrder - b.stepOrder)
            .map((step) => ({
              id: step.id,
              name: step.name,
              command: step.command,
              stepOrder: step.stepOrder,
              runInParallel: step.runInParallel,
              timeoutSeconds: step.timeoutSeconds,
            })),
        }));

  return (
    <section className="panel stack">
      <div className="row space">
        <h2>Pipeline DAG</h2>
        <span className="muted">{pipeline ? pipeline.name : "No pipeline configured"}</span>
      </div>

      <div className="flowWrap">
        <ReactFlow nodes={nodesAndEdges.nodes} edges={nodesAndEdges.edges} fitView nodesDraggable={false}>
          <Background color="#1f3854" gap={18} />
          <Controls />
        </ReactFlow>
      </div>

      {pipeline ? (
        <div className="stack">
          <h3>Quick Edit Stage Names</h3>
          {editableStages.map((stage, index) => (
            <div className="row gap" key={stage.id || stage.stageOrder}>
              <input
                value={stage.name}
                onChange={(event) => {
                  setDraftStages((current) => {
                    const source = current.length ? current : editableStages;
                    const next = [...source];
                    next[index] = {
                      ...next[index],
                      name: event.target.value,
                    };
                    return next;
                  });
                }}
              />
              <label className="row tiny gap">
                <input
                  type="checkbox"
                  checked={stage.requiresApproval}
                  onChange={(event) => {
                    setDraftStages((current) => {
                      const source = current.length ? current : editableStages;
                      const next = [...source];
                      next[index] = {
                        ...next[index],
                        requiresApproval: event.target.checked,
                      };
                      return next;
                    });
                  }}
                />
                approval
              </label>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              savePipeline.mutate({
                pipelineId: pipeline.id,
                stages: editableStages,
              })
            }
            disabled={savePipeline.isPending}
          >
            {savePipeline.isPending ? "Saving..." : "Save Pipeline"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
