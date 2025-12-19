# Coffee Shop Demo

This repo is a minimal, production-style Cloudflare Workers app used to learn GitHub Actions CI/CD.
It ships two Workers: an Astro frontend and a Hono API backend, plus shared preview and prod resources.

## Architecture

- **Frontend Worker** (`app-frontend`) - Astro SSR on Cloudflare Workers
- **Backend Worker** (`app-backend`) - Hono API
- **D1** (`DB`) - message storage
- **KV** (`CACHE`) - short-lived message cache
- **R2** (`ASSETS`) - text storage demo
- **Workers AI** (`AI`) - daily special generator (llama-3.3-70b-instruct-fp8-fast)

## Repo layout

```
coffee-shop/
  app-frontend/        # Astro app (Workers runtime)
  app-backend/         # Hono API worker + D1 migrations
  config/              # Local configs and prod examples
  scripts/             # CI config render + setup helpers
  .github/workflows/   # CI/CD pipelines
  docs/README.md       # This file
```

## Quick start (local)

1. Install dependencies:
   ```
   npm install
   ```
2. Configure frontend env:
   ```
   cp app-frontend/.env.local.example app-frontend/.env.local
   ```
3. Run local D1 migrations:
   ```
   npx wrangler d1 migrations apply coffee_shop_local --local --config config/local/backend.wrangler.toml
   ```
4. Start backend:
   ```
   npm run dev:backend
   ```
5. Start frontend (new terminal):
   ```
   npm run dev:frontend
   ```

If the DB schema is missing, the frontend shows a helpful error and logs details in the browser console.

## CI/CD overview (GitHub Actions)

- **CI**: `.github/workflows/ci.yml`
  - Lint, typecheck, unit tests, and frontend build on every push/PR.
- **Preview deploy**: `.github/workflows/deploy-preview.yml`
  - Runs on non-main branches.
  - Deploys to **shared preview** Workers and shared preview D1/KV/R2.
- **Production deploy**: `.github/workflows/deploy-prod.yml`
  - Runs on `main`.
  - Deploys to production Workers and prod D1/KV/R2.

### Worker names and URLs

- **Preview**
  - Frontend: `coffee-shop-frontend-preview` -> `https://coffee-shop-frontend-preview.<subdomain>.workers.dev`
  - Backend: `coffee-shop-backend-preview` -> `https://coffee-shop-backend-preview.<subdomain>.workers.dev`
- **Production**
  - Frontend: `coffee-shop-frontend` -> `https://coffee-shop-frontend.<subdomain>.workers.dev`
  - Backend: `coffee-shop-backend` -> `https://coffee-shop-backend.<subdomain>.workers.dev`

### Version tagging

Deploys use **Workers Versions** so each deploy is tagged with `branch@sha`.
This is visible in Cloudflare Deployments and via:
```
wrangler versions list --name coffee-shop-backend
```

## Cloudflare resources (per environment)

Each environment has its own set of resources:

- **Preview** (shared by all non-main branches)
  - D1 database
  - KV namespace
  - R2 bucket
- **Production**
  - D1 database
  - KV namespace
  - R2 bucket

Only one set per environment, as required.

## Workers AI

The backend exposes `POST /api/ai/special`, backed by the `AI` binding and
model `@cf/meta/llama-3.3-70b-instruct-fp8-fast`. No secrets are committed; the
binding is configured in Wrangler and CI-generated configs.

## Secrets and variables

Set these in GitHub repository settings.

**Variables**
- `CLOUDFLARE_WORKERS_DEV_SUBDOMAIN` (your workers.dev subdomain)

**Secrets**
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN` (Workers + D1 + KV + R2 permissions)
- `COFFEE_BACKEND_D1_DATABASE_ID_PREVIEW`
- `COFFEE_CACHE_KV_NAMESPACE_ID_PREVIEW`
- `COFFEE_ASSETS_R2_BUCKET_NAME_PREVIEW`
- `COFFEE_BACKEND_D1_DATABASE_ID_PROD`
- `COFFEE_CACHE_KV_NAMESPACE_ID_PROD`
- `COFFEE_ASSETS_R2_BUCKET_NAME_PROD`

## One-time setup helper (GitHub CLI)

`scripts/gh-setup.mjs` prompts for all secrets/vars and uses the GitHub CLI to set them.
It **always** checks the authenticated GitHub user is `infinite-toast-labs` before making changes.

```
node scripts/gh-setup.mjs
```

## Prereq checker

```
node scripts/check-prereqs.mjs
```

This validates Node version, local env files, and local Wrangler config.

## Deploy mechanics (generate config at runtime)

CI generates `wrangler.ci.toml` during deploys using:
```
node scripts/render-wrangler-ci.mjs
```

This keeps account-specific IDs out of the repo while still using full Wrangler config support.

## Workers logs

```
npx wrangler tail --name coffee-shop-backend
```

## Optional: Cloudflare Integrated CI/CD

GitHub Actions is the primary CI/CD path for this repo. If you want Cloudflare Build/Deploy instead,
use the same config-rendering approach in your build command and keep secrets in Cloudflare.
