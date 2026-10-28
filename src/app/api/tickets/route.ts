import { NextRequest, NextResponse } from "next/server";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, ticketMessages, tickets, users } from "@/db/schema";
import { getSessionUser, isStaff } from "@/lib/auth";
import { notifyAgent } from "@/lib/alerts";

export const dynamic = "force-dynamic";

const CATEGORIES = ["ACCESS_ISSUE", "DATA_CORRECTION", "PAYOUT_QUERY", "LEAD_ISSUE", "OTHER"];
const STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];

// GET — agent: own tickets; staff: unified help desk. ?ticketId= → thread messages.
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ticketId = req.nextUrl.searchParams.get("ticketId");
  if (ticketId) {
    const [t] = await db.select().from(tickets).where(eq(tickets.id, Number(ticketId))).limit(1);
    if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 });
    // Private thread: strictly the ticket's agent + higher officials
    if (user.role === "AGENT" && t.agentId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const msgs = await db
      .select()
      .from(ticketMessages)
      .where(eq(ticketMessages.ticketId, t.id))
      .orderBy(asc(ticketMessages.createdAt))
      .limit(200);
    const people = await db.select({ id: users.id, name: users.name, role: users.role }).from(users);
    const pmap = Object.fromEntries(people.map((p) => [p.id, p]));
    return NextResponse.json({
      ticket: t,
      messages: msgs.map((m) => ({
        ...m,
        senderName: pmap[m.senderId]?.name ?? `#${m.senderId}`,
        senderRole: pmap[m.senderId]?.role ?? "?",
        mine: m.senderId === user.id,
      })),
    });
  }

  const rows = isStaff(user.role)
    ? await db.select().from(tickets).orderBy(desc(tickets.updatedAt)).limit(200)
    : await db.select().from(tickets).where(eq(tickets.agentId, user.id)).orderBy(desc(tickets.updatedAt)).limit(100);

  const people = await db.select({ id: users.id, name: users.name }).from(users);
  const pmap = Object.fromEntries(people.map((p) => [p.id, p.name]));
  return NextResponse.json({
    rows: rows.map((t) => ({ ...t, agentName: pmap[t.agentId] ?? `#${t.agentId}` })),
    isStaff: isStaff(user.role),
  });
}

// POST — create ticket { category, details, attachmentUrl? } or message { ticketId, body }
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();

  // ── Ticket chat message ──
  if (body.ticketId) {
    const [t] = await db.select().from(tickets).where(eq(tickets.id, Number(body.ticketId))).limit(1);
    if (!t) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    if (user.role === "AGENT" && t.agentId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const text = String(body.body ?? "").trim().slice(0, 2000);
    if (!text) return NextResponse.json({ error: "Empty message" }, { status: 400 });
    const [row] = await db.insert(ticketMessages).values({ ticketId: t.id, senderId: user.id, body: text }).returning();
    await db
      .update(tickets)
      .set({ updatedAt: new Date(), status: t.status === "OPEN" && isStaff(user.role) ? "IN_PROGRESS" : t.status })
      .where(eq(tickets.id, t.id));
    return NextResponse.json({ row });
  }

  // ── New ticket ──
  const category = CATEGORIES.includes(String(body.category)) ? String(body.category) : "OTHER";
  const details = String(body.details ?? "").trim().slice(0, 3000);
  if (!details) return NextResponse.json({ error: "Issue details are required" }, { status: 400 });

  // Unique random ticket number e.g. TKT-84920
  let ticketNo = "";
  for (let i = 0; i < 8; i++) {
    const candidate = `TKT-${Math.floor(10000 + Math.random() * 90000)}`;
    const [dup] = await db.select({ id: tickets.id }).from(tickets).where(eq(tickets.ticketNo, candidate)).limit(1);
    if (!dup) {
      ticketNo = candidate;
      break;
    }
  }
  if (!ticketNo) ticketNo = `TKT-${Date.now().toString().slice(-6)}`;

  const [row] = await db
    .insert(tickets)
    .values({
      ticketNo,
      agentId: user.id,
      category,
      details,
      attachmentUrl: body.attachmentUrl ? String(body.attachmentUrl) : null,
    })
    .returning();
  await db.insert(auditLogs).values({
    userId: user.id,
    action: "TICKET_CREATED",
    detail: `${ticketNo} (${category}): ${details.slice(0, 80)}`,
  });
  return NextResponse.json({ row });
}

// DELETE ?ticketId= — staff clear the private chat history of a ticket
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !isStaff(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const ticketId = Number(req.nextUrl.searchParams.get("ticketId"));
  const [t] = await db.select().from(tickets).where(eq(tickets.id, ticketId)).limit(1);
  if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await db.delete(ticketMessages).where(eq(ticketMessages.ticketId, ticketId));
  await db.insert(auditLogs).values({ userId: user.id, action: "TICKET_CHAT_CLEARED", detail: `Chat cleared on ${t.ticketNo}` });
  return NextResponse.json({ ok: true });
}

// PATCH { ticketId, status } — staff update ticket status
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !isStaff(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { ticketId, status } = await req.json();
  if (!STATUSES.includes(status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  const [t] = await db
    .update(tickets)
    .set({ status, updatedAt: new Date() })
    .where(eq(tickets.id, Number(ticketId)))
    .returning();
  if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await db.insert(auditLogs).values({ userId: user.id, action: "TICKET_STATUS", detail: `${t.ticketNo} → ${status}` });
  if (status === "RESOLVED" || status === "CLOSED" || status === "IN_PROGRESS") {
    await notifyAgent({
      agentId: t.agentId,
      kind: "TICKET",
      decision: status,
      title: `🎫 Ticket ${t.ticketNo} ${status === "IN_PROGRESS" ? "In Progress" : status === "RESOLVED" ? "Resolved ✅" : "Closed"}`,
      body:
        status === "RESOLVED"
          ? `Management resolved your ${t.category.replace("_", " ").toLowerCase()} ticket. Open it to read their replies.`
          : status === "CLOSED"
            ? `Your ticket ${t.ticketNo} has been closed.`
            : `Management picked up your ticket ${t.ticketNo} and is working on it.`,
    });
  }
  return NextResponse.json({ ok: true });
}
