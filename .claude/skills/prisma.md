# Prisma 7 — Project Configuration

This project uses **Prisma 7** with the `@prisma/adapter-pg` driver adapter for PostgreSQL.

## Architecture

- **Schema:** `packages/database/prisma/schema.prisma`
- **Config:** `packages/database/prisma.config.ts` (datasource URL, migrations path)
- **Generated client:** `packages/database/src/generated/prisma/`
- **Shared export:** `packages/database/src/index.ts` exports `prisma` singleton

## Key Differences from Prisma 6

### No Rust Engine
Prisma 7 removed the Rust query engine. Connections are handled by `@prisma/adapter-pg` + the `pg` driver.

### Generator
```prisma
generator client {
  provider = "prisma-client"        # NOT "prisma-client-js"
  output   = "../src/generated/prisma"
}
```

### Datasource
The `url` is **not** in `schema.prisma`. It's configured in `prisma.config.ts`:
```ts
import { defineConfig } from "prisma/config";
export default defineConfig({
  datasource: { url: process.env.DATABASE_URL! },
});
```

### Client Instantiation
```ts
import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
```

### Auto-generate Removed
`prisma db push` and `prisma migrate dev` no longer auto-run `prisma generate`. Run it explicitly or use the project's npm scripts which chain them.

## Commands

```bash
# From packages/database/
bun run db:generate    # Generate client
bun run db:push        # Generate + push schema to DB
bun run db:migrate     # Generate + create migration
bun run db:studio      # Open Prisma Studio

# DATABASE_URL must be set. From monorepo root:
export $(cat .env | grep -v '^#' | xargs)
```

## Adding Models

1. Edit `packages/database/prisma/schema.prisma`
2. Run `bun run db:push` (or `db:migrate` for migrations)
3. Restart consuming apps (bot, dashboard) to pick up new client

## Packages

| Package | Purpose |
|---------|---------|
| `prisma` (dev) | CLI tools |
| `@prisma/client` | Client library |
| `@prisma/adapter-pg` | PostgreSQL driver adapter |
| `pg` | Node.js PostgreSQL driver |
| `@types/pg` (dev) | TypeScript types for pg |

## Consumers

Both `apps/bot` and `apps/dashboard` import from the shared package:
```ts
import { prisma } from "@beatbox/database";
```
No direct `@prisma/client` imports in consumer apps.
