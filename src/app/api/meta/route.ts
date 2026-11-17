import { NextRequest, NextResponse } from "next/server";
import { asc, count, eq, inArray, isNull, and } from "drizzle-orm";
import { db } from "@/db";
import { leads, niches, users } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET ?niche=slug — niches, agents, and niche-filtered headline stats.
// Selecting a niche in the sidebar dynamically filters every metric.
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const nicheSlug = user.role === "AGENT" ? null : req.nextUrl.searchParams.get("niche");
  const allNiches = user.role === "AGENT" ? [] : await db.select().from(niches).orderBy(asc(niches.id));
  const nicheRows = allNiches;
  const activeNiche =
    nicheSlug && nicheSlug !== "all" ? nicheRows.find((n) => n.slug === nicheSlug) ?? null : null;

  const countFilters = [] as (ReturnType<typeof eq> | ReturnType<typeof inArray>)[];
  if (activeNiche) countFilters.push(eq(leads.nicheId, activeNiche.id));
  if (user.role === "AGENT") {
    // Strict row ownership: no query parameter can expand an agent's totals.
    countFilters.push(eq(leads.assignedTo, user.id));
    countFilters.push(eq(leads.archived, false));
  }

  const unassignedFilters = [isNull(leads.assignedTo), eq(leads.status, "NEW")];
  if (activeNiche) unassignedFilters.push(eq(leads.nicheId, activeNiche.id));

  const [agentRows, statusCounts, [{ unassigned }]] = await Promise.all([
    db
      .select({ id: users.id, name: users.name, role: users.role, online: users.online })
      .from(users)
      .where(eq(users.role, "AGENT"))
      .orderBy(asc(users.id)),
    db
      .select({ status: leads.status, n: count() })
      .from(leads)
      .where(countFilters.length ? and(...countFilters) : undefined)
      .groupBy(leads.status),
    db
      .select({ unassigned: count() })
      .from(leads)
      .where(and(...unassignedFilters)),
  ]);

  return NextResponse.json({
    niches: user.role === "AGENT" ? [] : nicheRows,
    agents: user.role === "AGENT" ? [] : agentRows,
    statusCounts: Object.fromEntries(statusCounts.map((s) => [s.status, Number(s.n)])),
    unassigned: user.role === "AGENT" ? 0 : Number(unassigned),
    activeNiche: user.role === "AGENT" ? null : activeNiche ? { id: activeNiche.id, name: activeNiche.name, slug: activeNiche.slug } : null,
    me: { id: user.id, name: user.name, role: user.role },
  });
}
