import { NextRequest, NextResponse } from "next/server";
import { and, count, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { agentDailyStats, auditLogs, earnings, leads, timeTracks, uploads, users, withdrawals } from "@/db/schema";
import { getSessionUser, isStaff } from "@/lib/auth";
import { closesForAgent, effectiveSlabsForAgent, slabAmountForCloses, tierIndexForCloses, TIER_BOUNDS } from "@/lib/commission";

export const dynamic = "force-dynamic";

// GET ?userId= — profile bundle: wallet, itemized earnings (commission vs bonus),
// KYC docs, payouts, daily activity logs, pipeline breakdown, slab position.
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const requested = req.nextUrl.searchParams.get("userId") ?? user.id;
  const targetId = user.role === "AGENT" ? user.id : requested;

  const [target] = await db.select().from(users).where(eq(users.id, targetId)).limit(1);
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const day = new Date().toISOString().slice(0, 10);
  const [earningRows, withdrawalRows, uploadRows, [today], timeRows, dailyRows, pipelineCounts] = await Promise.all([
    db.select().from(earnings).where(eq(earnings.agentId, targetId)).orderBy(desc(earnings.approvedAt)).limit(100),
    db.select().from(withdrawals).where(eq(withdrawals.agentId, targetId)).orderBy(desc(withdrawals.createdAt)).limit(50),
    db.select().from(uploads).where(eq(uploads.userId, targetId)).orderBy(desc(uploads.createdAt)).limit(60),
    db.select().from(timeTracks).where(and(eq(timeTracks.agentId, targetId), eq(timeTracks.day, day))).limit(1),
    db.select().from(timeTracks).where(eq(timeTracks.agentId, targetId)).orderBy(desc(timeTracks.day)).limit(14),
    db.select().from(agentDailyStats).where(eq(agentDailyStats.agentId, targetId)).orderBy(desc(agentDailyStats.day)).limit(14),
    db
      .select({ status: leads.status, n: count() })
      .from(leads)
      .where(and(eq(leads.assignedTo, targetId), eq(leads.archived, false)))
      .groupBy(leads.status),
  ]);

  // Merge active-time with activity counters into one daily log
  const timeMap = Object.fromEntries(timeRows.map((t) => [t.day, t.seconds]));
  const statMap = Object.fromEntries(dailyRows.map((s) => [s.day, s]));
  const allDays = [...new Set([...timeRows.map((t) => t.day), ...dailyRows.map((s) => s.day)])].sort().reverse().slice(0, 14);
  const dailyLog = allDays.map((d) => ({
    day: d,
    activeSeconds: timeMap[d] ?? 0,
    touchedLeads: statMap[d]?.touchedLeads ?? 0,
    statusChanges: statMap[d]?.statusChanges ?? 0,
    dealsClosed: statMap[d]?.dealsClosed ?? 0,
  }));

  const closes = await closesForAgent(targetId);
  const currentSlabAmount = await slabAmountForCloses(closes + 1, targetId);
  const slabInfo = await effectiveSlabsForAgent(targetId);
  const currentTier = tierIndexForCloses(closes + 1);

  // Rank among all agents by number of commission closes (1 = top closer)
  const allCloses = await db
    .select({ agentId: earnings.agentId, n: count() })
    .from(earnings)
    .where(eq(earnings.kind, "COMMISSION"))
    .groupBy(earnings.agentId);
  const sorted = allCloses.map((a) => ({ ...a, n: Number(a.n) })).sort((a, b) => b.n - a.n);
  const rankIdx = sorted.findIndex((a) => a.agentId === targetId);
  const rank = rankIdx === -1 ? sorted.length + 1 : rankIdx + 1;

  return NextResponse.json({
    profile: {
      id: target.id,
      name: target.name,
      email: target.email,
      role: target.role,
      phone: target.phone,
      altPhone: target.altPhone,
      guardianPhone: target.guardianPhone,
      qualification: target.qualification,
      aboutNote: target.aboutNote,
      badges: target.badges,
      avatarUrl: target.avatarUrl,
      upiId: target.upiId,
      bankAccount: target.bankAccount,
      ifsc: target.ifsc,
      paymentDetailsStatus: target.paymentDetailsStatus,
      walletTotal: target.walletTotal,
      walletPending: target.walletPending,
      walletApproved: target.walletApproved,
    },
    isStaffViewer: isStaff(user.role),
    viewingSelf: targetId === user.id,
    earnings: earningRows,
    withdrawals: withdrawalRows,
    kyc: uploadRows.filter((k) => k.kind.startsWith("kyc")),
    uploads: uploadRows,
    todaySeconds: today?.seconds ?? 0,
    dailyLog,
    pipeline: Object.fromEntries(pipelineCounts.map((p) => [p.status, Number(p.n)])),
    closes,
    currentSlabAmount,
    currentTier,
    slabTiers: TIER_BOUNDS.map((t, i) => ({
      label: t.label,
      amount: slabInfo.amounts[i],
      custom: slabInfo.custom[i],
    })),
    dailyLeadQuota: target.dailyLeadQuota,
    rank,
    totalAgents: sorted.length,
    withdrawnTotal: withdrawalRows.filter((w) => w.status === "APPROVED").reduce((a, w) => a + w.amount, 0),
  });
}

// PATCH — staff controls: about note, badges, payment-details approve/unlock
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !isStaff(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const targetId = body.userId;
  const [target] = await db.select().from(users).where(eq(users.id, targetId)).limit(1);
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const patch: Partial<typeof users.$inferInsert> = {};
  const actions: string[] = [];
  if (body.aboutNote !== undefined) {
    patch.aboutNote = String(body.aboutNote).slice(0, 2000);
    actions.push("updated About summary");
  }
  if (body.badges !== undefined) {
    patch.badges = String(body.badges).slice(0, 300);
    actions.push(`badges → ${body.badges}`);
  }
  if (body.paymentDetailsAction === "approve") {
    patch.paymentDetailsStatus = "APPROVED";
    actions.push("APPROVED & locked bank/UPI details");
  }
  if (body.paymentDetailsAction === "unlock") {
    patch.paymentDetailsStatus = "SUBMITTED";
    actions.push("unlocked bank/UPI details for editing");
  }
  // Per-agent 5-tier commission slabs → normalized agent_slabs table
  // (user_id/updated_by types derive from users.id via FK — exact type match)
  if (Array.isArray(body.slabs) && body.slabs.length === 5) {
    const { agentSlabs } = await import("@/db/schema");
    for (let i = 0; i < 5; i++) {
      const v = body.slabs[i];
      const tier = i + 1;
      if (v === null || v === "" || v === undefined) {
        // reset this tier to the global rate
        await db.delete(agentSlabs).where(and(eq(agentSlabs.userId, targetId), eq(agentSlabs.tier, tier)));
      } else {
        const amount = Math.max(0, Number(v) || 0);
        await db
          .insert(agentSlabs)
          .values({ userId: targetId, tier, amount, updatedBy: user.id })
          .onConflictDoUpdate({
            target: [agentSlabs.userId, agentSlabs.tier],
            set: { amount, updatedBy: user.id, updatedAt: new Date() },
          });
      }
    }
    actions.push(`custom commission slabs → [${body.slabs.map((v: unknown) => (v === null || v === "" ? "global" : `₹${v}`)).join(", ")}]`);
  }
  // Manual daily auto-assign lead quota
  if (body.dailyLeadQuota !== undefined) {
    patch.dailyLeadQuota =
      body.dailyLeadQuota === null || body.dailyLeadQuota === "" ? null : Math.max(0, Math.min(2000, Number(body.dailyLeadQuota) || 0));
    actions.push(`daily lead quota → ${patch.dailyLeadQuota ?? "default"}`);
  }
  if (Object.keys(patch).length === 0 && actions.length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  if (Object.keys(patch).length > 0) {
    await db.update(users).set(patch).where(eq(users.id, targetId));
  }
  await db.insert(auditLogs).values({
    userId: user.id,
    action: "PROFILE_STAFF_EDIT",
    detail: `On ${target.name}: ${actions.join("; ")}`,
  });
  return NextResponse.json({ ok: true });
}
