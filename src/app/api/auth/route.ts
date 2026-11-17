import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET → current session user + user directory (for login screen).
// Runs first-run bootstrap so an empty live database gets a default ADMIN.
export async function GET() {
  const { ensureBootstrap } = await import("@/lib/bootstrap");
  await ensureBootstrap();
  const user = await getSessionUser();
  const directory = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, online: users.online })
    .from(users)
    .orderBy(asc(users.id));
  return NextResponse.json({ user, directory });
}

// POST { userId } → login as demo user
export async function POST(req: NextRequest) {
  const { userId } = await req.json();
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  await db.update(users).set({ online: true }).where(eq(users.id, user.id));
  const res = NextResponse.json({ user });
  res.cookies.set("tc_uid", String(user.id), { httpOnly: true, path: "/", maxAge: 60 * 60 * 24 * 7 });
  return res;
}

// DELETE → logout
export async function DELETE() {
  const user = await getSessionUser();
  if (user) await db.update(users).set({ online: false }).where(eq(users.id, user.id));
  const res = NextResponse.json({ ok: true });
  res.cookies.set("tc_uid", "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
