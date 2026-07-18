import { prisma } from "@/lib/prisma";

export async function getActor(request) {
  const emailHeader = request.headers.get("x-user-email");
  const email = emailHeader || "owner@acme.dev";

  const actor = await prisma.user.findUnique({
    where: { email },
  });

  if (actor) {
    return actor;
  }

  return prisma.user.findFirst({
    orderBy: { createdAt: "asc" },
  });
}

export async function getTeamRole({ userId, teamId }) {
  if (!userId || !teamId) {
    return "VIEWER";
  }

  const member = await prisma.teamMember.findUnique({
    where: {
      teamId_userId: {
        teamId,
        userId,
      },
    },
  });

  return member?.role ?? "VIEWER";
}
