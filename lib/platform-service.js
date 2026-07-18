import { prisma } from "@/lib/prisma";
import { writeAuditEntry } from "@/lib/audit";
import { canTransitionStatus, nextPatchVersion } from "@/lib/deployments";

export async function loadApplicationContext(applicationId) {
  return prisma.application.findUnique({
    where: { id: applicationId },
    include: {
      team: true,
      environments: true,
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
    },
  });
}

export async function createDeployment({
  applicationId,
  environmentId,
  actorUserId,
  commitSha,
  commitMessage,
  version,
  pipelineId,
  promotedFromId,
}) {
  const existingDeployments = await prisma.deployment.findMany({
    where: { applicationId },
    select: { version: true },
  });
  const resolvedVersion =
    version || nextPatchVersion(existingDeployments.map((deployment) => deployment.version));

  const deployment = await prisma.deployment.create({
    data: {
      applicationId,
      environmentId,
      actorUserId,
      pipelineId,
      status: "BUILDING",
      version: resolvedVersion,
      commitSha: commitSha || Math.random().toString(16).slice(2, 9),
      commitMessage: commitMessage || "Manual deploy",
      promotedFromId,
      diffSummary: "Pending build diff",
    },
  });

  await writeAuditEntry({
    applicationId,
    environmentId,
    actorUserId,
    action: "deployment.started",
    entityType: "Deployment",
    entityId: deployment.id,
    details: {
      status: deployment.status,
      version: deployment.version,
    },
  });

  return deployment;
}

export async function transitionDeployment({ deploymentId, toStatus, actorUserId }) {
  const deployment = await prisma.deployment.findUnique({
    where: { id: deploymentId },
  });

  if (!deployment) {
    throw new Error("Deployment not found");
  }

  if (!canTransitionStatus(deployment.status, toStatus)) {
    throw new Error(`Invalid transition ${deployment.status} -> ${toStatus}`);
  }

  const updated = await prisma.deployment.update({
    where: { id: deploymentId },
    data: {
      status: toStatus,
      completedAt: ["LIVE", "FAILED", "ROLLED_BACK"].includes(toStatus) ? new Date() : null,
    },
  });

  await writeAuditEntry({
    applicationId: deployment.applicationId,
    environmentId: deployment.environmentId,
    actorUserId,
    action: "deployment.status_changed",
    entityType: "Deployment",
    entityId: deploymentId,
    details: {
      from: deployment.status,
      to: toStatus,
    },
  });

  return updated;
}

export async function rollbackDeployment({ deploymentId, actorUserId }) {
  const deployment = await prisma.deployment.findUnique({
    where: { id: deploymentId },
  });

  if (!deployment) {
    throw new Error("Deployment not found");
  }

  const rollback = await prisma.deployment.create({
    data: {
      applicationId: deployment.applicationId,
      environmentId: deployment.environmentId,
      pipelineId: deployment.pipelineId,
      actorUserId,
      version: deployment.version,
      commitSha: deployment.commitSha,
      commitMessage: `Rollback to ${deployment.version}`,
      status: "ROLLED_BACK",
      rollbackOfId: deploymentId,
      diffSummary: `Rollback created from deployment ${deploymentId}`,
      completedAt: new Date(),
    },
  });

  await writeAuditEntry({
    applicationId: deployment.applicationId,
    environmentId: deployment.environmentId,
    actorUserId,
    action: "deployment.rollback",
    entityType: "Deployment",
    entityId: rollback.id,
    details: {
      rollbackOf: deploymentId,
    },
  });

  return rollback;
}

export async function listDeploymentLogs({
  deploymentId,
  severity,
  keyword,
  from,
  to,
  take = 1000,
}) {
  const where = {
    deploymentId,
    ...(severity ? { severity } : {}),
    ...(keyword
      ? {
          message: {
            contains: keyword,
          },
        }
      : {}),
    ...(from || to
      ? {
          timestamp: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(to) } : {}),
          },
        }
      : {}),
  };

  return prisma.deploymentLog.findMany({
    where,
    orderBy: { timestamp: "asc" },
    take,
  });
}
