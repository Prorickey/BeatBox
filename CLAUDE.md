# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Beatbox is a Discord music bot with a web dashboard. It's a Turborepo monorepo with Bun as the package manager and runtime.

## Architecture

### Monorepo Structure

- **`apps/bot`** — Discord bot (Bun + Discord.js + Kazagumo/Shoukaku for Lavalink + Socket.io server)
- **`apps/dashboard`** — Web dashboard (Next.js 15 App Router + Tailwind + shadcn/ui + Socket.io client)
- **`packages/database`** — Shared Prisma schema and client (PostgreSQL)
- **`packages/shared`** — Shared types, Socket.io event definitions, constants, and utilities

### Key Data Flow

1. Bot connects to Discord and a Lavalink node for audio processing
2. Bot runs a Socket.io server (default port 3001) for real-time dashboard communication
3. Dashboard authenticates via Discord OAuth (NextAuth) and connects to the bot's Socket.io server
4. All player state changes (from Discord commands or dashboard actions) broadcast via Socket.io to keep both in sync
5. Socket event names and payload types are defined once in `packages/shared/src/events.ts`

### Bot Command System

Commands are auto-loaded from `apps/bot/src/commands/{category}/{command}.ts`. Each command file exports `data` (SlashCommandBuilder) and `execute` (async handler). To add a new command, create a file in the appropriate category directory — no registration code needed.

Button interactions route through `apps/bot/src/handlers/buttonHandler.ts` using `customId` prefixes like `player:pause`.

### Dashboard Component Pattern

All music-control components use the `usePlayer(guildId)` hook (`apps/dashboard/src/hooks/usePlayer.ts`) which manages Socket.io subscriptions and exposes control functions. Components are client components (`"use client"`).

The styling system uses shadcn/ui CSS custom properties (defined in `globals.css`) with `cn()` from `src/lib/utils.ts` for conditional classes.

## Commands

### Development

```bash
bun install              # Install all dependencies
bun run dev              # Start all apps in dev mode (turbo)
bun run --filter @beatbox/bot dev       # Bot only
bun run --filter @beatbox/dashboard dev # Dashboard only
```

### Database

```bash
bun run db:generate     # Generate Prisma client after schema changes
bun run db:push         # Push schema to database (no migration)
bun run db:studio       # Open Prisma Studio GUI
cd packages/database && bun run db:migrate  # Create a migration
```

### Bot Slash Commands

```bash
cd apps/bot && bun run deploy-commands  # Register/update Discord slash commands
```

### Build

```bash
bun run build           # Build all packages
bun run lint            # Type-check all packages
```

## Environment Variables

Copy `.env.example` to `.env` at the repo root. Required variables:

- `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` — Discord application credentials
- `LAVALINK_HOST`, `LAVALINK_PORT`, `LAVALINK_PASSWORD` — Lavalink server connection
- `DATABASE_URL` — PostgreSQL connection string
- `NEXTAUTH_URL`, `NEXTAUTH_SECRET` — NextAuth config
- `SOCKET_PORT` — Port for bot's Socket.io server (default 3001)

The bot loads env from `../../.env` relative to `apps/bot/`. The dashboard uses Next.js env loading. `NEXT_PUBLIC_SOCKET_URL` configures the dashboard's Socket.io connection.

## Workflow Preferences

- Launch a subagent for each new task, in parallel when possible, making sure they don't overlap.
- Control background services (bot, dashboard) and manage the subagents centrally.
- Use the todo list for tracking when handling multiple requests.
- **Commit after each completed task** to maintain a good version history.

## External Dependencies

The bot requires a running **Lavalink** server for audio playback and a **PostgreSQL** database. Lavalink handles all audio source resolution (YouTube, Spotify, SoundCloud, etc.) — the bot itself does not download or process audio.
