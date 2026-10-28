import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, callLogs, deals, leadNotes, leads, niches, uploads } from "@/db/schema";
import { getSessionUser, isStaff } from "@/lib/auth";
import { getVisibilityMap } from "@/lib/field-visibility";
import { applyFieldVisibility } from "@/lib/fields";
import { getSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

// GET /api/leads/[id] — full lead detail + anonymized audit history
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const leadId = Number(id);

  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (user.role === "AGENT" && lead.assignedTo !== user.id) {
    return NextResponse.json({ error: "Lead not assigned to you" }, { status: 403 });
  }

  const [niche] = await db.select().from(niches).where(eq(niches.id, lead.nicheId)).limit(1);
  const notes = await db
    .select()
    .from(leadNotes)
    .where(eq(leadNotes.leadId, leadId))
    .orderBy(desc(leadNotes.createdAt))
    .limit(50);
  const calls = await db
    .select()
    .from(callLogs)
    .where(eq(callLogs.leadId, leadId))
    .orderBy(desc(callLogs.createdAt))
    .limit(50);
  const files = await db
    .select()
    .from(uploads)
    .where(eq(uploads.leadId, leadId))
    .orderBy(desc(uploads.createdAt))
    .limit(20);
  const dealRows = await db
    .select()
    .from(deals)
    .where(eq(deals.leadId, leadId))
    .orderBy(desc(deals.createdAt))
    .limit(5);

  // Anonymize previous agents' identities for privacy (append-only timeline)
  const safeNotes = notes.map((n) => ({
    id: n.id,
    note: n.note,
    status: n.status,
    createdAt: n.createdAt,
    author: n.agentId === user.id ? "You" : "Previous Agent (anonymous)",
    mine: n.agentId === user.id,
  }));

  // "Show History to Agent" global toggle + per-lead history access grants
  const showHistorySetting = (await getSetting("show_history_to_agent", "true")) === "true";
  const historyVisible = user.role !== "AGENT" || showHistorySetting || lead.historyUnlocked;
  const visibleNotes = historyVisible ? safeNotes : safeNotes.filter((n) => n.mine);
  const hiddenHistoryCount = historyVisible ? 0 : safeNotes.length - visibleNotes.length;

  // Lock until Admin/Manager approves access + admin-managed RBAC field visibility
  const locked = user.role === "AGENT" && !lead.unlocked;
  const visibility = await getVisibilityMap(user.role);

  const withCategory: Record<string, unknown> = { ...lead, categoryName: niche?.name ?? null };
  if (locked && withCategory.contactName) {
    withCategory.contactName = String(withCategory.contactName)[0] + "••••";
  }
  const safeLead = applyFieldVisibility(withCategory, visibility, { forceMaskPhone: locked });

  // Raw dial number only when the agent is allowed to act on the lead
  // (keeps tel: / wa.me working even when phone display is MASKED by rule)
  const dial = locked ? null : lead.phone;

  // Latest rejected deal → agent sees rejection comments + can re-upload proof
  const latestDeal = dealRows[0] ?? null;
  // Did this agent already ask for history access on this lead?
  const { leadRequests } = await import("@/db/schema");
  const [histReq] = await db
    .select()
    .from(leadRequests)
    .where(
      and(eq(leadRequests.leadId, leadId), eq(leadRequests.agentId, user.id), eq(leadRequests.type, "HISTORY"), eq(leadRequests.status, "PENDING"))
    )
    .limit(1);
  const rejectedDeal =
    latestDeal && latestDeal.status === "REJECTED"
      ? { id: latestDeal.id, rejectionNote: latestDeal.rejectionNote, amount: latestDeal.amount, decidedAt: latestDeal.decidedAt }
      : null;
  const pendingDeal = latestDeal && latestDeal.status === "PENDING";

  return NextResponse.json({
    lead: safeLead,
    dial,
    locked,
    fieldVisibility: visibility,
    niche,
    notes: visibleNotes,
    historyVisible,
    hiddenHistoryCount,
    historyRequested: !!histReq,
    assignedAt: lead.assignedAt,
    lastActivityAt: lead.lastActivityAt,
    rejectedDeal,
    pendingDeal,
    calls,
    files,
  });
}

// PATCH — staff inline actions on single lead: unlock, assign, status, add note
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || !isStaff(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const leadId = Number(id);
  const body = await req.json();

  // Inline note/remark (instant, no page reload)
  if (body.addNote) {
    const note = String(body.addNote).trim().slice(0, 2000);
    if (note) {
      await db.insert(leadNotes).values({ leadId, agentId: user.id, note: `[${user.role}] ${note}` });
      await db.insert(auditLogs).values({ userId: user.id, leadId, action: "NOTE_ADDED", detail: note.slice(0, 120) });
    }
  }

  const patch: Partial<typeof leads.$inferInsert> = {};
  const actions: string[] = [];
  if (typeof body.unlocked === "boolean") {
    patch.unlocked = body.unlocked;
    actions.push(body.unlocked ? "unlocked prospect details" : "locked prospect details");
  }
  if (body.assignedTo !== undefined) {
    patch.assignedTo = body.assignedTo === null ? null : String(body.assignedTo);
    patch.assignedAt = new Date();
    actions.push(body.assignedTo ? `assigned to agent #${body.assignedTo}` : "returned to pool");
  }
  if (body.status) {
    patch.status = body.status;
    actions.push(`status → ${body.status}`);
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: true, noteOnly: !!body.addNote });
  }

  await db.update(leads).set({ ...patch, lastActivityAt: new Date() }).where(and(eq(leads.id, leadId)));
  await db.insert(auditLogs).values({
    userId: user.id,
    leadId,
    action: "LEAD_EDIT",
    detail: actions.join("; "),
  });
  return NextResponse.json({ ok: true });
}
