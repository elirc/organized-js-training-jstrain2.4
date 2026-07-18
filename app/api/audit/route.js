import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request) {
  const url = new URL(request.url);
  const applicationId = url.searchParams.get("applicationId");
  const action = url.searchParams.get("action");
  const actorUserId = url.searchParams.get("actorUserId");
  const download = url.searchParams.get("download") === "1";

  const entries = await prisma.auditLogEntry.findMany({
    where: {
      ...(applicationId ? { applicationId } : {}),
      ...(action ? { action } : {}),
      ...(actorUserId ? { actorUserId } : {}),
    },
    include: {
      actor: true,
    },
    orderBy: { createdAt: "desc" },
    take: 300,
  });

  if (download) {
    const body = entries
      .map(
        (entry) =>
          `${entry.createdAt.toISOString()} ${entry.actor?.email || "system"} ${entry.action} ${entry.entityType} ${
            entry.entityId
          }`,
      )
      .join("\n");

    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": "attachment; filename=\"audit-log.txt\"",
      },
    });
  }

  return NextResponse.json(entries);
}
