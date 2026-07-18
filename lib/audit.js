import { prisma } from "@/lib/prisma";

export async function writeAuditEntry({
  organizationId,
  teamId,
  applicationId,
  environmentId,
  actorUserId,
  action,
  entityType,
  entityId,
  details,
}) {
  return prisma.auditLogEntry.create({
    data: {
      organizationId,
      teamId,
      applicationId,
      environmentId,
      actorUserId,
      action,
      entityType,
      entityId,
      detailsJson: details ? JSON.stringify(details) : null,
    },
  });
}
