import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActor, getTeamRole } from "@/lib/session";
import { canPerform } from "@/lib/rbac";
import { writeAuditEntry } from "@/lib/audit";

const pipelineUpdateSchema = z.object({
  pipelineId: z.string(),
  stages: z.array(
    z.object({
      id: z.string().optional(),
      name: z.string(),
      stageOrder: z.number().int().positive(),
      requiresApproval: z.boolean().optional(),
      autoRollback: z.boolean().optional(),
      steps: z.array(
        z.object({
          id: z.string().optional(),
          name: z.string(),
          command: z.string(),
          stepOrder: z.number().int().positive(),
          runInParallel: z.boolean().optional(),
          timeoutSeconds: z.number().int().positive().optional(),
        }),
      ),
    }),
  ),
});

export async function GET(request) {
  const url = new URL(request.url);
  const applicationId = url.searchParams.get("applicationId");

  if (!applicationId) {
    return NextResponse.json({ error: "applicationId is required" }, { status: 400 });
  }

  const pipelines = await prisma.pipeline.findMany({
    where: { applicationId },
    include: {
      stages: {
        include: {
          steps: true,
        },
        orderBy: { stageOrder: "asc" },
      },
    },
  });

  return NextResponse.json(pipelines);
}

export async function PATCH(request) {
  const actor = await getActor(request);
  const payload = await request.json();
  const parsed = pipelineUpdateSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.issues }, { status: 400 });
  }

  const pipeline = await prisma.pipeline.findUnique({
    where: { id: parsed.data.pipelineId },
    include: {
      application: true,
      stages: {
        include: { steps: true },
      },
    },
  });

  if (!pipeline) {
    return NextResponse.json({ error: "Pipeline not found" }, { status: 404 });
  }

  const role = await getTeamRole({
    userId: actor?.id,
    teamId: pipeline.application.teamId,
  });

  if (!canPerform(role, "deploy")) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.pipelineStep.deleteMany({
      where: {
        stage: {
          pipelineId: pipeline.id,
        },
      },
    });
    await tx.pipelineStage.deleteMany({
      where: {
        pipelineId: pipeline.id,
      },
    });

    for (const stage of parsed.data.stages) {
      await tx.pipelineStage.create({
        data: {
          pipelineId: pipeline.id,
          name: stage.name,
          stageOrder: stage.stageOrder,
          requiresApproval: stage.requiresApproval ?? false,
          autoRollback: stage.autoRollback ?? true,
          steps: {
            create: stage.steps.map((step) => ({
              name: step.name,
              command: step.command,
              stepOrder: step.stepOrder,
              runInParallel: step.runInParallel ?? false,
              timeoutSeconds: step.timeoutSeconds ?? 600,
            })),
          },
        },
      });
    }
  });

  await writeAuditEntry({
    teamId: pipeline.application.teamId,
    applicationId: pipeline.application.id,
    actorUserId: actor?.id,
    action: "pipeline.updated",
    entityType: "Pipeline",
    entityId: pipeline.id,
    details: {
      stages: parsed.data.stages.length,
    },
  });

  const updatedPipeline = await prisma.pipeline.findUnique({
    where: { id: pipeline.id },
    include: {
      stages: {
        include: { steps: true },
        orderBy: { stageOrder: "asc" },
      },
    },
  });

  return NextResponse.json(updatedPipeline);
}
