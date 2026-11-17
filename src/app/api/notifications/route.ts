import { NextRequest, NextResponse } from "next/server";
import { desc, gt } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, notifications } from "@/db/schema";
import { getSessionUser, isStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET ?sinceId=12 — poll for new broadcasts (agents show these via Notification API)
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sinceId = Number(req.nextUrl.searchParams.get("sinceId") ?? 0);
  const rows = await db
    .select()
    .from(notifications)
    .where(sinceId ? gt(notifications.id, sinceId) : undefined)
    .orderBy(desc(notifications.id))
    .limit(20);
  const relevant = rows.filter((n) => n.targetRole === "ALL" || n.targetRole === user.role);
  return NextResponse.json({ rows: relevant, latestId: rows[0]?.id ?? sinceId });
}

// Manual push broadcast creation permanently removed — system alerts are now
// generated automatically from management decisions (see /api/alerts) and
// banner broadcasts live at /api/banners.
