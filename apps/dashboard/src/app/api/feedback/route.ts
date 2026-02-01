import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";
import { prisma } from "@beatbox/database";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user || !(session.user as any).id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { message } = body;

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return NextResponse.json(
      { error: "Message is required and must be a non-empty string." },
      { status: 400 }
    );
  }

  if (message.length > 1000) {
    return NextResponse.json(
      { error: "Message must be 1000 characters or fewer." },
      { status: 400 }
    );
  }

  const userId = (session.user as any).id as string;

  // Rate limit: max 20 feedback messages per day (UTC)
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const feedbackCount = await prisma.feedback.count({
    where: {
      userId,
      createdAt: { gte: todayStart },
    },
  });

  if (feedbackCount >= 20) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Maximum 20 feedback messages per day." },
      { status: 429 }
    );
  }

  await prisma.feedback.create({
    data: {
      userId,
      username: session.user?.name ?? "Unknown",
      message: message.trim(),
    },
  });

  return NextResponse.json({ success: true }, { status: 201 });
}
