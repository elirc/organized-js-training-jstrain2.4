import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActor, getTeamRole } from "@/lib/session";
import { canPerform } from "@/lib/rbac";
import { writeAuditEntry } from "@/lib/audit";

const createFlagSchema = z.object({
  applicationId: z.string(),
  key: z.string().min(2),
  type: z.enum(["BOOLEAN", "STRING", "JSON"]),
  defaultValue: z.string(),
  description: z.string().optional(),
});

const updateFlagSchema = z.object({
  id: z.string(),
  enabled: z.boolean().optional(),
  killSwitch: z.boolean().optional(),
  defaultValue: z.string().optional(),
});

export async function GET(request) {
  const url = new URL(request.url);
  const applicationId = url.searchParams.get("applicationId");

  if (!applicationId) {
    return NextResponse.json({ error: "applicationId is required" }, { status: 400 });
  }

  const flags = await prisma.featureFlag.findMany({
    where: { applicationId },
    include: {
      rules: {
        include: {
          environment: true,
          segment: true,
        },
      },
      dependencies: {
        include: {
          dependsOnFlag: true,
        },
      },
    },
    orderBy: { key: "asc" },
  });

  return NextResponse.json(flags);
}

export async function POST(request) {
  const actor = await getActor(request);
  const payload = await request.json();
  const parsed = createFlagSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.issues }, { status: 400 });
  }

  const application = await prisma.application.findUnique({
    where: { id: parsed.data.applicationId },
  });

  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  const role = await getTeamRole({
    userId: actor?.id,
    teamId: application.teamId,
  });

  if (!canPerform(role, "editFlags")) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const created = await prisma.featureFlag.create({
    data: parsed.data,
  });

  await writeAuditEntry({
    teamId: application.teamId,
    applicationId: application.id,
    actorUserId: actor?.id,
    action: "feature_flag.created",
    entityType: "FeatureFlag",
    entityId: created.id,
    details: { key: created.key },
  });

  return NextResponse.json(created, { status: 201 });
}

export async function PATCH(request) {
  const actor = await getActor(request);
  const payload = await request.json();
  const parsed = updateFlagSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.issues }, { status: 400 });
  }

  const existing = await prisma.featureFlag.findUnique({
    where: { id: parsed.data.id },
    include: {
      application: true,
      dependencies: {
        include: {
          dependsOnFlag: true,
        },
      },
    },
  });

  if (!existing) {
    return NextResponse.json({ error: "Feature flag not found" }, { status: 404 });
  }

  const role = await getTeamRole({
    userId: actor?.id,
    teamId: existing.application.teamId,
  });

  if (!canPerform(role, "editFlags")) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  if (parsed.data.enabled === true) {
    const blockedByDependency = existing.dependencies.find((dependency) => !dependency.dependsOnFlag.enabled);
    if (blockedByDependency) {
      return NextResponse.json(
        {
          error: `Dependency not enabled: ${blockedByDependency.dependsOnFlag.key}`,
        },
        { status: 409 },
      );
    }
  }

  const updated = await prisma.featureFlag.update({
    where: { id: existing.id },
    data: {
      ...(parsed.data.enabled !== undefined ? { enabled: parsed.data.enabled } : {}),
      ...(parsed.data.killSwitch !== undefined ? { killSwitch: parsed.data.killSwitch } : {}),
      ...(parsed.data.defaultValue !== undefined ? { defaultValue: parsed.data.defaultValue } : {}),
    },
  });

  await writeAuditEntry({
    teamId: existing.application.teamId,
    applicationId: existing.applicationId,
    actorUserId: actor?.id,
    action: "feature_flag.updated",
    entityType: "FeatureFlag",
    entityId: updated.id,
    details: parsed.data,
  });

  return NextResponse.json(updated);
}
