import { NextRequest, NextResponse } from "next/server";
import { asc, eq, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { templates } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/templates?nicheId=1 — niche-specific + global templates
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const nicheId = req.nextUrl.searchParams.get("nicheId");
  const rows = nicheId
    ? await db
        .select()
        .from(templates)
        .where(or(eq(templates.nicheId, Number(nicheId)), isNull(templates.nicheId)))
        .orderBy(asc(templates.id))
    : await db.select().from(templates).orderBy(asc(templates.id));
  return NextResponse.json({ rows });
}
