import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

const workspaceRoot = process.cwd();
const prismaClientDir = path.join(workspaceRoot, "node_modules", ".prisma", "client");
const clientEntry = path.join(prismaClientDir, "index.js");
const windowsEngine = path.join(prismaClientDir, "query_engine-windows.dll.node");

for (const file of [".env", ".env.local", ".env.vercel.pull"]) {
  const envPath = path.join(workspaceRoot, file);
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false, quiet: true });
  }
}

if (!process.env.DIRECT_URL && process.env.DATABASE_URL) {
  process.env.DIRECT_URL = process.env.DATABASE_URL;
}

const prismaCli = path.join(workspaceRoot, "node_modules", "prisma", "build", "index.js");

const result = spawnSync(process.execPath, [prismaCli, "generate"], {
  cwd: workspaceRoot,
  env: process.env,
  encoding: "utf8",
});

if (result.stdout) {
  process.stdout.write(result.stdout);
}

if (result.stderr) {
  process.stderr.write(result.stderr);
}

if (result.status === 0) {
  process.exit(0);
}

const stderr = [result.stderr, result.stdout].filter(Boolean).join("\n");
const hasLockedWindowsEngineError =
  process.platform === "win32" &&
  /EPERM: operation not permitted, rename/i.test(stderr) &&
  /query_engine-windows\.dll\.node/i.test(stderr);

const hasExistingGeneratedClient = fs.existsSync(clientEntry) && fs.existsSync(windowsEngine);

if (hasLockedWindowsEngineError && hasExistingGeneratedClient) {
  console.warn("\n[build] Prisma generate hit a locked Windows engine file. Reusing the existing generated client and continuing.\n");
  process.exit(0);
}

process.exit(result.status ?? 1);
