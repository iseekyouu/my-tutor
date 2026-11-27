# syntax = docker/dockerfile:1

# Та же версия Bun, что и при разработке
ARG BUN_VERSION=1.4.5
FROM oven/bun:${BUN_VERSION}-slim AS base

LABEL fly_launch_runtime="Bun"
WORKDIR /app
ENV NODE_ENV="production"

# Зависимости: только production (react, react-dom) — фронтенд Bun собирает при старте
FROM base AS deps
COPY bun.lock package.json ./
RUN bun install --production --frozen-lockfile

FROM base
COPY --from=deps /app/node_modules ./node_modules
COPY package.json index.html ./
COPY server ./server
COPY src ./src

# База — на постоянном томе Fly (см. [mounts] в fly.toml)
ENV PORT=8080 DB_PATH=/data/data.db
EXPOSE 8080
CMD ["bun", "server/index.ts"]
