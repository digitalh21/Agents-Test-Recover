import { NextRequest, NextResponse } from "next/server";
import { asc, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, leads, niches } from "@/db/schema";
import { getSessionUser, isStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET — all niches with lead counts (Show Niches panel)
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [rows, counts] = await Promise.all([
    db.select().from(niches).orderBy(asc(niches.id)),
    db.select({ nicheId: leads.nicheId, n: count() }).from(leads).groupBy(leads.nicheId),
  ]);
  const countMap = Object.fromEntries(counts.map((c) => [c.nicheId, Number(c.n)]));
  return NextResponse.json({ rows: rows.map((r) => ({ ...r, leadCount: countMap[r.id] ?? 0 })) });
}

// PATCH { id, visibleToAgents } — 'Visible to Agents' / 'Hidden from Agents' toggle (staff only)
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !isStaff(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id, visibleToAgents } = await req.json();
  const [row] = await db
    .update(niches)
    .set({ visibleToAgents: !!visibleToAgents })
    .where(eq(niches.id, Number(id)))
    .returning();
  if (!row) return NextResponse.json({ error: "Niche not found" }, { status: 404 });
  await db.insert(auditLogs).values({
    userId: user.id,
    action: "NICHE_VISIBILITY",
    detail: `Niche "${row.name}" → ${row.visibleToAgents ? "Visible to Agents" : "Hidden from Agents"}`,
  });
  return NextResponse.json({ row });
}

// POST { name, icon? } — "+ Add New Niche" (staff only)
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !isStaff(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { name, icon } = await req.json();
  const clean = String(name ?? "").trim().slice(0, 60);
  if (!clean) return NextResponse.json({ error: "Niche name is required" }, { status: 400 });
  const slug = clean.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const [existing] = await db.select().from(niches).where(eq(niches.slug, slug)).limit(1);
  if (existing) return NextResponse.json({ error: "A niche with this name already exists" }, { status: 400 });
  const [row] = await db
    .insert(niches)
    .values({ name: clean, slug, icon: String(icon ?? "📁").slice(0, 8) })
    .returning();
  await db.insert(auditLogs).values({ userId: user.id, action: "NICHE_ADDED", detail: `New niche "${clean}" (${slug})` });
  return NextResponse.json({ row });
}
