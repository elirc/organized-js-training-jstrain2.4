import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { maskedSecret } from "@/lib/deployments";

export async function GET(request) {
  const url = new URL(request.url);
  const appId = url.searchParams.get("appId");

  const appFilter = appId ? { id: appId } : undefined;

  const organization = await prisma.organization.findFirst({
    include: {
      teams: {
        include: {
          members: {
            include: {
              user: true,
            },
          },
          applications: {
            ...(appFilter ? { where: appFilter } : {}),
            include: {
              environments: {
                include: {
                  variables: {
                    orderBy: { key: "asc" },
                  },
                },
                orderBy: { createdAt: "asc" },
              },
              domains: true,
              pipelines: {
                include: {
                  stages: {
                    include: {
                      steps: true,
                    },
                    orderBy: { stageOrder: "asc" },
                  },
                },
              },
              deployments: {
                orderBy: { createdAt: "desc" },
                take: 50,
                include: {
                  actor: true,
                  environment: true,
                },
              },
              metrics: {
                orderBy: { timestamp: "desc" },
                take: 200,
              },
              alertRules: true,
              alerts: {
                orderBy: { triggeredAt: "desc" },
                take: 20,
                include: {
                  alertRule: true,
                },
              },
              featureFlags: {
                include: {
                  rules: true,
                  dependencies: {
                    include: {
                      dependsOnFlag: true,
                    },
                  },
                },
              },
              segments: true,
              secrets: {
                include: {
                  versions: {
                    orderBy: {
                      version: "desc",
                    },
                  },
                  usages: true,
                },
              },
              incidents: {
                orderBy: { startedAt: "desc" },
              },
              auditLogs: {
                orderBy: { createdAt: "desc" },
                take: 100,
                include: {
                  actor: true,
                },
              },
            },
          },
        },
      },
      auditLogs: {
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          actor: true,
        },
      },
    },
  });

  if (!organization) {
    return NextResponse.json({ error: "No seed data found. Run npm run db:seed." }, { status: 404 });
  }

  const maskedOrganization = {
    ...organization,
    teams: organization.teams.map((team) => ({
      ...team,
      applications: team.applications.map((application) => ({
        ...application,
        environments: application.environments.map((environment) => ({
          ...environment,
          variables: environment.variables.map((variable) => ({
            ...variable,
            maskedValue: variable.isSecret ? maskedSecret(variable.value) : variable.value,
            value: variable.isSecret ? undefined : variable.value,
          })),
        })),
        secrets: application.secrets.map((secret) => ({
          ...secret,
          encryptedValue: undefined,
          maskedValue: maskedSecret(secret.key),
          versions: secret.versions.map((version) => ({
            ...version,
            encryptedValue: undefined,
          })),
        })),
      })),
    })),
  };

  return NextResponse.json(maskedOrganization);
}
