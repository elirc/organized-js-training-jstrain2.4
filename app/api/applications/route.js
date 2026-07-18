import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActor, getTeamRole } from "@/lib/session";
import { canPerform } from "@/lib/rbac";
import { writeAuditEntry } from "@/lib/audit";

const createAppSchema = z.object({
  teamId: z.string(),
  name: z.string().min(2),
  repoUrl: z.string().url(),
  buildCommand: z.string().default("npm run build"),
  startCommand: z.string().default("npm run start"),
});

export async function GET() {
  const applications = await prisma.application.findMany({
    include: {
      team: true,
      environments: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(applications);
}

export async function POST(request) {
  const actor = await getActor(request);
  const payload = await request.json();
  const parsed = createAppSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid payload",
        details: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const { teamId, name, repoUrl, buildCommand, startCommand } = parsed.data;

  const role = await getTeamRole({ userId: actor?.id, teamId });

  if (!canPerform(role, "deploy")) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const application = await prisma.application.create({
    data: {
      teamId,
      name,
      repoUrl,
      buildCommand,
      startCommand,
      environments: {
        create: [
          { name: "Development", slug: "dev", type: "DEV" },
          { name: "Staging", slug: "staging", type: "STAGING" },
          { name: "Production", slug: "production", type: "PRODUCTION" },
        ],
      },
      pipelines: {
        create: {
          name: "Default Pipeline",
          stages: {
            create: [
              {
                name: "Build",
                stageOrder: 1,
                steps: {
                  create: [{ name: "Build app", command: buildCommand, stepOrder: 1 }],
                },
              },
              {
                name: "Test",
                stageOrder: 2,
                steps: {
                  create: [{ name: "Run tests", command: "npm run test", stepOrder: 1 }],
                },
              },
              {
                name: "Deploy",
                stageOrder: 3,
                requiresApproval: true,
                steps: {
                  create: [{ name: "Start app", command: startCommand, stepOrder: 1 }],
                },
              },
            ],
          },
        },
      },
    },
    include: {
      environments: true,
      pipelines: {
        include: {
          stages: {
            include: { steps: true },
            orderBy: { stageOrder: "asc" },
          },
        },
      },
    },
  });

  await writeAuditEntry({
    teamId,
    applicationId: application.id,
    actorUserId: actor?.id,
    action: "application.created",
    entityType: "Application",
    entityId: application.id,
    details: { name, repoUrl },
  });

  return NextResponse.json(application, { status: 201 });
}
