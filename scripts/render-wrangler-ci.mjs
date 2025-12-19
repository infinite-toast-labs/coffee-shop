#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const usage = () => {
  console.error(
    [
      "Usage:",
      "  render-wrangler-ci.mjs <backend|frontend> <outputPath> [options]",
      "",
      "Options:",
      "  --name <workerName>                    (required)",
      "  --compatibility-date <YYYY-MM-DD>      (required)",
      "  --workers-dev <true|false>             (default: true)",
      "",
      "Backend options:",
      "  --app-origin <url>                     (required)",
      "  --api-origin <url>                     (required)",
      "  --d1-database-id <id>                  (required)",
      "  --kv-namespace-id <id>                 (required)",
      "  --r2-bucket-name <name>                (required)",
    ].join("\n"),
  );
};

const parseArgs = (argv) => {
  const args = [...argv];
  const out = { _: [] };
  while (args.length) {
    const token = args.shift();
    if (!token) break;
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const value = args.shift();
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for --${key}`);
      }
      out[key] = value;
    } else {
      out._.push(token);
    }
  }
  return out;
};

const mustGet = (obj, key) => {
  const value = obj[key];
  if (!value) throw new Error(`Missing required option: --${key}`);
  return value;
};

const parseBool = (raw, defaultValue) => {
  if (raw === undefined) return defaultValue;
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new Error(`Invalid boolean value: ${raw} (expected true|false)`);
};

const tomlString = (value) => JSON.stringify(value);

const main = () => {
  const args = parseArgs(process.argv.slice(2));
  const [target, outputPath] = args._;

  if (!target || !outputPath || (target !== "backend" && target !== "frontend")) {
    usage();
    process.exit(1);
  }

  const name = mustGet(args, "name");
  const compatibilityDate = mustGet(args, "compatibility-date");
  const workersDev = parseBool(args["workers-dev"], true);

  if (target === "backend") {
    const appOrigin = mustGet(args, "app-origin");
    const apiOrigin = mustGet(args, "api-origin");
    const d1DatabaseId = mustGet(args, "d1-database-id");
    const kvNamespaceId = mustGet(args, "kv-namespace-id");
    const r2BucketName = mustGet(args, "r2-bucket-name");

    const toml = [
      `name = ${tomlString(name)}`,
      `main = ${tomlString("./src/index.ts")}`,
      `compatibility_date = ${tomlString(compatibilityDate)}`,
      `workers_dev = ${workersDev ? "true" : "false"}`,
      `ai = { binding = "AI" }`,
      "",
      "[vars]",
      `APP_ORIGIN = ${tomlString(appOrigin)}`,
      `API_ORIGIN = ${tomlString(apiOrigin)}`,
      "",
      "[[d1_databases]]",
      `binding = ${tomlString("DB")}`,
      `database_name = ${tomlString("coffee_shop")}`,
      `database_id = ${tomlString(d1DatabaseId)}`,
      `migrations_dir = ${tomlString("./migrations")}`,
      "",
      "[[r2_buckets]]",
      `binding = ${tomlString("ASSETS")}`,
      `bucket_name = ${tomlString(r2BucketName)}`,
      `preview_bucket_name = ${tomlString(r2BucketName)}`,
      "",
      "[[kv_namespaces]]",
      `binding = ${tomlString("CACHE")}`,
      `id = ${tomlString(kvNamespaceId)}`,
      `preview_id = ${tomlString(kvNamespaceId)}`,
      "",
    ].join("\n");

    writeFileSync(resolve(outputPath), toml, "utf-8");
    return;
  }

  const toml = [
    `name = ${tomlString(name)}`,
    `main = ${tomlString("./dist/_worker.js/index.js")}`,
    `compatibility_date = ${tomlString(compatibilityDate)}`,
    `compatibility_flags = ${tomlString(["nodejs_compat"])}`,
    `workers_dev = ${workersDev ? "true" : "false"}`,
    "",
    "[assets]",
    `directory = ${tomlString("./dist")}`,
    `binding = ${tomlString("ASSETS")}`,
    "",
  ].join("\n");

  writeFileSync(resolve(outputPath), toml, "utf-8");
};

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  usage();
  process.exit(1);
}
