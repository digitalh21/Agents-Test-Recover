import { NextRequest, NextResponse } from "next/server";
import { and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, leads, niches, users } from "@/db/schema";
import { getSessionUser, isStaff } from "@/lib/auth";
import { PAGE_SIZE } from "@/lib/utils";
import { getVisibilityMap } from "@/lib/field-visibility";
import { applyFieldVisibility } from "@/lib/fields";

export const dynamic = "force-dynamic";

// GET /api/leads?page=1&niche=slug&status=IN_PROGRESS&q=search&mine=1
// Server-side pagination: 500 leads/page — scales to 1M rows via indexes.
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, Number(sp.get("page") ?? 1));
  const nicheSlug = sp.get("niche");
  const status = sp.get("status");
  const q = sp.get("q")?.trim();
  const mine = sp.get("mine") === "1" || user.role === "AGENT";

  const filters = [] as (ReturnType<typeof eq> | ReturnType<typeof inArray>)[];
  if (mine) {
    filters.push(eq(leads.assignedTo, user.id));
    filters.push(eq(leads.archived, false));
  }
  // Agents never see leads from niches hidden by management
  if (user.role === "AGENT") {
    const visible = await db.select({ id: niches.id }).from(niches).where(eq(niches.visibleToAgents, true));
    if (visible.length) filters.push(inArray(leads.nicheId, visible.map((v) => v.id)));
  }
  if (nicheSlug && nicheSlug !== "all") {
    const [n] = await db.select().from(niches).where(eq(niches.slug, nicheSlug)).limit(1);
    if (n && (user.role !== "AGENT" || n.visibleToAgents)) filters.push(eq(leads.nicheId, n.id));
  }
  if (status && status !== "all") filters.push(eq(leads.status, status));
  if (q) filters.push(ilike(leads.businessName, `%${q}%`));

  const where = filters.length ? and(...filters) : undefined;

  const [rows, [{ total }], visibility, nicheRows] = await Promise.all([
    db
      .select({
        id: leads.id,
        nicheId: leads.nicheId,
        leadCode: leads.leadCode,
        cityKeyword: leads.cityKeyword,
        gmapLink: leads.gmapLink,
        businessName: leads.businessName,
        contactName: leads.contactName,
        phone: leads.phone,
        phoneNormalized: leads.phoneNormalized,
        city: leads.city,
        rating: leads.rating,
        reviewsCount: leads.reviewsCount,
        competitorReviews: leads.competitorReviews,
        opensAt: leads.opensAt,
        websiteStatus: leads.websiteStatus,
        websiteUrl: leads.websiteUrl,
        serviceStatus: leads.serviceStatus,
        callStatus: leads.callStatus,
        status: leads.status,
        assignedTo: leads.assignedTo,
        unlocked: leads.unlocked,
        archived: leads.archived,
        recycled: leads.recycled,
        lastActivityAt: leads.lastActivityAt,
        createdAt: leads.createdAt,
      })
      .from(leads)
      .where(where)
      .orderBy(desc(leads.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(leads).where(where),
    getVisibilityMap(user.role), // admin-managed RBAC field visibility
    db.select().from(niches),
  ]);

  const nicheMap = Object.fromEntries(nicheRows.map((n) => [n.id, n.name]));

  // Apply the dynamic field visibility engine server-side (Visible / Masked / Hidden)
  const safeRows = rows.map((r) => {
    const withCategory = { ...r, categoryName: nicheMap[r.nicheId] ?? null };
    // Agents with locked (unapproved) leads always get a masked phone, even if role rule is VISIBLE
    const forceMaskPhone = user.role === "AGENT" && !r.unlocked;
    return applyFieldVisibility(withCategory, visibility, { forceMaskPhone });
  });

  return NextResponse.json({
    rows: safeRows,
    fieldVisibility: visibility,
    total: Number(total),
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(Number(total) / PAGE_SIZE)),
  });
}

// POST — bulk CSV batch upload (staff only). Body: { nicheId, rows: [{businessName,phone,...}] }
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !isStaff(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { nicheId, rows } = await req.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "No rows supplied" }, { status: 400 });
  }
  // Full 14-field mapping: lead_code (auto), city_keyword, gmap_link, business_name,
  // rating, reviews_count(+competitor), niche_category, opens_at, phone(+normalized),
  // website_status, website_url, service_status, call_status, status.
  const clean = rows
    .filter((r: Record<string, string>) => r.businessName && r.phone)
    .map((r: Record<string, string>) => {
      const phone = String(r.phone).replace(/\D/g, "").slice(-10);
      const webStatus = ["ACTIVE", "BROKEN", "NONE"].includes(String(r.websiteStatus ?? "").toUpperCase())
        ? String(r.websiteStatus).toUpperCase()
        : null;
      const svcStatus = ["VERIFIED", "UNCLAIMED"].includes(String(r.serviceStatus ?? "").toUpperCase())
        ? String(r.serviceStatus).toUpperCase()
        : null;
      return {
        nicheId: Number(nicheId) || 1,
        businessName: String(r.businessName).slice(0, 200),
        contactName: r.contactName ? String(r.contactName).slice(0, 100) : null,
        phone,
        phoneNormalized: "+91" + phone,
        city: r.city ? String(r.city).slice(0, 80) : null,
        cityKeyword: r.cityKeyword ? String(r.cityKeyword).slice(0, 120) : r.city ? String(r.city).toLowerCase() : null,
        gmapLink: r.gmapLink ? String(r.gmapLink).slice(0, 500) : null,
        rating: Math.min(5, Math.max(0, Number(r.rating) || 0)),
        reviewsCount: Number(r.reviewsCount) || 0,
        competitorReviews: Number(r.competitorReviews) || 0,
        opensAt: r.opensAt ? String(r.opensAt).slice(0, 100) : null,
        websiteStatus: webStatus,
        websiteUrl: r.websiteUrl ? String(r.websiteUrl).slice(0, 500) : null,
        serviceStatus: svcStatus,
      };
    });

  // Insert in batches of 1000 (handles 5K–10K CSV files smoothly)
  let inserted = 0;
  for (let i = 0; i < clean.length; i += 1000) {
    const batch = clean.slice(i, i + 1000);
    await db.insert(leads).values(batch);
    inserted += batch.length;
  }
  // Backfill generated field values (lead serial code, normalized phone, city keyword)
  await db.execute(sql`
    UPDATE leads SET
      lead_code = 'LD-' || lpad(id::text, 7, '0'),
      phone_normalized = COALESCE(phone_normalized, '+91' || phone),
      city_keyword = COALESCE(city_keyword, lower(COALESCE(city, '')))
    WHERE lead_code IS NULL
  `);
  await db.insert(auditLogs).values({
    userId: user.id,
    action: "BULK_UPLOAD",
    detail: `Uploaded ${inserted} leads via CSV batch`,
  });
  return NextResponse.json({ inserted });
}

// PATCH — auto-assign / round-robin (staff only). Body: { action:"auto-assign", nicheId?, perAgent }
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !isStaff(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  if (body.action === "auto-assign") {
    const fallbackPerAgent = Math.min(500, Math.max(1, Number(body.perAgent) || 20));
    const agents = await db.select().from(users).where(eq(users.role, "AGENT")).orderBy(asc(users.id));
    if (agents.length === 0) return NextResponse.json({ error: "No agents" }, { status: 400 });

    // Respect each agent's manual daily lead quota: remaining = quota − already assigned today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const assignedToday = await db
      .select({ agentId: leads.assignedTo, n: count() })
      .from(leads)
      .where(and(isNotNull(leads.assignedTo), gte(leads.assignedAt, todayStart)))
      .groupBy(leads.assignedTo);
    const todayMap = Object.fromEntries(assignedToday.map((a) => [a.agentId, Number(a.n)]));

    const allocations = agents.map((a) => {
      const quota = a.dailyLeadQuota ?? fallbackPerAgent;
      return { agent: a, remaining: Math.max(0, quota - (todayMap[a.id] ?? 0)) };
    });
    const totalWanted = allocations.reduce((s, a) => s + a.remaining, 0);
    if (totalWanted === 0) {
      return NextResponse.json({ assigned: 0, agents: agents.length, note: "All agents already at their daily quota" });
    }

    const poolFilters = [isNull(leads.assignedTo), eq(leads.status, "NEW"), eq(leads.archived, false)];
    if (body.nicheId) poolFilters.push(eq(leads.nicheId, Number(body.nicheId)));

    const pool = await db
      .select({ id: leads.id })
      .from(leads)
      .where(and(...poolFilters))
      .orderBy(asc(leads.id))
      .limit(totalWanted);

    let assigned = 0;
    let cursor = 0;
    for (const alloc of allocations) {
      if (alloc.remaining === 0 || cursor >= pool.length) continue;
      const slice = pool.slice(cursor, cursor + alloc.remaining).map((l) => l.id);
      cursor += slice.length;
      if (slice.length === 0) continue;
      await db
        .update(leads)
        .set({ assignedTo: alloc.agent.id, assignedAt: new Date(), unlocked: false })
        .where(inArray(leads.id, slice));
      assigned += slice.length;
    }
    await db.insert(auditLogs).values({
      userId: user.id,
      action: "AUTO_ASSIGN",
      detail: `Quota-aware round-robin assigned ${assigned} leads across ${agents.length} agents (per-agent daily quotas respected, fallback ${fallbackPerAgent}/agent)`,
    });
    return NextResponse.json({ assigned, agents: agents.length });
  }

  if (body.action === "unlock-bulk") {
    const ids = (body.ids as number[]).slice(0, 1000);
    await db.update(leads).set({ unlocked: true }).where(inArray(leads.id, ids));
    await db.insert(auditLogs).values({
      userId: user.id,
      action: "LEAD_UNLOCK",
      detail: `Unlocked full prospect details for ${ids.length} leads`,
    });
    return NextResponse.json({ unlocked: ids.length });
  }

  // ── Bulk assign selected leads to one agent ──
  if (body.action === "bulk-assign") {
    const ids = (body.ids as number[]).slice(0, 1000);
    const agentId = body.agentId ? String(body.agentId) : "";
    if (!ids.length || !agentId) return NextResponse.json({ error: "ids and agentId required" }, { status: 400 });
    await db.update(leads).set({ assignedTo: agentId, assignedAt: new Date(), unlocked: false }).where(inArray(leads.id, ids));
    await db.insert(auditLogs).values({
      userId: user.id,
      action: "BULK_ASSIGN",
      detail: `Bulk-assigned ${ids.length} leads to agent #${agentId}`,
    });
    return NextResponse.json({ updated: ids.length });
  }

  // ── Bulk status change (assignment state untouched — status is decoupled) ──
  if (body.action === "bulk-status") {
    const ids = (body.ids as number[]).slice(0, 1000);
    const status = String(body.status);
    const valid = ["NEW", "IN_PROGRESS", "CALLBACK", "NO_RESPONSE", "REJECTED", "PAYMENT_PENDING", "APPROVED", "LOST"];
    if (!ids.length || !valid.includes(status)) return NextResponse.json({ error: "ids and valid status required" }, { status: 400 });
    await db.update(leads).set({ status, lastActivityAt: new Date() }).where(inArray(leads.id, ids));
    await db.insert(auditLogs).values({
      userId: user.id,
      action: "BULK_STATUS",
      detail: `Bulk status → ${status} on ${ids.length} leads`,
    });
    return NextResponse.json({ updated: ids.length });
  }

  // ── Bulk move to Pool (clears assignment, PRESERVES pipeline status) ──
  if (body.action === "bulk-pool") {
    const ids = (body.ids as number[]).slice(0, 1000);
    if (!ids.length) return NextResponse.json({ error: "ids required" }, { status: 400 });
    await db
      .update(leads)
      .set({ assignedTo: null, assignedAt: null, unlocked: false, lastActivityAt: new Date() })
      .where(inArray(leads.id, ids));
    await db.insert(auditLogs).values({
      userId: user.id,
      action: "BULK_POOL",
      detail: `Moved ${ids.length} leads to the Pool (statuses preserved)`,
    });
    return NextResponse.json({ updated: ids.length });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
