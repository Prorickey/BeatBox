FROM oven/bun:1-alpine AS deps
WORKDIR /app

COPY package.json bun.lock turbo.json ./
COPY apps/bot/package.json apps/bot/
COPY apps/dashboard/package.json apps/dashboard/
COPY packages/database/package.json packages/database/
COPY packages/shared/package.json packages/shared/

RUN bun install --frozen-lockfile

FROM oven/bun:1-alpine AS build
WORKDIR /app

COPY --from=deps /app .
COPY packages/database packages/database
COPY packages/shared packages/shared
COPY apps/dashboard apps/dashboard

RUN bun run db:generate

ARG NEXT_PUBLIC_SOCKET_URL
ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN cd apps/dashboard && bun run build

FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app/apps/dashboard/.next/standalone ./
COPY --from=build /app/apps/dashboard/.next/static ./apps/dashboard/.next/static

EXPOSE 3000
CMD ["node", "apps/dashboard/server.js"]
