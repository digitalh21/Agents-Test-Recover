import { NextRequest, NextResponse } from "next/server";
import { and, asc, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  auditLogs,
  corrections,
  deals,
  earnings,
  leadRequests,
  leads,
  users,
  withdrawals,
} from "@/db/schema";
import { getSessionUser, isStaff } from "@/lib/auth";
import { notifyAgent } from "@/lib/alerts";

export const dynamic = "force-dynamic";

// GET — all pending approvals for the real-time approvals center
export async function GET() {
  const user = await getSessionUser();
  if (!user || !isStaff(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [pendingDeals, approvedDeals, rejectedDeals, pendingWithdrawals, pendingCorrections, pendingLeadRequests, agents] = await Promise.all([
    db.select().from(deals).where(eq(deals.status, "PENDING")).orderBy(desc(deals.createdAt)).limit(100),
    db.select().from(deals).where(eq(deals.status, "APPROVED")).orderBy(desc(deals.decidedAt)).limit(50),
    db.select().from(deals).where(eq(deals.status, "REJECTED")).orderBy(desc(deals.decidedAt)).limit(50),
    db.select().from(withdrawals).where(eq(withdrawals.status, "PENDING")).orderBy(desc(withdrawals.createdAt)).limit(100),
    db.select().from(corrections).where(eq(corrections.status, "PENDING")).orderBy(desc(corrections.createdAt)).limit(100),
    db.select().from(leadRequests).where(eq(leadRequests.status, "PENDING")).orderBy(desc(leadRequests.createdAt)).limit(100),
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.role, "AGENT")),
  ]);

  const agentMap = Object.fromEntries(agents.map((a) => [a.id, a.name]));
  const leadIds = [
    ...new Set([
      ...pendingDeals.map((d) => d.leadId),
      ...approvedDeals.map((d) => d.leadId),
      ...rejectedDeals.map((d) => d.leadId),
      ...pendingCorrections.map((c) => c.leadId),
      ...pendingLeadRequests.map((r) => r.leadId).filter((x): x is number => x !== null),
    ]),
  ];
  const leadRows = leadIds.length
    ? await db.select({ id: leads.id, businessName: leads.businessName }).from(leads).where(inArray(leads.id, leadIds))
    : [];
  const leadMap = Object.fromEntries(leadRows.map((l) => [l.id, l.businessName]));

  const decorate = <T extends { agentId: string; leadId: number }>(d: T) => ({
    ...d,
    agentName: agentMap[d.agentId] ?? `#${d.agentId}`,
    businessName: leadMap[d.leadId] ?? `Lead #${d.leadId}`,
  });

  return NextResponse.json({
    deals: pendingDeals.map(decorate),
    approvedDeals: approvedDeals.map(decorate),
    rejectedDeals: rejectedDeals.map(decorate),
    withdrawals: pendingWithdrawals.map((w) => ({ ...w, agentName: agentMap[w.agentId] ?? `#${w.agentId}` })),
    corrections: pendingCorrections.map((c) => ({ ...c, agentName: agentMap[c.agentId] ?? `#${c.agentId}`, businessName: leadMap[c.leadId] ?? `Lead #${c.leadId}` })),
    leadRequests: pendingLeadRequests.map((r) => ({
      ...r,
      agentName: agentMap[r.agentId] ?? `#${r.agentId}`,
      businessName: r.leadId ? leadMap[r.leadId] ?? `Lead #${r.leadId}` : null,
    })),
  });
}

// POST { type, id, decision: "approve"|"reject", proofUrl?, rejectionNote? }
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !isStaff(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { type, id, decision, proofUrl, rejectionNote } = await req.json();
  const approve = decision === "approve";
  const status = approve ? "APPROVED" : "REJECTED";
  const now = new Date();

  if (type === "deal") {
    const [deal] = await db.select().from(deals).where(eq(deals.id, Number(id))).limit(1);
    if (!deal || deal.status !== "PENDING") return NextResponse.json({ error: "Deal not pending" }, { status: 400 });
    await db
      .update(deals)
      .set({ status, decidedAt: now, rejectionNote: !approve ? String(rejectionNote ?? "Proof could not be verified").slice(0, 1000) : null })
      .where(eq(deals.id, deal.id));
    const [agent] = await db.select().from(users).where(eq(users.id, deal.agentId)).limit(1);
    const [lead] = await db.select().from(leads).where(eq(leads.id, deal.leadId)).limit(1);
    if (approve) {
      await db
        .update(users)
        .set({
          walletPending: Math.max(0, (agent?.walletPending ?? 0) - deal.commission),
          walletApproved: (agent?.walletApproved ?? 0) + deal.commission,
          walletTotal: (agent?.walletTotal ?? 0) + deal.commission,
        })
        .where(eq(users.id, deal.agentId));
      await db.insert(earnings).values({
        agentId: deal.agentId,
        kind: "COMMISSION",
        leadId: deal.leadId,
        leadName: lead?.contactName ?? null,
        businessName: lead?.businessName ?? `Lead #${deal.leadId}`,
        amount: deal.commission,
        approvedAt: now,
      });
      // Daily performance snapshot: deals closed today
      const { agentDailyStats } = await import("@/db/schema");
      const { sql } = await import("drizzle-orm");
      const day = now.toISOString().slice(0, 10);
      await db
        .insert(agentDailyStats)
        .values({ agentId: deal.agentId, day, dealsClosed: 1 })
        .onConflictDoUpdate({
          target: [agentDailyStats.agentId, agentDailyStats.day],
          set: { dealsClosed: sql`${agentDailyStats.dealsClosed} + 1` },
        });
      // Archive from agent primary view but keep in earnings history
      await db.update(leads).set({ status: "APPROVED", archived: true, lastActivityAt: now }).where(eq(leads.id, deal.leadId));
    } else {
      await db
        .update(users)
        .set({ walletPending: Math.max(0, (agent?.walletPending ?? 0) - deal.commission) })
        .where(eq(users.id, deal.agentId));
      await db.update(leads).set({ status: "IN_PROGRESS", lastActivityAt: now }).where(eq(leads.id, deal.leadId));
    }
    await db.insert(auditLogs).values({
      userId: user.id,
      leadId: deal.leadId,
      action: approve ? "DEAL_APPROVED" : "DEAL_REJECTED",
      detail: `Deal #${deal.id} ₹${deal.amount} (commission ₹${deal.commission}) ${status.toLowerCase()} for agent #${deal.agentId}`,
    });
    await notifyAgent({
      agentId: deal.agentId,
      kind: "DEAL",
      decision: status,
      title: approve ? "💰 Payment Proof Approved!" : "❌ Payment Proof Rejected",
      body: approve
        ? `Your deal on "${lead?.businessName ?? `Lead #${deal.leadId}`}" was approved. Commission ₹${deal.commission} credited to your withdrawable wallet. 🎉`
        : `Your proof on "${lead?.businessName ?? `Lead #${deal.leadId}`}" was rejected. Management notes: "${rejectionNote ?? "Proof could not be verified"}". Open the lead to re-upload & re-submit.`,
    });
    return NextResponse.json({ ok: true });
  }

  if (type === "withdrawal") {
    const [w] = await db.select().from(withdrawals).where(eq(withdrawals.id, Number(id))).limit(1);
    if (!w || w.status !== "PENDING") return NextResponse.json({ error: "Not pending" }, { status: 400 });
    await db.update(withdrawals).set({ status, decidedAt: now, proofUrl: proofUrl ?? w.proofUrl }).where(eq(withdrawals.id, w.id));
    if (approve) {
      const [agent] = await db.select().from(users).where(eq(users.id, w.agentId)).limit(1);
      await db
        .update(users)
        .set({ walletApproved: Math.max(0, (agent?.walletApproved ?? 0) - w.amount) })
        .where(eq(users.id, w.agentId));
    }
    await db.insert(auditLogs).values({
      userId: user.id,
      action: approve ? "PAYOUT_APPROVED" : "PAYOUT_REJECTED",
      detail: `Withdrawal #${w.id} ₹${w.amount} ${status.toLowerCase()} for agent #${w.agentId}`,
    });
    await notifyAgent({
      agentId: w.agentId,
      kind: "PAYOUT",
      decision: status,
      title: approve ? "💸 Withdrawal Approved!" : "🚫 Withdrawal Rejected",
      body: approve
        ? `Your payout request of ₹${w.amount} has been approved and is being processed.`
        : `Your payout request of ₹${w.amount} was rejected. Contact HR via a Help Desk ticket for details.`,
    });
    return NextResponse.json({ ok: true });
  }

  if (type === "correction") {
    const [c] = await db.select().from(corrections).where(eq(corrections.id, Number(id))).limit(1);
    if (!c || c.status !== "PENDING") return NextResponse.json({ error: "Not pending" }, { status: 400 });
    await db.update(corrections).set({ status, decidedAt: now }).where(eq(corrections.id, c.id));
    if (approve && c.requestedStatus) {
      await db.update(leads).set({ status: c.requestedStatus, lastActivityAt: now }).where(eq(leads.id, c.leadId));
    }
    await db.insert(auditLogs).values({
      userId: user.id,
      leadId: c.leadId,
      action: approve ? "CORRECTION_APPROVED" : "CORRECTION_REJECTED",
      detail: `Correction #${c.id} ${status.toLowerCase()}${approve && c.requestedStatus ? ` — status set to ${c.requestedStatus}` : ""}`,
    });
    await notifyAgent({
      agentId: c.agentId,
      kind: "CORRECTION",
      decision: status,
      title: approve ? "🛠 Correction Request Approved" : "❌ Correction Request Rejected",
      body: approve
        ? `Your correction on lead #${c.leadId} was approved${c.requestedStatus ? ` — status updated to ${c.requestedStatus}` : ""}.`
        : `Your correction request on lead #${c.leadId} was rejected after review.`,
    });
    return NextResponse.json({ ok: true });
  }

  if (type === "leadRequest") {
    const [r] = await db.select().from(leadRequests).where(eq(leadRequests.id, Number(id))).limit(1);
    if (!r || r.status !== "PENDING") return NextResponse.json({ error: "Not pending" }, { status: 400 });
    await db.update(leadRequests).set({ status, decidedAt: now }).where(eq(leadRequests.id, r.id));

    let assigned = 0;
    let detail = `Lead request #${r.id} (${r.type}) ${status.toLowerCase()}`;

    if (approve && r.type === "HISTORY" && r.leadId) {
      // Grant per-lead history access to the agent
      await db.update(leads).set({ historyUnlocked: true }).where(eq(leads.id, r.leadId));
      detail += ` — past call-note history unlocked on lead #${r.leadId} for agent #${r.agentId}`;
    } else if (approve && r.type === "REPLACE" && r.leadId) {
      // Return the problem lead to the pool + assign one replacement
      await db
        .update(leads)
        .set({ assignedTo: null, assignedAt: null, status: "NEW", unlocked: false, lastActivityAt: now })
        .where(eq(leads.id, r.leadId));
      const pool = await db
        .select({ id: leads.id })
        .from(leads)
        .where(and(isNull(leads.assignedTo), eq(leads.status, "NEW"), eq(leads.archived, false), ne(leads.id, r.leadId)))
        .orderBy(asc(leads.id))
        .limit(1);
      if (pool[0]) {
        await db.update(leads).set({ assignedTo: r.agentId, assignedAt: now, unlocked: false }).where(eq(leads.id, pool[0].id));
        assigned = 1;
      }
      detail += ` — lead #${r.leadId} returned to pool, ${assigned} replacement assigned to agent #${r.agentId}`;
    } else if (approve) {
      // NEW leads request — assign up to 10 fresh pool leads
      const pool = await db
        .select({ id: leads.id })
        .from(leads)
        .where(and(isNull(leads.assignedTo), eq(leads.status, "NEW"), eq(leads.archived, false)))
        .orderBy(asc(leads.id))
        .limit(10);
      for (const p of pool) {
        await db.update(leads).set({ assignedTo: r.agentId, assignedAt: now, unlocked: false }).where(eq(leads.id, p.id));
        assigned++;
      }
      detail += ` — ${assigned} fresh leads assigned to agent #${r.agentId}`;
    }

    await db.insert(auditLogs).values({
      userId: user.id,
      leadId: r.leadId ?? null,
      action: approve ? "LEAD_REQUEST_APPROVED" : "LEAD_REQUEST_REJECTED",
      detail,
    });
    const reqLabel = r.type === "REPLACE" ? "Replace Lead" : r.type === "HISTORY" ? "History Access" : "New Leads";
    await notifyAgent({
      agentId: r.agentId,
      kind: "LEAD_REQUEST",
      decision: status,
      title: approve ? `✅ ${reqLabel} Request Approved` : `❌ ${reqLabel} Request Rejected`,
      body: approve
        ? r.type === "REPLACE"
          ? `Your replacement request was approved — the lead returned to pool and ${assigned} fresh lead${assigned === 1 ? "" : "s"} assigned to you.`
          : r.type === "HISTORY"
            ? `History access granted on lead #${r.leadId} — past call notes are now visible to you.`
            : `${assigned} fresh leads have been assigned to your queue. Good luck! 🎯`
        : `Your ${reqLabel.toLowerCase()} request was rejected by management.`,
    });
    return NextResponse.json({ ok: true, assigned });
  }

  return NextResponse.json({ error: "Unknown type" }, { status: 400 });
}
