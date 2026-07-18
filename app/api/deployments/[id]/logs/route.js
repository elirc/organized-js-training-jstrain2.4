import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { listDeploymentLogs } from "@/lib/platform-service";

export async function GET(request, { params }) {
  const url = new URL(request.url);
  const severity = url.searchParams.get("severity");
  const keyword = url.searchParams.get("keyword");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const take = Number.parseInt(url.searchParams.get("take") || "1200", 10);
  const download = url.searchParams.get("download") === "1";

  const deployment = await prisma.deployment.findUnique({
    where: { id: params.id },
  });

  if (!deployment) {
    return NextResponse.json({ error: "Deployment not found" }, { status: 404 });
  }

  const logs = await listDeploymentLogs({
    deploymentId: params.id,
    severity,
    keyword,
    from,
    to,
    take: Number.isNaN(take) ? 1200 : Math.min(take, 5000),
  });

  if (download) {
    const body = logs
      .map((entry) => `${entry.timestamp.toISOString()} [${entry.severity}] (${entry.service}) ${entry.message}`)
      .join("\n");
    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename=\"deployment-${params.id}-logs.txt\"`,
      },
    });
  }

  return NextResponse.json(logs);
}
