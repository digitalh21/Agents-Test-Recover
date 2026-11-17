import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { timeTracks } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// POST { seconds } — called every 60s while the tab is visible (Page Visibility API)
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { seconds } = await req.json();
  const inc = Math.min(120, Math.max(0, Number(seconds) || 0));
  const day = new Date().toISOString().slice(0, 10);

  await db
    .insert(timeTracks)
    .values({ agentId: user.id, day, seconds: inc })
    .onConflictDoUpdate({
      target: [timeTracks.agentId, timeTracks.day],
      set: { seconds: sql`${timeTracks.seconds} + ${inc}` },
    });

  const [row] = await db
    .select()
    .from(timeTracks)
    .where(and(eq(timeTracks.agentId, user.id), eq(timeTracks.day, day)))
    .limit(1);
  return NextResponse.json({ todaySeconds: row?.seconds ?? inc });
}

// GET — today's tracked time for the logged-in user
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const day = new Date().toISOString().slice(0, 10);
  const [row] = await db
    .select()
    .from(timeTracks)
    .where(and(eq(timeTracks.agentId, user.id), eq(timeTracks.day, day)))
    .limit(1);
  return NextResponse.json({ todaySeconds: row?.seconds ?? 0 });
}
