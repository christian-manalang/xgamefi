FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN apt-get update -y && apt-get install -y openssl curl \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.12.1 --activate
WORKDIR /app

# Copy dependency manifests first for better layer caching.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json ./apps/web/
COPY apps/worker/package.json ./apps/worker/
COPY packages/config/package.json ./packages/config/
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile

# Copy source and generate the Prisma client.
COPY . .
# Re-run install after the full workspace source is present so pnpm's isolated
# linker creates correct symlinks for workspace package dependencies.
RUN pnpm install --frozen-lockfile
RUN pnpm db:generate

# ---------------------------------------------------------------------------
# Web: Next.js 16 storefront and API (dev mode to avoid static-generation
# issues with request-scoped modules during production builds).
# ---------------------------------------------------------------------------
FROM base AS web
EXPOSE 3000
ENV NODE_ENV=development
CMD ["pnpm", "--filter", "@xgamefi/web", "dev"]

# ---------------------------------------------------------------------------
# Worker: BullMQ queue consumers.
# ---------------------------------------------------------------------------
FROM base AS worker
ENV NODE_ENV=production
CMD ["pnpm", "--filter", "@xgamefi/worker", "start"]

# ---------------------------------------------------------------------------
# DB migrations and seed (one-off targets).
# ---------------------------------------------------------------------------
FROM base AS migrate
ENV NODE_ENV=production
CMD ["pnpm", "--filter", "@xgamefi/db", "exec", "prisma", "migrate", "deploy"]

FROM base AS seed
ENV NODE_ENV=production
CMD ["pnpm", "db:seed"]
