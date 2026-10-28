import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, earnings, users } from "@/db/schema";
import { getSessionUser, isStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";

// PATCH { id, status: "PENDING"|"APPROVED" } — staff toggle commission/bonus status
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !isStaff(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id, status } = await req.json();
  if (!["PENDING", "APPROVED"].includes(status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });

  const [row] = await db.select().from(earnings).where(eq(earnings.id, Number(id))).limit(1);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.status === status) return NextResponse.json({ ok: true });

  const [agent] = await db.select().from(users).where(eq(users.id, row.agentId)).limit(1);
  if (agent) {
    // Move amount between approved/pending wallets to mirror the status flip
    const delta = status === "APPROVED" ? row.amount : -row.amount;
    await db
      .update(users)
      .set({
        walletApproved: Math.max(0, agent.walletApproved + delta),
        walletPending: Math.max(0, agent.walletPending - delta),
      })
      .where(eq(users.id, agent.id));
  }
  await db.update(earnings).set({ status }).where(eq(earnings.id, row.id));
  await db.insert(auditLogs).values({
    userId: user.id,
    action: "EARNING_STATUS",
    detail: `${row.kind} #${row.id} (₹${row.amount}, agent #${row.agentId}) → ${status}`,
  });
  return NextResponse.json({ ok: true });
}

// DELETE ?id= — staff remove an earnings entry entirely (agents can NEVER delete)
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !isStaff(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = Number(req.nextUrl.searchParams.get("id"));
  const [row] = await db.select().from(earnings).where(eq(earnings.id, id)).limit(1);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [agent] = await db.select().from(users).where(eq(users.id, row.agentId)).limit(1);
  if (agent) {
    await db
      .update(users)
      .set({
        walletTotal: Math.max(0, agent.walletTotal - row.amount),
        walletApproved: row.status === "APPROVED" ? Math.max(0, agent.walletApproved - row.amount) : agent.walletApproved,
        walletPending: row.status === "PENDING" ? Math.max(0, agent.walletPending - row.amount) : agent.walletPending,
      })
      .where(eq(users.id, agent.id));
  }
  await db.delete(earnings).where(eq(earnings.id, id));
  await db.insert(auditLogs).values({
    userId: user.id,
    action: "EARNING_DELETED",
    detail: `Removed ${row.kind} #${row.id} ₹${row.amount} from agent #${row.agentId} (${row.businessName})`,
  });
  return NextResponse.json({ ok: true });
}
