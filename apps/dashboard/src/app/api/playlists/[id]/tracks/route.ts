import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../auth/[...nextauth]/route";
import { prisma } from "@beatbox/database";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const { title, author, duration, uri, artworkUrl, sourceName } = body;

  if (!title || !author || !uri) {
    return NextResponse.json(
      { error: "title, author, and uri are required" },
      { status: 400 }
    );
  }

  // Get current max position
  const last = await prisma.playlistTrack.findFirst({
    where: { playlistId: id },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  const track = await prisma.playlistTrack.create({
    data: {
      playlistId: id,
      title,
      author,
      duration: duration ?? 0,
      uri,
      artworkUrl: artworkUrl ?? null,
      sourceName: sourceName ?? "unknown",
      position: (last?.position ?? -1) + 1,
    },
  });

  return NextResponse.json(track, { status: 201 });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const trackId = searchParams.get("trackId");

  if (!trackId) {
    return NextResponse.json(
      { error: "trackId query param is required" },
      { status: 400 }
    );
  }

  await prisma.playlistTrack.delete({ where: { id: trackId } });

  return NextResponse.json({ ok: true });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const { order } = body as { order: string[] }; // array of track IDs in new order

  if (!Array.isArray(order)) {
    return NextResponse.json(
      { error: "order array is required" },
      { status: 400 }
    );
  }

  // Update positions in a transaction
  await prisma.$transaction(
    order.map((trackId, index) =>
      prisma.playlistTrack.update({
        where: { id: trackId },
        data: { position: index },
      })
    )
  );

  return NextResponse.json({ ok: true });
}
