import { NextResponse } from "next/server";
import { count, desc } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, leads, tickets, users } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET — live database connection & sync verification.
// Confirms the active PostgreSQL (Supabase in production) is serving
// reads/writes: table counts, latency, and the most recent write.
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const started = Date.now();
  try {
    const [[{ nLeads }], [{ nUsers }], [{ nTickets }], [lastWrite]] = await Promise.all([
      db.select({ nLeads: count() }).from(leads),
      db.select({ nUsers: count() }).from(users),
      db.select({ nTickets: count() }).from(tickets),
      db.select().from(auditLogs).orderBy(desc(auditLogs.id)).limit(1),
    ]);
    const latencyMs = Date.now() - started;

    const dbUrl = process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL || "";
    const isSupabase = dbUrl.includes("supabase");

    return NextResponse.json({
      connected: true,
      provider: isSupabase ? "Supabase PostgreSQL" : "PostgreSQL",
      latencyMs,
      tables: { leads: Number(nLeads), agents: Number(nUsers), tickets: Number(nTickets) },
      lastWrite: lastWrite
        ? { action: lastWrite.action, at: lastWrite.createdAt }
        : null,
      checkedAt: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { connected: false, error: e instanceof Error ? e.message : "connection failed" },
      { status: 500 }
    );
  }
}
