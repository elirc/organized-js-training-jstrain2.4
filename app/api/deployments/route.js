import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActor, getTeamRole } from "@/lib/session";
import { canDeployToEnvironment, canPerform } from "@/lib/rbac";
import { createDeployment } from "@/lib/platform-service";

const createDeploymentSchema = z.object({
  applicationId: z.string(),
  environmentId: z.string(),
  commitSha: z.string().optional(),
  commitMessage: z.string().optional(),
  version: z.string().optional(),
  pipelineId: z.string().optional(),
  promotedFromId: z.string().optional(),
});

export async function GET(request) {
  const url = new URL(request.url);
  const applicationId = url.searchParams.get("applicationId");
  const environmentId = url.searchParams.get("environmentId");

  const deployments = await prisma.deployment.findMany({
    where: {
      ...(applicationId ? { applicationId } : {}),
      ...(environmentId ? { environmentId } : {}),
    },
    include: {
      actor: true,
      environment: true,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json(deployments);
}

export async function POST(request) {
  const actor = await getActor(request);
  const payload = await request.json();
  const parsed = createDeploymentSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.issues }, { status: 400 });
  }

  const environment = await prisma.environment.findUnique({
    where: { id: parsed.data.environmentId },
    include: {
      application: {
        include: { team: true },
      },
    },
  });

  if (!environment) {
    return NextResponse.json({ error: "Environment not found" }, { status: 404 });
  }

  const role = await getTeamRole({
    userId: actor?.id,
    teamId: environment.application.teamId,
  });

  if (!canPerform(role, "deploy")) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  if (!canDeployToEnvironment(role, environment.slug)) {
    return NextResponse.json(
      { error: `Role ${role} cannot deploy to ${environment.slug}` },
      { status: 403 },
    );
  }

  if (environment.deployLocked || environment.application.deployFrozen) {
    return NextResponse.json(
      {
        error: "Deploy lock is active",
        lockReason: environment.lockReason || environment.application.freezeReason,
      },
      { status: 423 },
    );
  }

  const deployment = await createDeployment({
    ...parsed.data,
    actorUserId: actor?.id,
  });

  return NextResponse.json(deployment, { status: 201 });
}
