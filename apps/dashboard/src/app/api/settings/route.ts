import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../auth/[...nextauth]/route";
import { prisma } from "@beatbox/database";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const guildId = searchParams.get("guildId");

  if (!guildId) {
    return NextResponse.json(
      { error: "guildId is required" },
      { status: 400 }
    );
  }

  // Upsert guild + settings so they always exist
  const guild = await prisma.guild.upsert({
    where: { id: guildId },
    create: {
      id: guildId,
      name: "Unknown Server",
      settings: { create: {} },
    },
    update: {},
    include: { settings: true },
  });

  if (!guild.settings) {
    const settings = await prisma.guildSettings.create({
      data: { guildId },
    });
    return NextResponse.json(settings);
  }

  return NextResponse.json(guild.settings);
}

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { guildId, ...updates } = body;

  if (!guildId) {
    return NextResponse.json(
      { error: "guildId is required" },
      { status: 400 }
    );
  }

  // Only allow known fields
  const allowed = [
    "announceNowPlaying",
    "defaultRepeatMode",
    "maxQueueSize",
    "allowDuplicates",
    "autoPlay",
  ];
  const data: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in updates) {
      data[key] = updates[key];
    }
  }

  // Ensure guild and settings exist
  await prisma.guild.upsert({
    where: { id: guildId },
    create: { id: guildId, name: "Unknown Server", settings: { create: {} } },
    update: {},
  });

  const settings = await prisma.guildSettings.upsert({
    where: { guildId },
    create: { guildId, ...data },
    update: data,
  });

  return NextResponse.json(settings);
}
