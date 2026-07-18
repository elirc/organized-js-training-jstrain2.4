# Guide: prisma/schema.prisma

## Purpose

This is the single source of truth for the entire database structure. Every table, every column, every relationship, and every constraint is defined here. When you run `prisma generate`, Prisma reads this file and creates JavaScript functions that match these tables exactly. Think of it as the blueprint for all the data in the application.

## Line-by-Line Walkthrough

### Lines 1-8: Configuration
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}
```
- `generator client` — tells Prisma to generate a JavaScript client library. This is what creates the `prisma.application.findMany()` functions you use in code.
- `datasource db` — says "we're using SQLite, and the database file location is stored in the `DATABASE_URL` environment variable." In production, you'd change `provider` to `"postgresql"`.
- `env("DATABASE_URL")` — reads from the `.env` file. Currently `"file:./dev.db"`, meaning a local SQLite file.

### Lines 10-53: Enums
```prisma
enum UserRole {
  OWNER
  DEPLOYER
  VIEWER
}

enum DeploymentStatus {
  BUILDING
  DEPLOYING
  LIVE
  FAILED
  ROLLED_BACK
}
```
Enums are like a dropdown menu for a database column — the value MUST be one of these options. You can't accidentally set a deployment status to "BANANA".

**Why each enum exists:**
- `UserRole` — three permission levels for team members
- `DeploymentStatus` — the states in the deployment state machine
- `EnvironmentType` — DEV, STAGING, PRODUCTION (affects permission rules)
- `LogSeverity` — standard log levels (DEBUG, INFO, WARN, ERROR)
- `IncidentStatus` — OPEN or RESOLVED
- `AlertCondition` — comparison operators (GT = greater than, LT = less than, etc.)
- `FeatureFlagType` — what kind of value the flag holds

### Lines 55-62: Organization Model
```prisma
model Organization {
  id        String          @id @default(uuid())
  name      String
  createdAt DateTime        @default(now())
  updatedAt DateTime        @updatedAt
  teams     Team[]
  auditLogs AuditLogEntry[]
}
```
This is the top of the hierarchy. An organization has many teams.

- `@id` — this column is the primary key (unique identifier for each row)
- `@default(uuid())` — automatically generates a UUID when a new row is created
- `@default(now())` — automatically sets the current timestamp
- `@updatedAt` — Prisma automatically updates this whenever the row changes
- `Team[]` — one organization has many teams (one-to-many relationship)

### Lines 64-76: Team Model
```prisma
model Team {
  id             String          @id @default(uuid())
  name           String
  organizationId String
  organization   Organization    @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  members        TeamMember[]
  applications   Application[]

  @@unique([organizationId, name])
}
```
- `organizationId` — foreign key linking to Organization
- `@relation(...)` — tells Prisma how this table connects to Organization
- `onDelete: Cascade` — if the organization is deleted, all its teams are deleted too
- `@@unique([organizationId, name])` — compound unique constraint: no two teams in the same org can have the same name

### Lines 78-102: User and TeamMember Models
Users exist independently. `TeamMember` is a **join table** — it connects Users to Teams and adds a `role` column. This is a many-to-many relationship: one user can be on many teams, and one team can have many users.

```prisma
model TeamMember {
  teamId String
  userId String
  role   UserRole @default(VIEWER)

  @@unique([teamId, userId])  // A user can only be on a team once
}
```

### Lines 104-129: Application Model
The core entity. Applications belong to teams and have many child objects: environments, deployments, pipelines, feature flags, secrets, etc.

```prisma
model Application {
  deployFrozen Boolean @default(false)
  freezeReason String?
```
- `deployFrozen` — a boolean flag to prevent ALL deployments (e.g., during a code freeze)
- `String?` — the `?` means this field is nullable (can be null)

### Lines 131-163: Environment and EnvironmentVariable
Environments (dev, staging, production) are per-application. Each environment has its own set of key-value configuration variables.

```prisma
model Environment {
  deployLocked Boolean @default(false)
  @@unique([applicationId, slug])  // One "dev" per app, not two
}

model EnvironmentVariable {
  isSecret Boolean @default(false)
  @@unique([environmentId, key])   // One "DATABASE_URL" per environment
}
```

### Lines 165-216: Pipeline, PipelineStage, PipelineStep, Domain
Pipelines model the CI/CD process as a graph. A pipeline has ordered stages, and each stage has ordered steps. The `@@unique` constraints prevent duplicate orderings.

```prisma
model PipelineStage {
  stageOrder       Int
  requiresApproval Boolean @default(false)  // Human must approve before proceeding
  autoRollback     Boolean @default(false)  // Automatically roll back on failure
  @@unique([pipelineId, stageOrder])
}
```

### Lines 218-259: Deployment and DeploymentLog
The deployment model is the most complex, with self-referential relationships:

```prisma
model Deployment {
  rollbackOfId   String?
  promotedFromId String?
  rollbackOf     Deployment? @relation("DeploymentRollback", ...)
  promotedFrom   Deployment? @relation("DeploymentPromotion", ...)
```
- A deployment can be a **rollback of** another deployment (self-referential)
- A deployment can be **promoted from** a staging deployment
- These are named relations because a table can't have two anonymous relations to itself

### Lines 261-302: Monitoring, Alerts
```prisma
model MonitoringMetric {
  uptimePct      Float
  responseTimeMs Float
  errorRatePct   Float
  cpuPct         Float
  memoryMb       Float
  @@index([applicationId, timestamp])  // Fast time-series queries
}
```
The `@@index` is crucial — without it, querying "all metrics for app X in the last 24 hours" would scan every row in the table.

### Lines 304-358: FeatureFlag, FlagRule, FlagSegment, FlagDependency
Feature flags have a sophisticated model:
- **FlagRule** — per-environment overrides with rollout percentages
- **FlagSegment** — user segments (e.g., "beta customers") stored as JSON criteria
- **FlagDependency** — flag B can depend on flag A (B can only be enabled if A is enabled)

### Lines 360-434: Secret, SecretVersion, SecretUsage, Incident, AuditLogEntry
- **SecretVersion** — every time a secret is rotated, the old value is kept as a version (for rollback)
- **SecretUsage** — tracks which services use which secrets (impact analysis)
- **AuditLogEntry** — the most flexible model, with optional foreign keys to nearly every other table

## Concepts Taught
- **Data modeling** — designing tables and relationships to represent real-world concepts
- **Primary keys and foreign keys** — how rows reference each other across tables
- **One-to-many and many-to-many relationships** — the fundamental relationship types
- **Compound unique constraints** — preventing duplicates across column combinations
- **Database indexes** — speeding up common query patterns
- **Self-referential relationships** — a table that references itself
- **Cascading deletes** — automatic cleanup of child records
- **Nullable fields** — when data is optional
- **Enums as domain constraints** — restricting values to a valid set

## Common Mistakes
- Forgetting to run `prisma generate` after changing the schema — your code will use stale types
- Not adding `@@index` on columns you frequently query — performance degrades silently as data grows
- Using `onDelete: Cascade` carelessly — deleting an organization deletes EVERYTHING underneath it
- Confusing the Prisma relation field (`organization Organization`) with the foreign key column (`organizationId String`) — the relation field doesn't create a column, it's just Prisma metadata

## Mini Exercises
1. If you wanted to add a `description` field to the `Team` model, what would the line look like? Should it be nullable?
2. What would happen if you deleted an `Application` record? List every table that would be affected by the cascade.
3. Why does `DeploymentLog` have `@@index([deploymentId, timestamp])` but `Domain` doesn't have an index on `applicationId`? (Hint: think about query frequency and data volume.)

## Further Reading
- Search: "prisma schema reference"
- Search: "database normalization explained"
- Search: "database indexing explained simply"
