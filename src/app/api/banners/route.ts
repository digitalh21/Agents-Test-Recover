import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, bannerAcks, banners, users } from "@/db/schema";
import { getSessionUser, isStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET — staff: all banners + ack history. Agent: own banners + ack state (?pending=1 → first unacked popup).
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (isStaff(user.role)) {
    const [rows, acks, people] = await Promise.all([
      db.select().from(banners).orderBy(desc(banners.createdAt)).limit(100),
      db.select().from(bannerAcks).orderBy(desc(bannerAcks.createdAt)).limit(500),
      db.select({ id: users.id, name: users.name }).from(users),
    ]);
    const pmap = Object.fromEntries(people.map((p) => [p.id, p.name]));
    return NextResponse.json({
      isStaff: true,
      rows: rows.map((b) => ({
        ...b,
        senderName: pmap[b.senderId] ?? `#${b.senderId}`,
        targetName: b.targetAgentId ? pmap[b.targetAgentId] ?? `#${b.targetAgentId}` : "All Agents",
        acks: acks
          .filter((a) => a.bannerId === b.id)
          .map((a) => ({ agentName: pmap[a.agentId] ?? `#${a.agentId}`, response: a.response, createdAt: a.createdAt })),
      })),
    });
  }

  // Agent view: banners targeting them or all agents
  const rows = await db
    .select()
    .from(banners)
    .where(or(isNull(banners.targetAgentId), eq(banners.targetAgentId, user.id)))
    .orderBy(desc(banners.createdAt))
    .limit(50);
  const ackRows = rows.length
    ? await db
        .select()
        .from(bannerAcks)
        .where(and(eq(bannerAcks.agentId, user.id), inArray(bannerAcks.bannerId, rows.map((r) => r.id))))
    : [];
  const ackMap = Object.fromEntries(ackRows.map((a) => [a.bannerId, a]));
  const decorated = rows.map((b) => ({
    ...b,
    acked: !!ackMap[b.id],
    ackAt: ackMap[b.id]?.createdAt ?? null,
    myResponse: ackMap[b.id]?.response ?? null,
  }));

  if (req.nextUrl.searchParams.get("pending") === "1") {
    const pending = decorated.find((b) => b.requireAck && !b.acked) ?? null;
    return NextResponse.json({ isStaff: false, pending, latest: decorated.find((b) => b.acked) ?? null });
  }
  return NextResponse.json({ isStaff: false, rows: decorated });
}

// POST — staff create broadcast { title, body, imageUrl?, targetAgentId? } | agent ack { ackBannerId, response? }
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();

  // ── Agent acknowledgment ──
  if (body.ackBannerId) {
    const [b] = await db.select().from(banners).where(eq(banners.id, Number(body.ackBannerId))).limit(1);
    if (!b) return NextResponse.json({ error: "Banner not found" }, { status: 404 });
    await db
      .insert(bannerAcks)
      .values({ bannerId: b.id, agentId: user.id, response: body.response ? String(body.response).slice(0, 500) : null })
      .onConflictDoNothing();
    await db.insert(auditLogs).values({
      userId: user.id,
      action: "BANNER_ACK",
      detail: `Acknowledged broadcast "${b.title}"${body.response ? ` — reply: ${String(body.response).slice(0, 60)}` : ""}`,
    });
    return NextResponse.json({ ok: true });
  }

  // ── Staff broadcast creation ──
  if (!isStaff(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const title = String(body.title ?? "").trim().slice(0, 150);
  const text = String(body.body ?? "").trim().slice(0, 2000);
  if (!title || !text) return NextResponse.json({ error: "Title and message are required" }, { status: 400 });

  const [row] = await db
    .insert(banners)
    .values({
      senderId: user.id,
      title,
      body: text,
      imageUrl: body.imageUrl ? String(body.imageUrl) : null,
      targetAgentId: body.targetAgentId ? String(body.targetAgentId) : null,
      requireAck: body.requireAck !== false,
    })
    .returning();
  await db.insert(auditLogs).values({
    userId: user.id,
    action: "BANNER_BROADCAST",
    detail: `"${title}" → ${body.targetAgentId ? `agent #${body.targetAgentId}` : "All Agents"}${row.imageUrl ? " (with image)" : ""}`,
  });
  return NextResponse.json({ row });
}
