import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActor, getTeamRole } from "@/lib/session";
import { canPerform } from "@/lib/rbac";
import { writeAuditEntry } from "@/lib/audit";

const updateEnvSchema = z.object({
  id: z.string(),
  deployLocked: z.boolean().optional(),
  lockReason: z.string().nullable().optional(),
  variables: z
    .array(
      z.object({
        key: z.string(),
        value: z.string(),
        isSecret: z.boolean().optional(),
      }),
    )
    .optional(),
});

export async function GET(request) {
  const url = new URL(request.url);
  const applicationId = url.searchParams.get("applicationId");

  const environments = await prisma.environment.findMany({
    where: {
      ...(applicationId ? { applicationId } : {}),
    },
    include: {
      variables: {
        orderBy: { key: "asc" },
      },
      deployments: {
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });

  return NextResponse.json(environments);
}

export async function PATCH(request) {
  const actor = await getActor(request);
  const payload = await request.json();
  const parsed = updateEnvSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.issues }, { status: 400 });
  }

  const existing = await prisma.environment.findUnique({
    where: { id: parsed.data.id },
    include: {
      application: true,
      variables: true,
    },
  });

  if (!existing) {
    return NextResponse.json({ error: "Environment not found" }, { status: 404 });
  }

  const role = await getTeamRole({
    userId: actor?.id,
    teamId: existing.application.teamId,
  });

  if (!canPerform(role, "lockDeploys")) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const updatedEnvironment = await prisma.environment.update({
    where: { id: existing.id },
    data: {
      ...(parsed.data.deployLocked !== undefined ? { deployLocked: parsed.data.deployLocked } : {}),
      ...(parsed.data.lockReason !== undefined ? { lockReason: parsed.data.lockReason } : {}),
    },
  });

  if (parsed.data.variables) {
    for (const variable of parsed.data.variables) {
      await prisma.environmentVariable.upsert({
        where: {
          environmentId_key: {
            environmentId: existing.id,
            key: variable.key,
          },
        },
        update: {
          value: variable.value,
          isSecret: variable.isSecret ?? false,
        },
        create: {
          environmentId: existing.id,
          key: variable.key,
          value: variable.value,
          isSecret: variable.isSecret ?? false,
        },
      });
    }
  }

  await writeAuditEntry({
    teamId: existing.application.teamId,
    applicationId: existing.application.id,
    environmentId: existing.id,
    actorUserId: actor?.id,
    action: "environment.updated",
    entityType: "Environment",
    entityId: existing.id,
    details: parsed.data,
  });

  const response = await prisma.environment.findUnique({
    where: { id: updatedEnvironment.id },
    include: {
      variables: true,
    },
  });

  return NextResponse.json(response);
}
