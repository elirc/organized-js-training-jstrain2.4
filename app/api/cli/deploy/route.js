import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createDeployment } from "@/lib/platform-service";

const cliDeploySchema = z.object({
  applicationId: z.string(),
  environment: z.string(),
  commitSha: z.string().optional(),
  commitMessage: z.string().optional(),
});

export async function POST(request) {
  const payload = await request.json();
  const parsed = cliDeploySchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.issues }, { status: 400 });
  }

  const environment = await prisma.environment.findFirst({
    where: {
      applicationId: parsed.data.applicationId,
      slug: parsed.data.environment,
    },
  });

  if (!environment) {
    return NextResponse.json({ error: "Environment not found" }, { status: 404 });
  }

  if (environment.deployLocked) {
    return NextResponse.json({ error: "Environment deploy lock is active" }, { status: 423 });
  }

  const deployment = await createDeployment({
    applicationId: parsed.data.applicationId,
    environmentId: environment.id,
    commitSha: parsed.data.commitSha,
    commitMessage: parsed.data.commitMessage || "CLI deploy",
  });

  return NextResponse.json({
    command: "platform deploy",
    deploymentId: deployment.id,
    status: deployment.status,
    version: deployment.version,
  });
}
