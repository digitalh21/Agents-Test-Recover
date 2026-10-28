import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { getSessionUser, isStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/audit?page=1&userId= — full timestamped audit trail (staff only)
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !isStaff(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, Number(sp.get("page") ?? 1));
  const userId = sp.get("userId");
  const pageSize = 100;

  const rows = await db
    .select()
    .from(auditLogs)
    .where(userId ? eq(auditLogs.userId, userId) : undefined)
    .orderBy(desc(auditLogs.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const allUsers = await db.select({ id: users.id, name: users.name, role: users.role }).from(users);
  const userMap = Object.fromEntries(allUsers.map((u) => [u.id, `${u.name} (${u.role})`]));

  return NextResponse.json({
    rows: rows.map((r) => ({ ...r, userName: r.userId ? userMap[r.userId] ?? `User #${r.userId}` : "System" })),
    page,
    users: allUsers,
  });
}
