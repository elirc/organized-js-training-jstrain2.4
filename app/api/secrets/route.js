import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActor, getTeamRole } from "@/lib/session";
import { canPerform } from "@/lib/rbac";
import { writeAuditEntry } from "@/lib/audit";
import { encryptSecret } from "@/lib/secrets";

const createSecretSchema = z.object({
  applicationId: z.string(),
  key: z.string().min(2),
  value: z.string().min(1),
  description: z.string().optional(),
  rotationIntervalDays: z.number().int().positive().optional(),
});

const rotateSecretSchema = z.object({
  id: z.string(),
  value: z.string().min(1),
});

function maskEncryptedSecret(encryptedValue) {
  const preview = encryptedValue.slice(0, 8);
  return `${preview}${"*".repeat(12)}`;
}

export async function GET(request) {
  const url = new URL(request.url);
  const applicationId = url.searchParams.get("applicationId");

  if (!applicationId) {
    return NextResponse.json({ error: "applicationId is required" }, { status: 400 });
  }

  const secrets = await prisma.secret.findMany({
    where: { applicationId },
    include: {
      versions: {
        orderBy: { version: "desc" },
      },
      usages: {
        include: {
          environment: true,
        },
      },
    },
    orderBy: { key: "asc" },
  });

  return NextResponse.json(
    secrets.map((secret) => ({
      ...secret,
      encryptedValue: undefined,
      maskedValue: maskEncryptedSecret(secret.versions[0]?.encryptedValue || secret.key),
      versions: secret.versions.map((version) => ({
        ...version,
        encryptedValue: undefined,
      })),
    })),
  );
}

export async function POST(request) {
  const actor = await getActor(request);
  const payload = await request.json();
  const parsed = createSecretSchema.safeParse(payload);

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

  if (!canPerform(role, "editSecrets")) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const encryptedValue = encryptSecret(parsed.data.value);
  const secret = await prisma.secret.create({
    data: {
      applicationId: parsed.data.applicationId,
      key: parsed.data.key,
      encryptedValue,
      description: parsed.data.description,
      rotationIntervalDays: parsed.data.rotationIntervalDays || 30,
      lastRotatedAt: new Date(),
      versions: {
        create: {
          version: 1,
          encryptedValue,
          createdById: actor?.id,
        },
      },
    },
    include: {
      versions: true,
    },
  });

  await writeAuditEntry({
    teamId: application.teamId,
    applicationId: application.id,
    actorUserId: actor?.id,
    action: "secret.created",
    entityType: "Secret",
    entityId: secret.id,
    details: { key: secret.key },
  });

  return NextResponse.json(
    {
      ...secret,
      encryptedValue: undefined,
      maskedValue: maskEncryptedSecret(secret.versions[0].encryptedValue),
    },
    { status: 201 },
  );
}

export async function PATCH(request) {
  const actor = await getActor(request);
  const payload = await request.json();
  const parsed = rotateSecretSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.issues }, { status: 400 });
  }

  const existing = await prisma.secret.findUnique({
    where: { id: parsed.data.id },
    include: {
      application: true,
      versions: {
        orderBy: { version: "desc" },
        take: 1,
      },
    },
  });

  if (!existing) {
    return NextResponse.json({ error: "Secret not found" }, { status: 404 });
  }

  const role = await getTeamRole({
    userId: actor?.id,
    teamId: existing.application.teamId,
  });

  if (!canPerform(role, "editSecrets")) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const nextVersion = (existing.versions[0]?.version || 0) + 1;
  const encryptedValue = encryptSecret(parsed.data.value);

  const updated = await prisma.secret.update({
    where: { id: existing.id },
    data: {
      encryptedValue,
      lastRotatedAt: new Date(),
      versions: {
        create: {
          version: nextVersion,
          encryptedValue,
          createdById: actor?.id,
        },
      },
    },
    include: {
      versions: {
        orderBy: { version: "desc" },
      },
    },
  });

  await writeAuditEntry({
    teamId: existing.application.teamId,
    applicationId: existing.application.id,
    actorUserId: actor?.id,
    action: "secret.rotated",
    entityType: "Secret",
    entityId: existing.id,
    details: { version: nextVersion },
  });

  return NextResponse.json({
    ...updated,
    encryptedValue: undefined,
    maskedValue: maskEncryptedSecret(updated.versions[0].encryptedValue),
    versions: updated.versions.map((version) => ({
      ...version,
      encryptedValue: undefined,
    })),
  });
}
