import { NextResponse } from "next/server";
import { and, asc, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, leads, users } from "@/db/schema";

export const dynamic = "force-dynamic";

// Mock cron endpoint — simulates the midnight scheduled job.
// 1. Unassigns untouched NEW leads back to the pool after 24h
// 2. Cycles REJECTED leads to different agents (previous agent stays anonymous)
// 3. Archives APPROVED leads from agent primary view (earnings history retained)
export async function GET() {
  return run();
}
export async function POST() {
  return run();
}

async function run() {
  const now = new Date();
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // 1 — Return stale untouched NEW leads to the unassigned pool
  const stale = await db
    .select({ id: leads.id })
    .from(leads)
    .where(
      and(
        eq(leads.status, "NEW"),
        isNotNull(leads.assignedTo),
        lt(leads.assignedAt, cutoff),
        sql`${leads.lastActivityAt} IS NULL`
      )
    )
    .limit(5000);
  if (stale.length) {
    await db
      .update(leads)
      .set({ assignedTo: null, assignedAt: null, unlocked: false })
      .where(inArray(leads.id, stale.map((l) => l.id)));
  }

  // 2 — Recycle REJECTED / Not-Interested critical leads to new agents
  const agents = await db.select({ id: users.id }).from(users).where(eq(users.role, "AGENT")).orderBy(asc(users.id));
  const rejected = await db
    .select({ id: leads.id, assignedTo: leads.assignedTo })
    .from(leads)
    .where(and(eq(leads.status, "REJECTED"), eq(leads.archived, false), lt(leads.lastActivityAt, cutoff)))
    .limit(2000);
  let recycled = 0;
  if (agents.length > 1) {
    for (let i = 0; i < rejected.length; i++) {
      const lead = rejected[i];
      const candidates = agents.filter((a) => a.id !== lead.assignedTo);
      const next = candidates[i % candidates.length];
      await db
        .update(leads)
        .set({
          assignedTo: next.id,
          assignedAt: now,
          status: "NEW",
          recycled: true, // past notes shown anonymously to the new agent
          unlocked: false,
          lastActivityAt: null,
        })
        .where(eq(leads.id, lead.id));
      recycled++;
    }
  }

  // 3 — Archive completed/approved leads out of the primary agent view
  const archived = await db
    .update(leads)
    .set({ archived: true })
    .where(and(eq(leads.status, "APPROVED"), eq(leads.archived, false)))
    .returning({ id: leads.id });

  await db.insert(auditLogs).values({
    action: "CRON_DAILY_CLEANUP",
    detail: `Pool-returned ${stale.length} stale leads; recycled ${recycled} rejected leads to new agents; archived ${archived.length} approved leads`,
  });

  return NextResponse.json({
    ranAt: now.toISOString(),
    unassignedStaleLeads: stale.length,
    recycledRejectedLeads: recycled,
    archivedApprovedLeads: archived.length,
  });
}
