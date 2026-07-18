import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActor, getTeamRole } from "@/lib/session";
import { canDeployToEnvironment, canPerform } from "@/lib/rbac";
import { transitionDeployment } from "@/lib/platform-service";

const transitionSchema = z.object({
  action: z.literal("transition"),
  toStatus: z.enum(["BUILDING", "DEPLOYING", "LIVE", "FAILED", "ROLLED_BACK"]),
});

export async function GET(_request, { params }) {
  const deployment = await prisma.deployment.findUnique({
    where: { id: params.id },
    include: {
      actor: true,
      environment: true,
      pipeline: {
        include: {
          stages: {
            include: { steps: true },
            orderBy: { stageOrder: "asc" },
          },
        },
      },
    },
  });

  if (!deployment) {
    return NextResponse.json({ error: "Deployment not found" }, { status: 404 });
  }

  return NextResponse.json(deployment);
}

export async function PATCH(request, { params }) {
  const actor = await getActor(request);
  const payload = await request.json();
  const parsed = transitionSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.issues }, { status: 400 });
  }

  const deployment = await prisma.deployment.findUnique({
    where: { id: params.id },
    include: {
      application: {
        include: { team: true },
      },
      environment: true,
    },
  });

  if (!deployment) {
    return NextResponse.json({ error: "Deployment not found" }, { status: 404 });
  }

  const role = await getTeamRole({
    userId: actor?.id,
    teamId: deployment.application.teamId,
  });

  if (!canPerform(role, "deploy")) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  if (!canDeployToEnvironment(role, deployment.environment.slug)) {
    return NextResponse.json({ error: "Environment deploy permission denied" }, { status: 403 });
  }

  const updated = await transitionDeployment({
    deploymentId: deployment.id,
    toStatus: parsed.data.toStatus,
    actorUserId: actor?.id,
  });

  return NextResponse.json(updated);
}
