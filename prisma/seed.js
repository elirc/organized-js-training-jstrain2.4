const dayjs = require("dayjs");
const { createCipheriv, createHash, randomBytes } = require("node:crypto");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const SEED_ENCRYPTION_KEY = process.env.SECRET_ENCRYPTION_KEY || "development-key-change-me";

function encryptSecret(value) {
  const key = createHash("sha256").update(SEED_ENCRYPTION_KEY).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

function randomInRange(min, max) {
  return Math.random() * (max - min) + min;
}

function pickSeverity(index) {
  if (index % 17 === 0) return "ERROR";
  if (index % 7 === 0) return "WARN";
  if (index % 3 === 0) return "DEBUG";
  return "INFO";
}

async function resetDatabase() {
  await prisma.auditLogEntry.deleteMany();
  await prisma.incident.deleteMany();
  await prisma.secretUsage.deleteMany();
  await prisma.secretVersion.deleteMany();
  await prisma.secret.deleteMany();
  await prisma.flagDependency.deleteMany();
  await prisma.flagRule.deleteMany();
  await prisma.flagSegment.deleteMany();
  await prisma.featureFlag.deleteMany();
  await prisma.alert.deleteMany();
  await prisma.alertRule.deleteMany();
  await prisma.monitoringMetric.deleteMany();
  await prisma.deploymentLog.deleteMany();
  await prisma.deployment.deleteMany();
  await prisma.domain.deleteMany();
  await prisma.pipelineStep.deleteMany();
  await prisma.pipelineStage.deleteMany();
  await prisma.pipeline.deleteMany();
  await prisma.environmentVariable.deleteMany();
  await prisma.environment.deleteMany();
  await prisma.application.deleteMany();
  await prisma.teamMember.deleteMany();
  await prisma.user.deleteMany();
  await prisma.team.deleteMany();
  await prisma.organization.deleteMany();
}

async function seed() {
  await resetDatabase();

  const organization = await prisma.organization.create({
    data: { name: "Acme Platform" },
  });

  const owner = await prisma.user.create({
    data: { name: "Ari Owner", email: "owner@acme.dev", ssoProvider: "okta" },
  });
  const deployer = await prisma.user.create({
    data: { name: "Devon Deployer", email: "deployer@acme.dev", ssoProvider: "okta" },
  });
  const viewer = await prisma.user.create({
    data: { name: "Vee Viewer", email: "viewer@acme.dev", ssoProvider: "okta" },
  });

  const team = await prisma.team.create({
    data: {
      name: "Platform Team",
      organizationId: organization.id,
    },
  });

  await prisma.teamMember.createMany({
    data: [
      { teamId: team.id, userId: owner.id, role: "OWNER" },
      { teamId: team.id, userId: deployer.id, role: "DEPLOYER" },
      { teamId: team.id, userId: viewer.id, role: "VIEWER" },
    ],
  });

  const app = await prisma.application.create({
    data: {
      teamId: team.id,
      name: "payments-service",
      repoUrl: "https://github.com/acme/payments-service",
      buildCommand: "npm run build",
      startCommand: "npm run start",
    },
  });

  await prisma.application.create({
    data: {
      teamId: team.id,
      name: "billing-worker",
      repoUrl: "https://github.com/acme/billing-worker",
      buildCommand: "npm run build",
      startCommand: "npm run start",
      deployFrozen: true,
      freezeReason: "Quarterly close code freeze",
    },
  });

  const [devEnv, stagingEnv, prodEnv] = await Promise.all([
    prisma.environment.create({
      data: { applicationId: app.id, name: "Development", slug: "dev", type: "DEV" },
    }),
    prisma.environment.create({
      data: { applicationId: app.id, name: "Staging", slug: "staging", type: "STAGING" },
    }),
    prisma.environment.create({
      data: {
        applicationId: app.id,
        name: "Production",
        slug: "production",
        type: "PRODUCTION",
        deployLocked: true,
        lockReason: "Code freeze for finance reporting",
      },
    }),
  ]);

  await prisma.environmentVariable.createMany({
    data: [
      { environmentId: devEnv.id, key: "NODE_ENV", value: "development", isSecret: false },
      { environmentId: devEnv.id, key: "API_BASE_URL", value: "https://dev.api.acme.dev", isSecret: false },
      { environmentId: devEnv.id, key: "DATABASE_URL", value: "postgres://dev-db", isSecret: true },
      { environmentId: stagingEnv.id, key: "NODE_ENV", value: "staging", isSecret: false },
      { environmentId: stagingEnv.id, key: "API_BASE_URL", value: "https://staging.api.acme.dev", isSecret: false },
      { environmentId: stagingEnv.id, key: "DATABASE_URL", value: "postgres://staging-db", isSecret: true },
      { environmentId: prodEnv.id, key: "NODE_ENV", value: "production", isSecret: false },
      { environmentId: prodEnv.id, key: "API_BASE_URL", value: "https://api.acme.dev", isSecret: false },
      { environmentId: prodEnv.id, key: "DATABASE_URL", value: "postgres://prod-db", isSecret: true },
    ],
  });

  const pipeline = await prisma.pipeline.create({
    data: {
      applicationId: app.id,
      name: "Default Pipeline",
      stages: {
        create: [
          {
            name: "Build",
            stageOrder: 1,
            autoRollback: true,
            steps: {
              create: [
                { name: "Install deps", command: "npm ci", stepOrder: 1 },
                { name: "Compile", command: "npm run build", stepOrder: 2 },
              ],
            },
          },
          {
            name: "Test",
            stageOrder: 2,
            autoRollback: true,
            steps: {
              create: [
                { name: "Unit tests", command: "npm run test:unit", stepOrder: 1, runInParallel: true },
                { name: "Integration tests", command: "npm run test:int", stepOrder: 2, runInParallel: true },
              ],
            },
          },
          {
            name: "Staging",
            stageOrder: 3,
            autoRollback: true,
            steps: {
              create: [{ name: "Deploy staging", command: "platform deploy --env staging", stepOrder: 1 }],
            },
          },
          {
            name: "Production",
            stageOrder: 4,
            requiresApproval: true,
            autoRollback: true,
            steps: {
              create: [{ name: "Deploy production", command: "platform deploy --env production", stepOrder: 1 }],
            },
          },
        ],
      },
    },
    include: { stages: true },
  });

  await prisma.domain.createMany({
    data: [
      { applicationId: app.id, host: "payments.acme.dev", verified: true, sslEnabled: true },
      { applicationId: app.id, host: "payments.internal.acme.dev", verified: true, sslEnabled: true },
    ],
  });

  const deploymentA = await prisma.deployment.create({
    data: {
      applicationId: app.id,
      environmentId: prodEnv.id,
      pipelineId: pipeline.id,
      actorUserId: owner.id,
      version: "v1.7.2",
      commitSha: "6f3a88a",
      commitMessage: "Improve payment retry jitter",
      status: "LIVE",
      diffSummary: "5 files changed, +124 -31",
      startedAt: dayjs().subtract(3, "day").toDate(),
      completedAt: dayjs().subtract(3, "day").add(9, "minute").toDate(),
    },
  });

  const deploymentB = await prisma.deployment.create({
    data: {
      applicationId: app.id,
      environmentId: stagingEnv.id,
      pipelineId: pipeline.id,
      actorUserId: deployer.id,
      version: "v1.8.0",
      commitSha: "889fa10",
      commitMessage: "Add progressive checkout flow",
      status: "LIVE",
      diffSummary: "12 files changed, +408 -66",
      startedAt: dayjs().subtract(2, "day").toDate(),
      completedAt: dayjs().subtract(2, "day").add(11, "minute").toDate(),
    },
  });

  const deploymentC = await prisma.deployment.create({
    data: {
      applicationId: app.id,
      environmentId: prodEnv.id,
      pipelineId: pipeline.id,
      actorUserId: deployer.id,
      version: "v1.8.0",
      commitSha: "889fa10",
      commitMessage: "Promote staging release to production",
      status: "FAILED",
      diffSummary: "Promoted from staging deployment",
      promotedFromId: deploymentB.id,
      startedAt: dayjs().subtract(1, "day").toDate(),
      completedAt: dayjs().subtract(1, "day").add(8, "minute").toDate(),
    },
  });

  const deploymentD = await prisma.deployment.create({
    data: {
      applicationId: app.id,
      environmentId: prodEnv.id,
      pipelineId: pipeline.id,
      actorUserId: owner.id,
      version: "v1.7.2",
      commitSha: "6f3a88a",
      commitMessage: "Rollback after 5xx spike",
      status: "ROLLED_BACK",
      rollbackOfId: deploymentC.id,
      diffSummary: "Rollback to stable release",
      startedAt: dayjs().subtract(1, "day").add(15, "minute").toDate(),
      completedAt: dayjs().subtract(1, "day").add(21, "minute").toDate(),
    },
  });

  const deploymentE = await prisma.deployment.create({
    data: {
      applicationId: app.id,
      environmentId: devEnv.id,
      pipelineId: pipeline.id,
      actorUserId: deployer.id,
      version: "v1.8.1",
      commitSha: "b71ca28",
      commitMessage: "Improve webhook retries and telemetry tags",
      status: "BUILDING",
      diffSummary: "7 files changed, +192 -43",
      startedAt: dayjs().subtract(20, "minute").toDate(),
    },
  });

  const deployments = [deploymentA, deploymentB, deploymentC, deploymentD, deploymentE];

  const logs = [];
  deployments.forEach((deployment, deploymentIndex) => {
    const count = deployment.status === "BUILDING" ? 420 : 160;
    for (let index = 0; index < count; index += 1) {
      logs.push({
        deploymentId: deployment.id,
        service: deploymentIndex % 2 === 0 ? "api" : "worker",
        severity: pickSeverity(index),
        message: `[${deployment.version}] step=${(index % 6) + 1} run=${index} status=${
          index % 17 === 0 ? "retrying" : "ok"
        }`,
        timestamp: dayjs(deployment.startedAt).add(index * 7, "second").toDate(),
      });
    }
  });

  for (let i = 0; i < logs.length; i += 250) {
    // Keep batch sizes smaller for sqlite seed speed.
    await prisma.deploymentLog.createMany({
      data: logs.slice(i, i + 250),
    });
  }

  const metrics = [];
  for (let index = 0; index < 96; index += 1) {
    const timestamp = dayjs().subtract(95 - index, "hour").toDate();
    metrics.push({
      applicationId: app.id,
      environmentId: prodEnv.id,
      timestamp,
      uptimePct: randomInRange(99.1, 100),
      responseTimeMs: randomInRange(150, 470),
      errorRatePct: randomInRange(0.1, 6),
      cpuPct: randomInRange(25, 78),
      memoryMb: randomInRange(490, 1450),
    });
  }

  await prisma.monitoringMetric.createMany({ data: metrics });

  const highErrorRule = await prisma.alertRule.create({
    data: {
      applicationId: app.id,
      name: "High Error Rate",
      metric: "errorRatePct",
      condition: "GT",
      threshold: 5,
      durationMinutes: 5,
    },
  });

  await prisma.alert.create({
    data: {
      applicationId: app.id,
      alertRuleId: highErrorRule.id,
      message: "Error rate > 5% for 8 minutes in production",
      status: "OPEN",
      triggeredAt: dayjs().subtract(37, "minute").toDate(),
    },
  });

  const segment = await prisma.flagSegment.create({
    data: {
      applicationId: app.id,
      name: "beta-customers",
      criteriaJson: JSON.stringify({ plan: ["enterprise", "pro"], region: ["us-east-1"] }),
    },
  });

  const flagA = await prisma.featureFlag.create({
    data: {
      applicationId: app.id,
      key: "checkout_redesign",
      type: "BOOLEAN",
      description: "Enable new checkout UI",
      defaultValue: "false",
    },
  });

  const flagB = await prisma.featureFlag.create({
    data: {
      applicationId: app.id,
      key: "retry_strategy",
      type: "JSON",
      description: "Retry strategy for payment providers",
      defaultValue: JSON.stringify({ maxRetries: 3, backoffMs: 250 }),
    },
  });

  await prisma.flagRule.createMany({
    data: [
      {
        featureFlagId: flagA.id,
        environmentId: stagingEnv.id,
        segmentId: segment.id,
        rolloutPct: 40,
        value: "true",
      },
      {
        featureFlagId: flagA.id,
        environmentId: prodEnv.id,
        rolloutPct: 10,
        value: "true",
      },
      {
        featureFlagId: flagB.id,
        environmentId: prodEnv.id,
        rolloutPct: 100,
        value: JSON.stringify({ maxRetries: 4, backoffMs: 300 }),
      },
    ],
  });

  await prisma.flagDependency.create({
    data: {
      featureFlagId: flagB.id,
      dependsOnFlagId: flagA.id,
    },
  });

  const encryptedDbUrl = encryptSecret("postgres://prod-primary-url");
  const secret = await prisma.secret.create({
    data: {
      applicationId: app.id,
      key: "DATABASE_URL",
      encryptedValue: encryptedDbUrl,
      description: "Primary production database connection string",
      rotationIntervalDays: 30,
      lastRotatedAt: dayjs().subtract(12, "day").toDate(),
    },
  });

  await prisma.secretVersion.createMany({
    data: [
      {
        secretId: secret.id,
        version: 1,
        encryptedValue: encryptSecret("postgres://old-primary-url"),
        createdById: owner.id,
        createdAt: dayjs().subtract(43, "day").toDate(),
      },
      {
        secretId: secret.id,
        version: 2,
        encryptedValue: encryptedDbUrl,
        createdById: owner.id,
        createdAt: dayjs().subtract(12, "day").toDate(),
      },
    ],
  });

  await prisma.secretUsage.create({
    data: {
      secretId: secret.id,
      applicationId: app.id,
      environmentId: prodEnv.id,
      serviceName: "payments-api",
    },
  });

  await prisma.incident.create({
    data: {
      applicationId: app.id,
      deploymentId: deploymentC.id,
      title: "Checkout latency and 502 burst",
      status: "RESOLVED",
      startedAt: dayjs().subtract(1, "day").add(3, "minute").toDate(),
      resolvedAt: dayjs().subtract(1, "day").add(29, "minute").toDate(),
      timelineJson: JSON.stringify([
        { at: dayjs().subtract(1, "day").add(3, "minute").toISOString(), event: "Alert triggered" },
        { at: dayjs().subtract(1, "day").add(9, "minute").toISOString(), event: "Incident declared" },
        { at: dayjs().subtract(1, "day").add(15, "minute").toISOString(), event: "Rollback initiated" },
        { at: dayjs().subtract(1, "day").add(29, "minute").toISOString(), event: "Resolved after rollback" },
      ]),
    },
  });

  await prisma.auditLogEntry.createMany({
    data: [
      {
        organizationId: organization.id,
        teamId: team.id,
        applicationId: app.id,
        environmentId: prodEnv.id,
        actorUserId: deployer.id,
        action: "deployment.started",
        entityType: "Deployment",
        entityId: deploymentC.id,
        detailsJson: JSON.stringify({ version: deploymentC.version, status: "DEPLOYING" }),
        createdAt: dayjs().subtract(1, "day").toDate(),
      },
      {
        organizationId: organization.id,
        teamId: team.id,
        applicationId: app.id,
        environmentId: prodEnv.id,
        actorUserId: owner.id,
        action: "deployment.rollback",
        entityType: "Deployment",
        entityId: deploymentD.id,
        detailsJson: JSON.stringify({ rollbackOf: deploymentC.id }),
        createdAt: dayjs().subtract(1, "day").add(15, "minute").toDate(),
      },
      {
        organizationId: organization.id,
        teamId: team.id,
        applicationId: app.id,
        environmentId: prodEnv.id,
        actorUserId: owner.id,
        action: "secret.rotated",
        entityType: "Secret",
        entityId: secret.id,
        detailsJson: JSON.stringify({ key: secret.key, version: 2 }),
        createdAt: dayjs().subtract(12, "day").toDate(),
      },
      {
        organizationId: organization.id,
        teamId: team.id,
        applicationId: app.id,
        environmentId: stagingEnv.id,
        actorUserId: deployer.id,
        action: "feature_flag.updated",
        entityType: "FeatureFlag",
        entityId: flagA.id,
        detailsJson: JSON.stringify({ rolloutPct: 40 }),
        createdAt: dayjs().subtract(4, "hour").toDate(),
      },
    ],
  });

  console.log("Seeded internal platform sample data.");
}

seed()
  .catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
