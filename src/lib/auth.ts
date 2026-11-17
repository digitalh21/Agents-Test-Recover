import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

export type SessionUser = typeof users.$inferSelect;

export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const store = await cookies();
    const uid = store.get("tc_uid")?.value;
    if (!uid) return null;
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, uid))
      .limit(1);
    return user ?? null;
  } catch {
    return null;
  }
}

export function isStaff(role: string) {
  return role === "ADMIN" || role === "HR" || role === "MANAGER";
}
