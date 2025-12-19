#!/usr/bin/env node
import { execSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const requiredUser = "infinite-toast-labs";

const run = (command) =>
  execSync(command, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();

const ensureGh = () => {
  try {
    run("gh --version");
  } catch (error) {
    console.error("GitHub CLI not found. Install it first: https://cli.github.com/");
    process.exit(1);
  }
};

const main = async () => {
  ensureGh();

  let login = "";
  try {
    login = run("gh api user --jq .login");
  } catch (error) {
    console.error("Unable to read GitHub auth state. Run `gh auth login` first.");
    process.exit(1);
  }

  console.log(`Authenticated GitHub user: ${login}`);
  if (login !== requiredUser) {
    console.error(
      `Refusing to continue. Expected GitHub user '${requiredUser}', got '${login}'.`,
    );
    process.exit(1);
  }

  const rl = createInterface({ input, output });
  const confirmation = await rl.question(
    `Type "${requiredUser}" to confirm you want to update repo secrets/vars: `,
  );
  if (confirmation.trim() !== requiredUser) {
    rl.close();
    console.error("Confirmation failed. Exiting without changes.");
    process.exit(1);
  }

  let repo = "";
  try {
    repo = run("gh repo view --json nameWithOwner --jq .nameWithOwner");
  } catch (error) {
    console.error("Unable to resolve current repo. Use gh auth and run inside the repo.");
    rl.close();
    process.exit(1);
  }

  const repoInput = await rl.question(`Repo [${repo}]: `);
  const repoName = repoInput.trim() || repo;

  const promptValue = async (label) => {
    const value = await rl.question(`${label}: `);
    return value.trim();
  };

  const setSecret = (name, value) => {
    if (!value) {
      console.log(`Skipping secret ${name} (empty).`);
      return;
    }
    console.log(`Setting secret ${name}...`);
    execSync(`gh secret set ${name} --repo ${repoName} --body ${JSON.stringify(value)}`);
  };

  const setVar = (name, value) => {
    if (!value) {
      console.log(`Skipping variable ${name} (empty).`);
      return;
    }
    console.log(`Setting variable ${name}...`);
    execSync(`gh variable set ${name} --repo ${repoName} --body ${JSON.stringify(value)}`);
  };

  console.log("\nCloudflare auth");
  setSecret("CLOUDFLARE_ACCOUNT_ID", await promptValue("CLOUDFLARE_ACCOUNT_ID"));
  setSecret("CLOUDFLARE_API_TOKEN", await promptValue("CLOUDFLARE_API_TOKEN"));

  console.log("\nWorkers dev subdomain");
  setVar(
    "CLOUDFLARE_WORKERS_DEV_SUBDOMAIN",
    await promptValue("CLOUDFLARE_WORKERS_DEV_SUBDOMAIN"),
  );

  console.log("\nPreview resources");
  setSecret(
    "COFFEE_BACKEND_D1_DATABASE_ID_PREVIEW",
    await promptValue("COFFEE_BACKEND_D1_DATABASE_ID_PREVIEW"),
  );
  setSecret(
    "COFFEE_CACHE_KV_NAMESPACE_ID_PREVIEW",
    await promptValue("COFFEE_CACHE_KV_NAMESPACE_ID_PREVIEW"),
  );
  setSecret(
    "COFFEE_ASSETS_R2_BUCKET_NAME_PREVIEW",
    await promptValue("COFFEE_ASSETS_R2_BUCKET_NAME_PREVIEW"),
  );

  console.log("\nProduction resources");
  setSecret(
    "COFFEE_BACKEND_D1_DATABASE_ID_PROD",
    await promptValue("COFFEE_BACKEND_D1_DATABASE_ID_PROD"),
  );
  setSecret(
    "COFFEE_CACHE_KV_NAMESPACE_ID_PROD",
    await promptValue("COFFEE_CACHE_KV_NAMESPACE_ID_PROD"),
  );
  setSecret(
    "COFFEE_ASSETS_R2_BUCKET_NAME_PROD",
    await promptValue("COFFEE_ASSETS_R2_BUCKET_NAME_PROD"),
  );

  rl.close();
  console.log("\nGitHub repo secrets/vars updated.");
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
