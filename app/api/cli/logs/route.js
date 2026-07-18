import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { listDeploymentLogs } from "@/lib/platform-service";

export async function GET(request) {
  const url = new URL(request.url);
  const deploymentId = url.searchParams.get("deploymentId");
  const severity = url.searchParams.get("severity");
  const keyword = url.searchParams.get("keyword");
  const tail = Number.parseInt(url.searchParams.get("tail") || "200", 10);

  if (!deploymentId) {
    return NextResponse.json({ error: "deploymentId is required" }, { status: 400 });
  }

  const deployment = await prisma.deployment.findUnique({
    where: { id: deploymentId },
  });

  if (!deployment) {
    return NextResponse.json({ error: "Deployment not found" }, { status: 404 });
  }

  const logs = await listDeploymentLogs({
    deploymentId,
    severity,
    keyword,
    take: Number.isNaN(tail) ? 200 : Math.min(tail, 2000),
  });

  return NextResponse.json({
    command: "platform logs",
    deploymentId,
    logs,
  });
}
