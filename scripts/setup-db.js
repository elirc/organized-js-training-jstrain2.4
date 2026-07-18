const { execSync } = require("node:child_process");
const { existsSync, unlinkSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

function run(command, options = {}) {
  return execSync(command, {
    stdio: "pipe",
    encoding: "utf8",
    ...options,
  });
}

try {
  const dbPath = join(process.cwd(), "prisma", "dev.db");
  const dbWalPath = `${dbPath}-wal`;
  const dbShmPath = `${dbPath}-shm`;
  [dbPath, dbWalPath, dbShmPath].forEach((path) => {
    if (existsSync(path)) {
      unlinkSync(path);
    }
  });

  process.stdout.write("Generating Prisma client...\n");
  run("npx prisma generate", { stdio: "inherit" });

  process.stdout.write("Building SQL schema from Prisma datamodel...\n");
  const sql = run("npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script");
  const sqlPath = join(process.cwd(), "prisma", "init.sql");
  writeFileSync(sqlPath, sql, "utf8");

  process.stdout.write("Applying SQL schema...\n");
  run("npx prisma db execute --file prisma/init.sql --schema prisma/schema.prisma", { stdio: "inherit" });

  process.stdout.write("Seeding data...\n");
  run("npm run db:seed", { stdio: "inherit" });

  process.stdout.write("Database setup complete.\n");
} catch (error) {
  process.stderr.write(`Database setup failed: ${error.message}\n`);
  process.exit(1);
}
