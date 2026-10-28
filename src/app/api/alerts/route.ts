import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { agentAlerts } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET ?unread=1 — agent's automated decision alerts (popup queue) or full history
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const unreadOnly = req.nextUrl.searchParams.get("unread") === "1";
  const rows = await db
    .select()
    .from(agentAlerts)
    .where(unreadOnly ? and(eq(agentAlerts.agentId, user.id), eq(agentAlerts.read, false)) : eq(agentAlerts.agentId, user.id))
    .orderBy(desc(agentAlerts.createdAt))
    .limit(unreadOnly ? 10 : 50);
  return NextResponse.json({ rows });
}

// POST { ids: number[] } — mark alerts as read (agent acknowledged the popup)
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { ids } = await req.json();
  if (!Array.isArray(ids) || ids.length === 0) return NextResponse.json({ ok: true });
  const { inArray } = await import("drizzle-orm");
  await db
    .update(agentAlerts)
    .set({ read: true })
    .where(and(eq(agentAlerts.agentId, user.id), inArray(agentAlerts.id, ids.map(Number))));
  return NextResponse.json({ ok: true });
}
