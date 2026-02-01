import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../auth/[...nextauth]/route";
import { prisma } from "@beatbox/database";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session as any).accessToken
    ? undefined
    : undefined;

  // Fetch playlists — get all playlists the user can see
  // Since we store userId as Discord user ID, we need to get it from the session
  // For now, fetch playlists visible to any authenticated user (public + own)
  const playlists = await prisma.playlist.findMany({
    where: { isPublic: true },
    include: {
      tracks: { orderBy: { position: "asc" } },
      _count: { select: { tracks: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(playlists);
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { name, description, isPublic, guildId } = body;

  if (!name || typeof name !== "string") {
    return NextResponse.json(
      { error: "Playlist name is required" },
      { status: 400 }
    );
  }

  const discordUserId = (session.user as any)?.id as string | undefined;
  if (!discordUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const playlist = await prisma.playlist.create({
    data: {
      name,
      description: description || null,
      isPublic: isPublic ?? false,
      guildId: guildId || null,
      userId: discordUserId,
    },
    include: {
      tracks: true,
      _count: { select: { tracks: true } },
    },
  });

  return NextResponse.json(playlist, { status: 201 });
}
