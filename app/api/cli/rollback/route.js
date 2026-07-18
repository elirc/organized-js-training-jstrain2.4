import { NextResponse } from "next/server";
import { z } from "zod";
import { rollbackDeployment } from "@/lib/platform-service";

const rollbackSchema = z.object({
  deploymentId: z.string(),
});

export async function POST(request) {
  const payload = await request.json();
  const parsed = rollbackSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.issues }, { status: 400 });
  }

  const deployment = await rollbackDeployment({
    deploymentId: parsed.data.deploymentId,
  });

  return NextResponse.json({
    command: "platform rollback",
    rollbackDeploymentId: deployment.id,
    status: deployment.status,
  });
}
