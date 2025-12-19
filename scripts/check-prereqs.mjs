#!/usr/bin/env node
import { existsSync } from "node:fs";
import { join } from "node:path";

const failures = [];
const warnings = [];

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (Number.isNaN(nodeMajor) || nodeMajor < 20) {
  failures.push(`Node.js 20+ required (found ${process.versions.node}).`);
}

const frontendEnv = join("app-frontend", ".env.local");
if (!existsSync(frontendEnv)) {
  warnings.push(
    `Missing ${frontendEnv}. Copy from app-frontend/.env.local.example for local dev.`,
  );
}

const backendConfig = join("config", "local", "backend.wrangler.toml");
if (!existsSync(backendConfig)) {
  failures.push(`Missing ${backendConfig}. This file is required for wrangler dev.`);
}

const wranglerBin = join("node_modules", ".bin", "wrangler");
if (!existsSync(wranglerBin)) {
  warnings.push("Wrangler not installed. Run npm install from the repo root.");
}

if (warnings.length > 0) {
  console.warn("Prereq warnings:");
  warnings.forEach((warning) => console.warn(`- ${warning}`));
}

if (failures.length > 0) {
  console.error("Prereq failures:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Prereq check passed.");
