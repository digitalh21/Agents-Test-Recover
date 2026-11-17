import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  auditLogs,
  callLogs,
  corrections,
  deals,
  leadNotes,
  leadRequests,
  leads,
  users,
  withdrawals,
} from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { closesForAgent, slabAmountForCloses } from "@/lib/commission";
import { agentDailyStats } from "@/db/schema";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function bumpDailyStats(agentId: string, inc: { touched?: number; statusChanges?: number; deals?: number }) {
  const day = new Date().toISOString().slice(0, 10);
  await db
    .insert(agentDailyStats)
    .values({
      agentId,
      day,
      touchedLeads: inc.touched ?? 0,
      statusChanges: inc.statusChanges ?? 0,
      dealsClosed: inc.deals ?? 0,
    })
    .onConflictDoUpdate({
      target: [agentDailyStats.agentId, agentDailyStats.day],
      set: {
        touchedLeads: sql`${agentDailyStats.touchedLeads} + ${inc.touched ?? 0}`,
        statusChanges: sql`${agentDailyStats.statusChanges} + ${inc.statusChanges ?? 0}`,
        dealsClosed: sql`${agentDailyStats.dealsClosed} + ${inc.deals ?? 0}`,
      },
    });
}

// Single agent mutation endpoint. Agents have NO delete permissions anywhere.
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const action = body.action as string;

  // ── Post-call report: status + notes + call duration ────────────
  if (action === "status-update") {
    const leadId = Number(body.leadId);
    const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    if (user.role === "AGENT" && lead.assignedTo !== user.id) {
      return NextResponse.json({ error: "Not your lead" }, { status: 403 });
    }
    const status = String(body.status);
    const note = String(body.note ?? "").trim().slice(0, 2000);
    // Call notes / reason mandatory for general status updates — but NOT for
    // Payment Approval submissions (the uploaded proof is the evidence).
    if (user.role === "AGENT" && !note && status !== "PAYMENT_PENDING") {
      return NextResponse.json({ error: "Call notes / reason is required for this status change" }, { status: 400 });
    }
    const allowedOutcomes = ["CONNECTED", "NO_ANSWER", "BUSY", "WRONG_NUMBER", "SWITCHED_OFF"];
    const callStatus = allowedOutcomes.includes(String(body.callStatus)) ? String(body.callStatus) : undefined;

    // Callback scheduling: require & store date-time when status is CALLBACK
    let callbackAt: Date | undefined;
    if (status === "CALLBACK") {
      if (!body.callbackAt) {
        return NextResponse.json({ error: "Callback date & time is required" }, { status: 400 });
      }
      const dt = new Date(body.callbackAt);
      if (isNaN(dt.getTime())) return NextResponse.json({ error: "Invalid callback date" }, { status: 400 });
      callbackAt = dt;
    }

    // Automated unassignment: 'No Response' and 'Reject/Not Interest' leads return to
    // the unassigned pool immediately (status label PRESERVED) for future recycling.
    const autoUnassign = status === "NO_RESPONSE" || status === "REJECTED";
    await db
      .update(leads)
      .set({
        status,
        ...(callStatus ? { callStatus } : {}),
        ...(callbackAt ? { callbackAt } : {}),
        ...(autoUnassign ? { assignedTo: null, assignedAt: null, unlocked: false } : {}),
        lastActivityAt: new Date(),
      })
      .where(eq(leads.id, leadId));
    if (note) {
      await db.insert(leadNotes).values({ leadId, agentId: user.id, note, status });
    }
    // Track call duration: start time saved on tel: click, end time = now
    let durationSec = 0;
    if (body.callStartedAt) {
      const start = new Date(body.callStartedAt);
      const end = new Date();
      durationSec = Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
      await db.insert(callLogs).values({ leadId, agentId: user.id, startedAt: start, endedAt: end, durationSec });
    }
    await db.insert(auditLogs).values({
      userId: user.id,
      leadId,
      action: "STATUS_CHANGE",
      detail: `${lead.status} → ${status}${durationSec ? ` (call ${durationSec}s)` : ""}${autoUnassign ? " — auto-unassigned to pool (status preserved)" : ""}`,
    });
    await bumpDailyStats(user.id, { touched: 1, statusChanges: lead.status !== status ? 1 : 0 });
    return NextResponse.json({ ok: true, durationSec });
  }

  // ── Submit deal for payment approval (or re-upload after rejection) ──
  if (action === "deal-submit") {
    const leadId = Number(body.leadId);
    const amount = Math.max(0, Number(body.amount) || 0); // exact Deal Value paid by customer
    // Tiered slab commission: per-agent custom rates override global tiers
    const closes = await closesForAgent(user.id);
    const commission = await slabAmountForCloses(closes + 1, user.id);
    await db.insert(deals).values({
      leadId,
      agentId: user.id,
      amount,
      commission,
      screenshotUrl: body.screenshotUrl ?? null,
      note: body.note ? String(body.note).slice(0, 1000) : null,
    });
    await db
      .update(leads)
      .set({ status: "PAYMENT_PENDING", dealAmount: amount, lastActivityAt: new Date() })
      .where(eq(leads.id, leadId));
    await db
      .update(users)
      .set({ walletPending: user.walletPending + commission })
      .where(eq(users.id, user.id));
    await db.insert(auditLogs).values({
      userId: user.id,
      leadId,
      action: "DEAL_SUBMITTED",
      detail: `Deal ₹${amount} submitted with payment proof — commission ₹${commission} pending approval`,
    });
    return NextResponse.json({ ok: true, commission });
  }

  // ── "Any Mistake Happen?" correction request ─────────────────────
  if (action === "correction") {
    const leadId = Number(body.leadId);
    await db.insert(corrections).values({
      leadId,
      agentId: user.id,
      reason: String(body.reason ?? "").slice(0, 1000),
      requestedStatus: body.requestedStatus ?? null,
    });
    await db.insert(auditLogs).values({
      userId: user.id,
      leadId,
      action: "CORRECTION_REQUEST",
      detail: `Requested correction → ${body.requestedStatus ?? "review"}: ${body.reason}`,
    });
    return NextResponse.json({ ok: true });
  }

  // ── Request new leads (agent finished daily list) ────────────────
  if (action === "lead-request") {
    await db.insert(leadRequests).values({
      agentId: user.id,
      type: "NEW",
      note: String(body.note ?? "").slice(0, 500),
    });
    await db.insert(auditLogs).values({
      userId: user.id,
      action: "LEAD_REQUEST",
      detail: "Agent requested new leads",
    });
    return NextResponse.json({ ok: true });
  }

  // ── Request Replace Lead (with mandatory reason) ──────────────────
  if (action === "replace-request") {
    const leadId = Number(body.leadId);
    const reason = String(body.reason ?? "").trim().slice(0, 1000);
    if (!reason) return NextResponse.json({ error: "Reason for replacement is required" }, { status: 400 });
    const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    if (user.role === "AGENT" && lead.assignedTo !== user.id) {
      return NextResponse.json({ error: "Not your lead" }, { status: 403 });
    }
    await db.insert(leadRequests).values({ agentId: user.id, leadId, type: "REPLACE", note: reason });
    await db.insert(auditLogs).values({
      userId: user.id,
      leadId,
      action: "REPLACE_REQUEST",
      detail: `Agent requested lead replacement: ${reason}`,
    });
    return NextResponse.json({ ok: true });
  }

  // ── "Remove Lead / I Lost My Efforts" → Lost pool with reason ─────
  if (action === "lost-lead") {
    const leadId = Number(body.leadId);
    const reason = String(body.reason ?? "").trim().slice(0, 1000);
    if (!reason) return NextResponse.json({ error: "Reason is required" }, { status: 400 });
    const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    if (user.role === "AGENT" && lead.assignedTo !== user.id) {
      return NextResponse.json({ error: "Not your lead" }, { status: 403 });
    }
    await db
      .update(leads)
      .set({ status: "LOST", assignedTo: null, assignedAt: null, unlocked: false, lastActivityAt: new Date() })
      .where(eq(leads.id, leadId));
    await db.insert(leadNotes).values({ leadId, agentId: user.id, note: `[Lost / Returned to Pool] ${reason}`, status: "LOST" });
    await db.insert(auditLogs).values({
      userId: user.id,
      leadId,
      action: "LEAD_LOST",
      detail: `Agent surrendered lead to Lost pool: ${reason}`,
    });
    return NextResponse.json({ ok: true });
  }

  // ── Request History Access (past notes locked by admin toggle) ────
  if (action === "history-request") {
    const leadId = Number(body.leadId);
    await db.insert(leadRequests).values({
      agentId: user.id,
      leadId,
      type: "HISTORY",
      note: String(body.note ?? "Requesting access to previous agents' call notes").slice(0, 500),
    });
    await db.insert(auditLogs).values({
      userId: user.id,
      leadId,
      action: "HISTORY_REQUEST",
      detail: "Agent requested access to past call-note history",
    });
    return NextResponse.json({ ok: true });
  }

  // ── Wallet withdrawal request ────────────────────────────────────
  if (action === "withdrawal") {
    const amount = Math.max(0, Number(body.amount) || 0);
    if (amount > user.walletApproved) {
      return NextResponse.json({ error: "Amount exceeds approved wallet balance" }, { status: 400 });
    }
    await db.insert(withdrawals).values({ agentId: user.id, amount });
    await db.insert(auditLogs).values({
      userId: user.id,
      action: "WITHDRAWAL_REQUEST",
      detail: `Requested withdrawal of ₹${amount}`,
    });
    return NextResponse.json({ ok: true });
  }

  // ── Save payout details (locks permanently once staff-approved) ──
  if (action === "payment-details") {
    if (user.role === "AGENT" && user.paymentDetailsStatus === "APPROVED") {
      return NextResponse.json(
        { error: "Payment details are locked after approval. Ask HR/Admin to unlock them." },
        { status: 403 }
      );
    }
    await db
      .update(users)
      .set({
        upiId: body.upiId ?? null,
        bankAccount: body.bankAccount ?? null,
        ifsc: body.ifsc ?? null,
        paymentDetailsStatus: "SUBMITTED",
      })
      .where(eq(users.id, user.id));
    await db.insert(auditLogs).values({
      userId: user.id,
      action: "PAYMENT_DETAILS_SUBMITTED",
      detail: "Bank/UPI details submitted — awaiting HR/Admin approval lock",
    });
    return NextResponse.json({ ok: true });
  }

  // ── KYC extra fields (phones, qualification) ─────────────────────
  if (action === "kyc-fields") {
    await db
      .update(users)
      .set({
        phone: body.phone ? String(body.phone).slice(0, 15) : user.phone,
        altPhone: body.altPhone ? String(body.altPhone).slice(0, 15) : null,
        guardianPhone: body.guardianPhone ? String(body.guardianPhone).slice(0, 15) : null,
        qualification: body.qualification ? String(body.qualification).slice(0, 60) : null,
      })
      .where(eq(users.id, user.id));
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
