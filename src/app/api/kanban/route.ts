import { NextRequest, NextResponse } from "next/server";
import { and, count, desc, eq, gte, isNull, isNotNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { leads, niches, users } from "@/db/schema";
import { getSessionUser, isStaff } from "@/lib/auth";
import { getVisibilityMap } from "@/lib/field-visibility";
import { applyFieldVisibility } from "@/lib/fields";

export const dynamic = "force-dynamic";

const CARDS_PER_COLUMN = 25;

// A. Assigned Leads Pipeline — 7 stages (Closed Won = management only)
const ASSIGNED_COLUMNS = [
  { key: "NEW", label: "New (assigned today)" },
  { key: "IN_PROGRESS", label: "In Process" },
  { key: "CALLBACK", label: "Call back" },
  { key: "NO_RESPONSE", label: "No Response" },
  { key: "REJECTED", label: "Reject/Not Interest" },
  { key: "PAYMENT_PENDING", label: "Payment Approval" },
  { key: "APPROVED", label: "Closed Won", staffOnly: true },
];

// B. Pool Leads Pipeline — fresh untouched inventory sitting in the general pool
const POOL_COLUMNS = [
  { key: "POOL_NEW", label: "New in Pool" },
  { key: "POOL_CALLBACK", label: "Call back (Pool)" },
];

// C. Unassigned Pipeline — leads whose assignment was removed/cleared
const UNASSIGNED_COLUMNS = [
  { key: "POOL_NO_RESPONSE", label: "No Response" },
  { key: "POOL_REJECTED", label: "Reject/Not Interest" },
  { key: "POOL_LOST", label: "Lost / Returned" },
];

// GET /api/kanban?pipeline=assigned|pool|unassigned&niche=slug — three-tier pipelines for ADMIN/HR/MANAGER
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !isStaff(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const p = req.nextUrl.searchParams.get("pipeline");
  const pipeline = p === "unassigned" ? "unassigned" : p === "pool" ? "pool" : "assigned";
  const nicheSlug = req.nextUrl.searchParams.get("niche");
  let nicheId: number | null = null;
  if (nicheSlug && nicheSlug !== "all") {
    const [n] = await db.select().from(niches).where(eq(niches.slug, nicheSlug)).limit(1);
    nicheId = n?.id ?? null;
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const visibility = await getVisibilityMap(user.role);
  const agents = await db
    .select({ id: users.id, name: users.name, online: users.online })
    .from(users)
    .where(eq(users.role, "AGENT"));
  const agentMap = Object.fromEntries(agents.map((a) => [a.id, a]));

  const defs = pipeline === "assigned" ? ASSIGNED_COLUMNS : pipeline === "pool" ? POOL_COLUMNS : UNASSIGNED_COLUMNS;

  const columns = await Promise.all(
    defs.map(async (col) => {
      let conds;
      switch (col.key) {
        // ── Assigned pipeline ──
        case "NEW":
          // Leads assigned on the current day sit in 'New'
          conds = [eq(leads.status, "NEW"), isNotNull(leads.assignedTo), eq(leads.archived, false), gte(leads.assignedAt, todayStart)];
          break;
        case "APPROVED":
          conds = [eq(leads.status, "APPROVED")];
          break;
        // ── Unassigned pipeline (status labels permanently preserved) ──
        case "POOL_NEW":
          conds = [isNull(leads.assignedTo), eq(leads.status, "NEW"), eq(leads.archived, false)];
          break;
        case "POOL_CALLBACK":
          conds = [isNull(leads.assignedTo), eq(leads.status, "CALLBACK"), eq(leads.archived, false)];
          break;
        case "POOL_NO_RESPONSE":
          conds = [isNull(leads.assignedTo), eq(leads.status, "NO_RESPONSE"), eq(leads.archived, false)];
          break;
        case "POOL_REJECTED":
          conds = [isNull(leads.assignedTo), eq(leads.status, "REJECTED"), eq(leads.archived, false)];
          break;
        case "POOL_LOST":
          conds = [eq(leads.status, "LOST"), eq(leads.archived, false)];
          break;
        default:
          // Assigned pipeline mid-stages — must still carry an agent
          conds = [eq(leads.status, col.key), isNotNull(leads.assignedTo), eq(leads.archived, false)];
      }
      if (nicheId) conds.push(eq(leads.nicheId, nicheId));
      const where = and(...conds);

      const [cards, [{ total }]] = await Promise.all([
        db
          .select({
            id: leads.id,
            leadCode: leads.leadCode,
            businessName: leads.businessName,
            phone: leads.phone,
            city: leads.city,
            rating: leads.rating,
            reviewsCount: leads.reviewsCount,
            competitorReviews: leads.competitorReviews,
            status: leads.status,
            assignedTo: leads.assignedTo,
            assignedAt: leads.assignedAt,
            lastActivityAt: leads.lastActivityAt,
            dealAmount: leads.dealAmount,
          })
          .from(leads)
          .where(where)
          .orderBy(desc(leads.lastActivityAt), desc(leads.id))
          .limit(CARDS_PER_COLUMN),
        db.select({ total: count() }).from(leads).where(where),
      ]);

      return {
        key: col.key,
        label: col.label,
        staffOnly: !!(col as { staffOnly?: boolean }).staffOnly || pipeline === "unassigned",
        total: Number(total),
        cards: cards.map((c) => {
          const safe = applyFieldVisibility({ ...c }, visibility);
          const agent = c.assignedTo ? agentMap[c.assignedTo] : null;
          return {
            ...safe,
            agent: agent ? { id: agent.id, name: agent.name, online: agent.online } : null,
          };
        }),
      };
    })
  );

  return NextResponse.json({ pipeline, columns, agents });
}

// PATCH { leadId, toColumn } — drag-and-drop stage move (staff only)
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !isStaff(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { leadId, toColumn } = await req.json();
  const [lead] = await db.select().from(leads).where(eq(leads.id, Number(leadId))).limit(1);
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const now = new Date();
  const from = `${lead.assignedTo === null ? "pool/" : ""}${lead.status}`;

  // Pool columns: clear assignment, preserve the matching status label
  const poolStatus: Record<string, string> = {
    POOL_NEW: "NEW",
    POOL_CALLBACK: "CALLBACK",
    POOL_NO_RESPONSE: "NO_RESPONSE",
    POOL_REJECTED: "REJECTED",
    POOL_LOST: "LOST",
    UNASSIGNED: "NEW",
  };

  if (poolStatus[toColumn]) {
    await db
      .update(leads)
      .set({
        assignedTo: null,
        assignedAt: null,
        status: poolStatus[toColumn],
        unlocked: false,
        archived: false,
        lastActivityAt: now,
      })
      .where(eq(leads.id, lead.id));
  } else if (["NEW", "IN_PROGRESS", "CALLBACK", "NO_RESPONSE", "REJECTED", "PAYMENT_PENDING", "APPROVED", "LOST"].includes(toColumn)) {
    await db
      .update(leads)
      .set({ status: toColumn, archived: toColumn === "APPROVED" ? lead.archived : false, lastActivityAt: now })
      .where(eq(leads.id, lead.id));
  } else {
    return NextResponse.json({ error: "Invalid column" }, { status: 400 });
  }

  const { auditLogs } = await import("@/db/schema");
  await db.insert(auditLogs).values({
    userId: user.id,
    leadId: lead.id,
    action: "PIPELINE_MOVE",
    detail: `Kanban drag: ${from} → ${toColumn}`,
  });
  return NextResponse.json({ ok: true });
}
