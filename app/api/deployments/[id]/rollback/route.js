import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActor, getTeamRole } from "@/lib/session";
import { canDeployToEnvironment, canPerform } from "@/lib/rbac";
import { rollbackDeployment } from "@/lib/platform-service";

export async function POST(request, { params }) {
  const actor = await getActor(request);

  const deployment = await prisma.deployment.findUnique({
    where: { id: params.id },
    include: {
      application: true,
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

  if (!canPerform(role, "rollback")) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  if (!canDeployToEnvironment(role, deployment.environment.slug)) {
    return NextResponse.json({ error: "Cannot rollback this environment" }, { status: 403 });
  }

  const rollback = await rollbackDeployment({
    deploymentId: deployment.id,
    actorUserId: actor?.id,
  });

  return NextResponse.json(rollback, { status: 201 });
}
