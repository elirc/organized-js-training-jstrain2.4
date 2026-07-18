import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  const deployment = await prisma.deployment.findUnique({
    where: { id: params.id },
    include: {
      logs: {
        orderBy: { timestamp: "asc" },
        take: 300,
      },
    },
  });

  if (!deployment) {
    return new Response("Deployment not found", { status: 404 });
  }

  const encoder = new TextEncoder();
  const logs = [...deployment.logs];
  let cursor = 0;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event, payload) => {
        controller.enqueue(encoder.encode(`event: ${event}\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      send("ready", {
        deploymentId: deployment.id,
        status: deployment.status,
      });

      const interval = setInterval(async () => {
        if (cursor < logs.length) {
          send("log", logs[cursor]);
          cursor += 1;
          return;
        }

        if (deployment.status === "BUILDING" || deployment.status === "DEPLOYING") {
          const synthetic = {
            id: `synthetic-${Date.now()}`,
            deploymentId: deployment.id,
            service: "builder",
            severity: Math.random() < 0.85 ? "INFO" : "WARN",
            message: `streamed build output chunk ${cursor + 1}`,
            timestamp: new Date().toISOString(),
          };
          send("log", synthetic);
          return;
        }

        send("end", { done: true });
        clearInterval(interval);
        controller.close();
      }, 300);

      request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
