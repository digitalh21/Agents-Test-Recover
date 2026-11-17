import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { getSessionUser, isStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";

// POST { name, email, phone?, role? } — Add Manual Agent (Admin/HR/Manager)
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !isStaff(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const name = String(body.name ?? "").trim().slice(0, 100);
  const email = String(body.email ?? "").trim().toLowerCase().slice(0, 150);
  if (!name || !email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid name and email are required" }, { status: 400 });
  }
  const role = ["AGENT", "MANAGER", "HR"].includes(String(body.role)) ? String(body.role) : "AGENT";
  // Only ADMIN can create HR/MANAGER accounts
  if (role !== "AGENT" && user.role !== "ADMIN") {
    return NextResponse.json({ error: "Only ADMIN can create HR/Manager accounts" }, { status: 403 });
  }

  const [dup] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (dup) return NextResponse.json({ error: "A user with this email already exists" }, { status: 400 });

  const [row] = await db
    .insert(users)
    .values({
      name,
      email,
      role,
      phone: body.phone ? String(body.phone).replace(/\D/g, "").slice(-10) : null,
      dailyLeadQuota: body.dailyLeadQuota ? Math.max(0, Number(body.dailyLeadQuota) || 0) : null,
    })
    .returning();

  await db.insert(auditLogs).values({
    userId: user.id,
    action: "AGENT_CREATED",
    detail: `Manual ${role.toLowerCase()} account created: ${name} (${email})`,
  });
  return NextResponse.json({ row: { id: row.id, name: row.name, email: row.email, role: row.role } });
}
