import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const envSchema = z.object({
  environmentId: z.string(),
  key: z.string(),
  value: z.string(),
  isSecret: z.boolean().optional(),
});

export async function GET(request) {
  const url = new URL(request.url);
  const environmentId = url.searchParams.get("environmentId");

  if (!environmentId) {
    return NextResponse.json({ error: "environmentId is required" }, { status: 400 });
  }

  const variables = await prisma.environmentVariable.findMany({
    where: { environmentId },
    orderBy: { key: "asc" },
  });

  return NextResponse.json({
    command: "platform env list",
    variables: variables.map((item) => ({
      ...item,
      value: item.isSecret ? "[masked]" : item.value,
    })),
  });
}

export async function POST(request) {
  const payload = await request.json();
  const parsed = envSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.issues }, { status: 400 });
  }

  const variable = await prisma.environmentVariable.upsert({
    where: {
      environmentId_key: {
        environmentId: parsed.data.environmentId,
        key: parsed.data.key,
      },
    },
    update: {
      value: parsed.data.value,
      isSecret: parsed.data.isSecret ?? false,
    },
    create: {
      environmentId: parsed.data.environmentId,
      key: parsed.data.key,
      value: parsed.data.value,
      isSecret: parsed.data.isSecret ?? false,
    },
  });

  return NextResponse.json({
    command: "platform env set",
    variable: {
      ...variable,
      value: variable.isSecret ? "[masked]" : variable.value,
    },
  });
}
