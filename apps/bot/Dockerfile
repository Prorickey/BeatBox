FROM oven/bun:1-alpine AS build
WORKDIR /app

COPY package.json bun.lock turbo.json ./
COPY apps/bot/package.json apps/bot/
COPY apps/dashboard/package.json apps/dashboard/
COPY packages/database/package.json packages/database/
COPY packages/shared/package.json packages/shared/

RUN bun install --frozen-lockfile

COPY packages/database packages/database
COPY packages/shared packages/shared
COPY apps/bot apps/bot

RUN bun run db:generate

CMD ["bun", "apps/bot/src/index.ts"]
