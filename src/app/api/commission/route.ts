import { NextRequest, NextResponse } from "next/server";
import { and, asc, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, commissionSlabs, earnings, users } from "@/db/schema";
import { getSessionUser, isStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET — current slabs (any logged-in user can view their earning structure)
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const slabs = await db.select().from(commissionSlabs).orderBy(asc(commissionSlabs.minCloses));
  return NextResponse.json({ slabs, canEdit: isStaff(user.role) });
}

// PUT { slabs: [{id, amount}] } — staff edit per-slab rates
export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !isStaff(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { slabs } = await req.json();
  if (!Array.isArray(slabs)) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  for (const s of slabs) {
    const amount = Math.max(0, Number(s.amount) || 0);
    await db.update(commissionSlabs).set({ amount }).where(eq(commissionSlabs.id, Number(s.id)));
  }
  await db.insert(auditLogs).values({
    userId: user.id,
    action: "COMMISSION_SLABS_UPDATE",
    detail: `Slab rates updated: ${slabs.map((s: { id: number; amount: number }) => `#${s.id}→₹${s.amount}`).join(", ")}`,
  });
  const fresh = await db.select().from(commissionSlabs).orderBy(asc(commissionSlabs.minCloses));
  return NextResponse.json({ ok: true, slabs: fresh });
}

// POST { agentId, amount, note } — staff send a custom bonus
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !isStaff(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { agentId, amount, note } = await req.json();
  const amt = Math.max(1, Number(amount) || 0);
  const [agent] = await db.select().from(users).where(eq(users.id, agentId)).limit(1);
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

  await db.insert(earnings).values({
    agentId: agent.id,
    kind: "BONUS",
    leadId: 0,
    leadName: null,
    businessName: String(note ?? "Performance Bonus").slice(0, 120),
    amount: amt,
    approvedAt: new Date(),
  });
  await db
    .update(users)
    .set({ walletTotal: agent.walletTotal + amt, walletApproved: agent.walletApproved + amt })
    .where(eq(users.id, agent.id));
  await db.insert(auditLogs).values({
    userId: user.id,
    action: "BONUS_SENT",
    detail: `₹${amt} bonus sent to ${agent.name} — "${note ?? "Performance Bonus"}"`,
  });

  // How many closes so far (for the response context)
  const [{ closes }] = await db
    .select({ closes: count() })
    .from(earnings)
    .where(and(eq(earnings.agentId, agent.id), eq(earnings.kind, "COMMISSION")));
  return NextResponse.json({ ok: true, closes: Number(closes) });
}
