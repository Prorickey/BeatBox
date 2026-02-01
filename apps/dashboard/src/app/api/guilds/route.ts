import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../auth/[...nextauth]/route";
import { prisma } from "@beatbox/database";

const REFRESH_COOLDOWN_MS = 30_000; // 30 seconds between Discord API refreshes

function cachedGuildsResponse(cached: { guildId: string; guildName: string; guildIcon: string | null; botPresent: boolean }[]) {
  return cached.map((g) => ({
    id: g.guildId,
    name: g.guildName,
    icon: g.guildIcon,
    botPresent: g.botPresent,
  }));
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  const accessToken = (session as any)?.accessToken;
  const userId = (session?.user as any)?.id as string | undefined;

  if (!accessToken || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const refresh = searchParams.get("refresh") === "true";

  // If not a refresh request, serve from DB cache
  if (!refresh) {
    const cached = await prisma.userGuildCache.findMany({
      where: { userId },
      orderBy: { guildName: "asc" },
    });

    if (cached.length > 0) {
      return NextResponse.json(cachedGuildsResponse(cached));
    }
    // No cache — fall through to fetch from Discord
  }

  // If refreshing, check cooldown to avoid hitting Discord rate limits
  if (refresh) {
    const mostRecent = await prisma.userGuildCache.findFirst({
      where: { userId },
      orderBy: { cachedAt: "desc" },
      select: { cachedAt: true },
    });

    if (mostRecent && Date.now() - mostRecent.cachedAt.getTime() < REFRESH_COOLDOWN_MS) {
      const cached = await prisma.userGuildCache.findMany({
        where: { userId },
        orderBy: { guildName: "asc" },
      });
      return NextResponse.json(cachedGuildsResponse(cached));
    }
  }

  try {
    // Fetch user's guilds from Discord
    const userGuildsRes = await fetch(
      "https://discord.com/api/v10/users/@me/guilds",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!userGuildsRes.ok) {
      // Rate-limited or other Discord error — fall back to cache
      const cached = await prisma.userGuildCache.findMany({
        where: { userId },
        orderBy: { guildName: "asc" },
      });
      if (cached.length > 0) {
        return NextResponse.json(cachedGuildsResponse(cached));
      }
      return NextResponse.json(
        { error: "Failed to fetch guilds" },
        { status: userGuildsRes.status }
      );
    }

    const userGuilds = await userGuildsRes.json();

    // Fetch bot's guilds using bot token
    const botGuildsRes = await fetch(
      "https://discord.com/api/v10/users/@me/guilds",
      {
        headers: {
          Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
        },
      }
    );

    const botGuildIds = new Set<string>();
    if (botGuildsRes.ok) {
      const botGuilds = await botGuildsRes.json();
      for (const g of botGuilds) {
        botGuildIds.add(g.id);
      }
    }

    const guilds = userGuilds.map(
      (g: { id: string; name: string; icon: string | null }) => ({
        id: g.id,
        name: g.name,
        icon: g.icon
          ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.${g.icon.startsWith("a_") ? "gif" : "png"}?size=128`
          : null,
        botPresent: botGuildIds.has(g.id),
      })
    );

    // Update cache in background — delete stale entries and upsert current ones
    const now = new Date();
    const guildIds = guilds.map((g: { id: string }) => g.id);

    await prisma.$transaction([
      // Remove guilds the user is no longer in
      prisma.userGuildCache.deleteMany({
        where: { userId, guildId: { notIn: guildIds } },
      }),
      // Upsert all current guilds
      ...guilds.map((g: { id: string; name: string; icon: string | null; botPresent: boolean }) =>
        prisma.userGuildCache.upsert({
          where: { userId_guildId: { userId, guildId: g.id } },
          create: {
            userId,
            guildId: g.id,
            guildName: g.name,
            guildIcon: g.icon,
            botPresent: g.botPresent,
            cachedAt: now,
          },
          update: {
            guildName: g.name,
            guildIcon: g.icon,
            botPresent: g.botPresent,
            cachedAt: now,
          },
        })
      ),
    ]);

    return NextResponse.json(guilds);
  } catch (error) {
    console.error("Failed to fetch guilds:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
