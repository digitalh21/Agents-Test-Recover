import { NextRequest, NextResponse } from "next/server";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, leadErrors, leads, users } from "@/db/schema";
import { getSessionUser, isStaff } from "@/lib/auth";
import { notifyAgent } from "@/lib/alerts";

export const dynamic = "force-dynamic";

// GET — staff list of lead error reports
export async function GET() {
  const user = await getSessionUser();
  if (!user || !isStaff(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await db.select().from(leadErrors).orderBy(desc(leadErrors.createdAt)).limit(200);
  const agentIds = [...new Set(rows.map((r) => r.agentId))];
  const leadIds = [...new Set(rows.map((r) => r.leadId))];
  const [people, leadRows] = await Promise.all([
    agentIds.length ? db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, agentIds)) : [],
    leadIds.length ? db.select({ id: leads.id, businessName: leads.businessName }).from(leads).where(inArray(leads.id, leadIds)) : [],
  ]);
  const pmap = Object.fromEntries(people.map((p) => [p.id, p.name]));
  const lmap = Object.fromEntries(leadRows.map((l) => [l.id, l.businessName]));
  return NextResponse.json({
    rows: rows.map((r) => ({
      ...r,
      agentName: pmap[r.agentId] ?? `#${r.agentId}`,
      businessName: lmap[r.leadId] ?? `Lead #${r.leadId}`,
    })),
  });
}

// POST — agent submits an error report { leadId, issue }
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { leadId, issue } = await req.json();
  const text = String(issue ?? "").trim().slice(0, 2000);
  if (!text) return NextResponse.json({ error: "Issue details are required" }, { status: 400 });
  const [lead] = await db.select().from(leads).where(eq(leads.id, Number(leadId))).limit(1);
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  if (user.role === "AGENT" && lead.assignedTo !== user.id) {
    return NextResponse.json({ error: "Not your lead" }, { status: 403 });
  }
  const [row] = await db.insert(leadErrors).values({ leadId: lead.id, agentId: user.id, issue: text }).returning();
  await db.insert(auditLogs).values({
    userId: user.id,
    leadId: lead.id,
    action: "LEAD_ERROR_REPORTED",
    detail: text.slice(0, 120),
  });
  return NextResponse.json({ row });
}

// PATCH { id, decision: "resolve"|"dismiss", note? } — staff review
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !isStaff(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id, decision, note } = await req.json();
  const status = decision === "resolve" ? "RESOLVED" : "DISMISSED";
  const [row] = await db
    .update(leadErrors)
    .set({ status, resolutionNote: note ? String(note).slice(0, 1000) : null, resolvedAt: new Date() })
    .where(eq(leadErrors.id, Number(id)))
    .returning();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await db.insert(auditLogs).values({
    userId: user.id,
    leadId: row.leadId,
    action: "LEAD_ERROR_" + status,
    detail: note ? String(note).slice(0, 120) : `Error report #${row.id} ${status.toLowerCase()}`,
  });
  await notifyAgent({
    agentId: row.agentId,
    kind: "LEAD_ERROR",
    decision: status,
    title: status === "RESOLVED" ? "🛠 Lead Error Resolved" : "📋 Lead Error Report Reviewed",
    body:
      status === "RESOLVED"
        ? `Your error report on lead #${row.leadId} was resolved. Management notes: "${note ?? "Data corrected."}"`
        : `Your error report on lead #${row.leadId} was reviewed and dismissed${note ? ` — "${note}"` : ""}.`,
  });
  return NextResponse.json({ ok: true });
}
