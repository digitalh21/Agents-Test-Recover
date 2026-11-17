"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Shell } from "@/components/shell";
import { KanbanBoard } from "@/components/kanban-board";
import { LeadModal } from "@/components/lead-modal";
import { Badge, Button, Card, Empty, Input, Modal, Select, Spinner, Stat, Tabs } from "@/components/ui";
import { cn, inr, LEAD_STATUSES, STATUS_COLORS, STATUS_LABELS } from "@/lib/utils";
import { numText, ratingText, type VisibilityMap } from "@/lib/fields";

type LeadRow = {
  id: number;
  nicheId: number;
  leadCode: string | null;
  cityKeyword: string | null;
  gmapLink: string | null;
  businessName: string | null;
  phone: string | null;
  phoneNormalized: string | null;
  city: string | null;
  rating: number | string | null;
  reviewsCount: number | string | null;
  competitorReviews: number | string | null;
  categoryName: string | null;
  opensAt: string | null;
  websiteStatus: string | null;
  websiteUrl: string | null;
  serviceStatus: string | null;
  callStatus: string | null;
  status: string | null;
  assignedTo: number | null;
  unlocked: boolean;
};
type Meta = {
  niches: { id: number; name: string; slug: string; icon: string }[];
  agents: { id: number; name: string; online: boolean }[];
  statusCounts: Record<string, number>;
  unassigned: number;
  me: { id: number; name: string; role: string };
};

// ─── Live database connection indicator ───────────────────────────
function DbStatusChip() {
  const [status, setStatus] = useState<{
    connected: boolean;
    provider?: string;
    latencyMs?: number;
    tables?: { leads: number; agents: number; tickets: number };
    lastWrite?: { action: string; at: string } | null;
  } | null>(null);

  useEffect(() => {
    const check = () =>
      fetch("/api/db-status")
        .then((r) => r.json())
        .then(setStatus)
        .catch(() => setStatus({ connected: false }));
    check();
    const t = setInterval(check, 30000);
    return () => clearInterval(t);
  }, []);

  if (!status) return <span className="mt-1 inline-block text-[10px] text-slate-400">⏳ Checking database…</span>;
  if (!status.connected)
    return (
      <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-rose-300 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700">
        🔴 Database disconnected
      </span>
    );
  return (
    <span
      className="mt-1 inline-flex flex-wrap items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700"
      title={status.lastWrite ? `Last write: ${status.lastWrite.action} @ ${status.lastWrite.at}` : undefined}
    >
      🟢 {status.provider} live · {status.latencyMs}ms · leads {status.tables?.leads.toLocaleString()} · agents{" "}
      {status.tables?.agents} · tickets {status.tables?.tickets}
      {status.lastWrite && <span className="text-emerald-600/80">· last write: {status.lastWrite.action}</span>}
    </span>
  );
}

function AdminLeads() {
  const params = useSearchParams();
  const niche = params.get("niche") ?? "all";
  const [meta, setMeta] = useState<Meta | null>(null);
  const [rows, setRows] = useState<LeadRow[] | null>(null);
  const [vis, setVisMap] = useState<VisibilityMap>({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [view, setView] = useState<"table" | "kanban">("table");
  const [viewLead, setViewLead] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busyMsg, setBusyMsg] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [showAddLead, setShowAddLead] = useState(false);
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [newAgent, setNewAgent] = useState({ name: "", email: "", phone: "", role: "AGENT", dailyLeadQuota: "" });
  const [agentBusy, setAgentBusy] = useState(false);
  const [newLead, setNewLead] = useState({ businessName: "", phone: "", contactName: "", city: "", nicheId: "", rating: "", reviewsCount: "", competitorReviews: "" });
  const [addBusy, setAddBusy] = useState(false);
  const [uploadNiche, setUploadNiche] = useState("1");
  const [perAgent, setPerAgent] = useState("25");
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvResult, setCsvResult] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadMeta = useCallback(() => {
    // Niche-filtered stats: tabs, unassigned pool and headline cards follow the sidebar selection
    fetch(`/api/meta?niche=${niche}`).then((r) => r.json()).then(setMeta);
  }, [niche]);

  const load = useCallback(async () => {
    setRows(null);
    const sp = new URLSearchParams({ page: String(page), niche, status });
    if (q.trim()) sp.set("q", q.trim());
    const d = await fetch(`/api/leads?${sp}`).then((r) => r.json());
    setRows(d.rows ?? []);
    setVisMap(d.fieldVisibility ?? {});
    setTotal(d.total ?? 0);
    setTotalPages(d.totalPages ?? 1);
    setSelected(new Set());
  }, [page, niche, status, q]);

  const router = useRouter();
  useEffect(() => {
    loadMeta();
  }, [loadMeta]);
  // Kanban pipeline is STRICTLY for ADMIN/HR/MANAGER — agents are bounced to their queue view
  useEffect(() => {
    if (meta?.me.role === "AGENT") router.replace("/agent");
  }, [meta, router]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    setPage(1);
  }, [niche, status]);



  async function runCron() {
    setBusyMsg("Running daily cleanup cron…");
    const d = await fetch("/api/cron/daily-cleanup", { method: "POST" }).then((r) => r.json());
    setBusyMsg(
      `🧹 Cleanup done — ${d.unassignedStaleLeads} returned to pool, ${d.recycledRejectedLeads} recycled, ${d.archivedApprovedLeads} archived`
    );
    load();
    loadMeta();
    setTimeout(() => setBusyMsg(null), 5000);
  }

  async function autoAssign() {
    setBusyMsg("Round-robin assigning…");
    const nicheId = meta?.niches.find((n) => n.slug === niche)?.id;
    const d = await fetch("/api/leads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "auto-assign", perAgent: Number(perAgent), nicheId }),
    }).then((r) => r.json());
    setBusyMsg(`✅ Assigned ${d.assigned} leads across ${d.agents} agents`);
    setShowAssign(false);
    load();
    loadMeta();
    setTimeout(() => setBusyMsg(null), 4000);
  }

  async function bulkAction(payload: Record<string, unknown>) {
    setBusyMsg("Applying bulk action…");
    const d = await fetch("/api/leads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => r.json());
    setBusyMsg(`✅ Bulk action done — ${d.updated ?? d.unlocked ?? 0} leads updated`);
    load();
    loadMeta();
    setTimeout(() => setBusyMsg(null), 3000);
  }

  function exportSelected() {
    const chosen = (rows ?? []).filter((r) => selected.has(r.id));
    const header = ["id", "leadCode", "businessName", "phone", "city", "category", "rating", "reviews", "competitorReviews", "status", "assignedTo"];
    const lines = [
      header.join(","),
      ...chosen.map((r) =>
        [
          r.id,
          r.leadCode ?? "",
          `"${String(r.businessName ?? "").replaceAll('"', '""')}"`,
          r.phone ?? "",
          r.city ?? "",
          r.categoryName ?? "",
          r.rating ?? "",
          r.reviewsCount ?? "",
          r.competitorReviews ?? "",
          r.status ?? "",
          r.assignedTo ? meta?.agents.find((a) => a.id === r.assignedTo)?.name ?? r.assignedTo : "Pool",
        ].join(",")
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `leads-export-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function unlockSelected() {
    if (selected.size === 0) return;
    setBusyMsg("Unlocking prospect details…");
    await fetch("/api/leads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "unlock-bulk", ids: [...selected] }),
    });
    setBusyMsg(`🔓 Unlocked ${selected.size} leads for agents`);
    load();
    setTimeout(() => setBusyMsg(null), 3000);
  }

  async function assignLead(leadId: number, agentId: string) {
    await fetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignedTo: agentId === "" ? null : Number(agentId) }),
    });
    load();
  }

  async function handleCsv(file: File) {
    setCsvBusy(true);
    setCsvResult(null);
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const idx = (names: string[]) => header.findIndex((h) => names.includes(h));
    const iBiz = idx(["businessname", "business_name", "business", "name"]);
    const iPhone = idx(["phone", "mobile", "number"]);
    const iContact = idx(["contactname", "contact_name", "contact"]);
    const iCity = idx(["city", "location"]);
    const iRating = idx(["rating"]);
    const iRev = idx(["reviews", "reviewscount", "reviews_count"]);
    const iComp = idx(["competitorreviews", "competitor_reviews", "competitor"]);
    const iKeyword = idx(["citykeyword", "city_keyword", "keyword"]);
    const iGmap = idx(["gmaplink", "gmap_link", "maps", "gmap"]);
    const iOpens = idx(["opensat", "opens_at", "hours", "workinghours"]);
    const iWebS = idx(["websitestatus", "website_status"]);
    const iWebU = idx(["websiteurl", "website_url", "website"]);
    const iSvc = idx(["servicestatus", "service_status"]);
    const parsed = lines.slice(1).map((l) => {
      const c = l.split(",");
      return {
        businessName: c[iBiz]?.trim(),
        phone: c[iPhone]?.trim(),
        contactName: iContact >= 0 ? c[iContact]?.trim() : undefined,
        city: iCity >= 0 ? c[iCity]?.trim() : undefined,
        rating: iRating >= 0 ? c[iRating]?.trim() : undefined,
        reviewsCount: iRev >= 0 ? c[iRev]?.trim() : undefined,
        competitorReviews: iComp >= 0 ? c[iComp]?.trim() : undefined,
        cityKeyword: iKeyword >= 0 ? c[iKeyword]?.trim() : undefined,
        gmapLink: iGmap >= 0 ? c[iGmap]?.trim() : undefined,
        opensAt: iOpens >= 0 ? c[iOpens]?.trim() : undefined,
        websiteStatus: iWebS >= 0 ? c[iWebS]?.trim() : undefined,
        websiteUrl: iWebU >= 0 ? c[iWebU]?.trim() : undefined,
        serviceStatus: iSvc >= 0 ? c[iSvc]?.trim() : undefined,
      };
    });
    // Batch in chunks of 2000 rows — handles 5K–10K CSVs smoothly
    let inserted = 0;
    for (let i = 0; i < parsed.length; i += 2000) {
      const d = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nicheId: Number(uploadNiche), rows: parsed.slice(i, i + 2000) }),
      }).then((r) => r.json());
      inserted += d.inserted ?? 0;
      setCsvResult(`Processing… ${inserted} inserted`);
    }
    setCsvResult(`✅ Imported ${inserted} leads`);
    setCsvBusy(false);
    load();
    loadMeta();
  }

  const statusTabs = [
    { key: "all", label: "All", count: total },
    ...LEAD_STATUSES.map((s) => ({ key: s, label: STATUS_LABELS[s], count: meta?.statusCounts[s] ?? 0 })),
  ];

  // Dynamic RBAC field visibility — HIDDEN columns/cells are not rendered at all
  const show = (key: string) => (vis[key] ?? "VISIBLE") !== "HIDDEN";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Leads Pipeline</h1>
          <p className="text-xs text-slate-500">
            Server-side pagination · 500 leads/page · built for 1M+ rows
          </p>
          <DbStatusChip />
        </div>
        <div className="grid grid-cols-2 gap-2 w-full sm:w-auto sm:flex sm:flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setView(view === "table" ? "kanban" : "table")}>
            {view === "table" ? "🗂 Kanban View" : "📋 Table View"}
          </Button>
          <Button variant="success" size="sm" onClick={() => setShowAddLead(true)}>
            ＋ Add Lead
          </Button>
          <Button variant="primary" size="sm" onClick={() => setShowUpload(true)}>
            📤 Bulk CSV Upload
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowAddAgent(true)}>
            🧑‍💼 Add Manual Agent
          </Button>
          <Button variant="success" size="sm" onClick={() => setShowAssign(true)}>
            🔁 Auto-Assign
          </Button>
          <Button variant="warning" size="sm" onClick={runCron}>
            🌙 Daily Cleanup
          </Button>
        </div>
      </div>

      {busyMsg && <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-3 text-sm text-indigo-700">{busyMsg}</div>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Total (filtered)" value={total.toLocaleString()} />
        <Stat label="Pool (Unassigned)" value={(meta?.unassigned ?? 0).toLocaleString()} accent="text-amber-600" />
        <Stat label="Payment Pending" value={(meta?.statusCounts.PAYMENT_PENDING ?? 0).toLocaleString()} accent="text-violet-600" />
        <Stat label="Closed / Approved" value={(meta?.statusCounts.APPROVED ?? 0).toLocaleString()} accent="text-emerald-600" />
      </div>

      {/* Live stage counters */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
        {(["IN_PROGRESS", "CALLBACK", "NO_RESPONSE", "PAYMENT_PENDING", "REJECTED", "LOST"] as const).map((s) => (
          <Card key={s} className="p-2.5 text-center">
            <p className="text-lg font-bold text-slate-900">{(meta?.statusCounts[s] ?? 0).toLocaleString()}</p>
            <p className="text-[10px] font-semibold text-slate-500 leading-tight">{STATUS_LABELS[s]}</p>
          </Card>
        ))}
      </div>

      <Tabs tabs={statusTabs} active={status} onChange={setStatus} />

      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
        <Input
          placeholder="Search business name… (press Enter)"
          className="sm:max-w-xs"
          defaultValue={q}
          onKeyDown={(e) => e.key === "Enter" && setQ((e.target as HTMLInputElement).value)}
        />
        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50/60 px-3 py-2 w-full">
            <span className="text-xs font-bold text-indigo-700">{selected.size} selected — Bulk Actions:</span>
            <Button variant="outline" size="sm" onClick={unlockSelected}>
              🔓 Unlock
            </Button>
            <select
              className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs"
              defaultValue=""
              onChange={async (e) => {
                if (!e.target.value) return;
                await bulkAction({ action: "bulk-assign", ids: [...selected], agentId: Number(e.target.value) });
                e.target.value = "";
              }}
            >
              <option value="">👤 Bulk Assign to…</option>
              {meta?.agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <select
              className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs"
              defaultValue=""
              onChange={async (e) => {
                if (!e.target.value) return;
                await bulkAction({ action: "bulk-status", ids: [...selected], status: e.target.value });
                e.target.value = "";
              }}
            >
              <option value="">🔄 Bulk Status…</option>
              {LEAD_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            <Button variant="outline" size="sm" onClick={() => bulkAction({ action: "bulk-pool", ids: [...selected] })}>
              🗃 Move to Pool
            </Button>
            <Button variant="outline" size="sm" onClick={exportSelected}>
              📥 Export CSV
            </Button>
          </div>
        )}
        <div className="sm:ml-auto flex items-center justify-between sm:justify-start gap-2 text-xs text-slate-500">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ← Prev
          </Button>
          <span className="whitespace-nowrap">
            Page <b>{page}</b> / {totalPages.toLocaleString()}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next →
          </Button>
        </div>
      </div>

      {rows === null ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <div className="space-y-3">
          <Empty icon="📭" text="No leads found. Click 'Add Lead' to create one." />
          <div className="flex justify-center gap-2">
            <Button variant="success" size="sm" onClick={() => setShowAddLead(true)}>
              ＋ Add Lead
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowUpload(true)}>
              📤 Bulk CSV Upload
            </Button>
          </div>
        </div>
      ) : view === "table" ? (
        <>
        {/* Mobile: card list */}
        <div className="md:hidden space-y-2.5">
          {rows.map((l) => (
            <Card key={l.id} className="p-3.5">
              <div className="flex items-start justify-between gap-2">
                <label className="flex items-start gap-2.5 min-w-0">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                    checked={selected.has(l.id)}
                    onChange={(e) => {
                      const s = new Set(selected);
                      if (e.target.checked) s.add(l.id);
                      else s.delete(l.id);
                      setSelected(s);
                    }}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {l.unlocked ? "🔓" : "🔒"} {show("business_name") ? (l.businessName ?? "—") : "(hidden)"}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {show("phone") && l.phone ? `+91 ${l.phone} · ` : ""}
                      {l.city ? `${l.city} · ` : ""}
                      <span className="text-slate-400">{show("lead_code") && l.leadCode ? l.leadCode : `#${l.id}`}</span>
                    </p>
                  </div>
                </label>
                {show("status") && l.status && (
                  <Badge className={cn("shrink-0", STATUS_COLORS[l.status] ?? "bg-slate-100 text-slate-600 border-slate-200")}>
                    {STATUS_LABELS[l.status] ?? l.status}
                  </Badge>
                )}
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-500">
                  {show("rating") && <span className="text-amber-600 font-semibold">★ {ratingText(l.rating)}</span>}
                  {show("reviews_count") && (
                    <>
                      {" "}· {numText(l.reviewsCount)} <span className="text-slate-300">vs</span>{" "}
                      <span className="text-rose-500 font-semibold">{numText(l.competitorReviews)}</span> rev
                    </>
                  )}
                </span>
                <select
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs max-w-[45%]"
                  value={l.assignedTo ?? ""}
                  onChange={(e) => assignLead(l.id, e.target.value)}
                >
                  <option value="">🗃 Pool</option>
                  {meta?.agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => setViewLead(l.id)}
                className="mt-2 w-full rounded-lg border border-indigo-200 bg-indigo-50 py-1.5 text-[11px] font-semibold text-indigo-600 hover:bg-indigo-100"
              >
                🔎 Open Lead / View Details
              </button>
            </Card>
          ))}
        </div>
        {/* Desktop: data table */}
        <Card className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm min-w-[900px]">
            <thead className="bg-slate-50 text-[11px] uppercase text-slate-400">
              <tr>
                <th className="px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={selected.size === rows.length && rows.length > 0}
                    onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())}
                  />
                </th>
                {show("lead_code") && <th className="px-3 py-2.5">Code</th>}
                {show("business_name") && <th className="px-3 py-2.5">Business</th>}
                {show("phone") && <th className="px-3 py-2.5">Phone</th>}
                {show("city_keyword") && <th className="px-3 py-2.5">Keyword</th>}
                {show("niche_category") && <th className="px-3 py-2.5">Category</th>}
                {show("rating") && <th className="px-3 py-2.5">★</th>}
                {show("reviews_count") && <th className="px-3 py-2.5">Rev vs Comp</th>}
                {show("opens_at") && <th className="px-3 py-2.5">Hours</th>}
                {show("website_status") && <th className="px-3 py-2.5">Web</th>}
                {show("service_status") && <th className="px-3 py-2.5">Service</th>}
                {show("call_status") && <th className="px-3 py-2.5">Call</th>}
                {show("status") && <th className="px-3 py-2.5">Status</th>}
                <th className="px-3 py-2.5">🔓</th>
                <th className="px-3 py-2.5">Assigned To</th>
                <th className="px-3 py-2.5">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id} className="border-t border-slate-100 hover:bg-indigo-50/30">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(l.id)}
                      onChange={(e) => {
                        const s = new Set(selected);
                        if (e.target.checked) s.add(l.id);
                        else s.delete(l.id);
                        setSelected(s);
                      }}
                    />
                  </td>
                  <td className="px-3 py-2 text-slate-400">#{l.id}</td>
                  {show("lead_code") && <td className="px-3 py-2 font-mono text-[11px] text-slate-500">{l.leadCode ?? "—"}</td>}
                  {show("business_name") && <td className="px-3 py-2 font-semibold">{l.businessName ?? "—"}</td>}
                  {show("phone") && <td className="px-3 py-2 whitespace-nowrap">{l.phone ?? "—"}</td>}
                  {show("city_keyword") && <td className="px-3 py-2 text-slate-500">{l.cityKeyword ?? l.city ?? "—"}</td>}
                  {show("niche_category") && <td className="px-3 py-2 text-slate-500">{l.categoryName ?? "—"}</td>}
                  {show("rating") && <td className="px-3 py-2 text-amber-600">{ratingText(l.rating)}</td>}
                  {show("reviews_count") && (
                    <td className="px-3 py-2 whitespace-nowrap">
                      {numText(l.reviewsCount)} <span className="text-slate-300">/</span>{" "}
                      <span className="text-rose-500">{numText(l.competitorReviews)}</span>
                    </td>
                  )}
                  {show("opens_at") && <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{l.opensAt ?? "—"}</td>}
                  {show("website_status") && (
                    <td className="px-3 py-2">
                      {l.websiteStatus ? (
                        <Badge
                          className={
                            l.websiteStatus === "ACTIVE"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : l.websiteStatus === "BROKEN"
                                ? "bg-rose-50 text-rose-700 border-rose-200"
                                : "bg-slate-100 text-slate-600 border-slate-200"
                          }
                        >
                          {l.websiteStatus}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </td>
                  )}
                  {show("service_status") && (
                    <td className="px-3 py-2">
                      {l.serviceStatus ? (
                        <Badge
                          className={
                            l.serviceStatus === "VERIFIED"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-amber-50 text-amber-700 border-amber-200"
                          }
                        >
                          {l.serviceStatus}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </td>
                  )}
                  {show("call_status") && <td className="px-3 py-2 text-slate-500">{l.callStatus ?? "—"}</td>}
                  {show("status") && (
                    <td className="px-3 py-2">
                      {l.status ? (
                        <Badge className={STATUS_COLORS[l.status] ?? "bg-slate-100 text-slate-600 border-slate-200"}>
                          {STATUS_LABELS[l.status] ?? l.status}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </td>
                  )}
                  <td className="px-3 py-2">{l.unlocked ? "🔓" : "🔒"}</td>
                  <td className="px-3 py-2">
                    <select
                      className="rounded border border-slate-200 bg-white px-1.5 py-1 text-xs"
                      value={l.assignedTo ?? ""}
                      onChange={(e) => assignLead(l.id, e.target.value)}
                    >
                      <option value="">🗃 Pool</option>
                      {meta?.agents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => setViewLead(l.id)}
                      className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-[10px] font-semibold text-indigo-600 hover:bg-indigo-100 whitespace-nowrap"
                    >
                      🔎 Open Lead
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        </>
      ) : (
        <KanbanBoard niche={niche} onOpenLead={(id) => setViewLead(id)} />
      )}

      {viewLead !== null && meta && (
        <LeadModal leadId={viewLead} agentName={meta.me.name} onClose={() => setViewLead(null)} onChanged={load} />
      )}

      {/* Add manual agent modal */}
      <Modal open={showAddAgent} onClose={() => setShowAddAgent(false)} title="🧑‍💼 Add Manual Agent">
        <div className="space-y-3">
          <Input placeholder="Full Name *" value={newAgent.name} onChange={(e) => setNewAgent({ ...newAgent, name: e.target.value })} />
          <Input placeholder="Email *" type="email" value={newAgent.email} onChange={(e) => setNewAgent({ ...newAgent, email: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Phone" value={newAgent.phone} onChange={(e) => setNewAgent({ ...newAgent, phone: e.target.value })} />
            <Input placeholder="Daily lead quota (optional)" value={newAgent.dailyLeadQuota} onChange={(e) => setNewAgent({ ...newAgent, dailyLeadQuota: e.target.value })} />
          </div>
          <Select value={newAgent.role} onChange={(e) => setNewAgent({ ...newAgent, role: e.target.value })}>
            <option value="AGENT">Role: Telecalling Agent</option>
            <option value="MANAGER">Role: Manager (Admin only)</option>
            <option value="HR">Role: HR (Admin only)</option>
          </Select>
          <Button
            variant="success"
            className="w-full"
            disabled={agentBusy || !newAgent.name.trim() || !newAgent.email.includes("@")}
            onClick={async () => {
              setAgentBusy(true);
              const res = await fetch("/api/agents", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newAgent),
              });
              const d = await res.json();
              setAgentBusy(false);
              if (res.ok) {
                setShowAddAgent(false);
                setNewAgent({ name: "", email: "", phone: "", role: "AGENT", dailyLeadQuota: "" });
                setBusyMsg(`✅ ${d.row.role} account created: ${d.row.name} — now available on the login screen & assignment dropdowns`);
                loadMeta();
                setTimeout(() => setBusyMsg(null), 4000);
              } else {
                setBusyMsg(`❌ ${d.error}`);
                setTimeout(() => setBusyMsg(null), 4000);
              }
            }}
          >
            {agentBusy ? "Creating…" : "Create Account"}
          </Button>
        </div>
      </Modal>

      {/* Add single lead modal */}
      <Modal open={showAddLead} onClose={() => setShowAddLead(false)} title="＋ Add New Lead">
        <div className="space-y-3">
          <Input placeholder="Business Title *" value={newLead.businessName} onChange={(e) => setNewLead({ ...newLead, businessName: e.target.value })} />
          <Input placeholder="Phone (10 digits) *" value={newLead.phone} onChange={(e) => setNewLead({ ...newLead, phone: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Contact Name" value={newLead.contactName} onChange={(e) => setNewLead({ ...newLead, contactName: e.target.value })} />
            <Input placeholder="City" value={newLead.city} onChange={(e) => setNewLead({ ...newLead, city: e.target.value })} />
          </div>
          <Select value={newLead.nicheId} onChange={(e) => setNewLead({ ...newLead, nicheId: e.target.value })}>
            <option value="">Select Niche / Category *</option>
            {meta?.niches.map((n) => (
              <option key={n.id} value={n.id}>
                {n.icon} {n.name}
              </option>
            ))}
          </Select>
          <div className="grid grid-cols-3 gap-2">
            <Input placeholder="Rating (0–5)" value={newLead.rating} onChange={(e) => setNewLead({ ...newLead, rating: e.target.value })} />
            <Input placeholder="Reviews" value={newLead.reviewsCount} onChange={(e) => setNewLead({ ...newLead, reviewsCount: e.target.value })} />
            <Input placeholder="Competitor rev." value={newLead.competitorReviews} onChange={(e) => setNewLead({ ...newLead, competitorReviews: e.target.value })} />
          </div>
          <Button
            variant="success"
            className="w-full"
            disabled={addBusy || !newLead.businessName.trim() || !newLead.phone.trim() || !newLead.nicheId}
            onClick={async () => {
              setAddBusy(true);
              const res = await fetch("/api/leads", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ nicheId: Number(newLead.nicheId), rows: [newLead] }),
              });
              setAddBusy(false);
              if (res.ok) {
                setShowAddLead(false);
                setNewLead({ businessName: "", phone: "", contactName: "", city: "", nicheId: "", rating: "", reviewsCount: "", competitorReviews: "" });
                setBusyMsg("✅ Lead created in the live database");
                load();
                loadMeta();
                setTimeout(() => setBusyMsg(null), 3000);
              }
            }}
          >
            {addBusy ? "Creating…" : "Create Lead"}
          </Button>
        </div>
      </Modal>

      {/* Bulk upload modal */}
      <Modal open={showUpload} onClose={() => setShowUpload(false)} title="📤 Bulk CSV Upload (5K–10K batch)">
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            CSV columns (all 14 fields supported):{" "}
            <code className="bg-slate-100 px-1 rounded text-[10px]">
              businessName*, phone*, contactName, city, cityKeyword, gmapLink, rating, reviewsCount, competitorReviews,
              opensAt, websiteStatus, websiteUrl, serviceStatus
            </code>
            . lead_code & phone_normalized auto-generate. Rows insert in 2,000-row batches.
          </p>
          <Select value={uploadNiche} onChange={(e) => setUploadNiche(e.target.value)}>
            {meta?.niches.map((n) => (
              <option key={n.id} value={n.id}>
                {n.icon} {n.name}
              </option>
            ))}
          </Select>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-600 file:px-4 file:py-2 file:text-white"
            onChange={(e) => e.target.files?.[0] && handleCsv(e.target.files[0])}
            disabled={csvBusy}
          />
          {csvResult && <p className="text-sm font-semibold text-indigo-700">{csvResult}</p>}
        </div>
      </Modal>

      {/* Auto-assign modal */}
      <Modal open={showAssign} onClose={() => setShowAssign(false)} title="🔁 Auto-Assign / Round-Robin Rules">
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Distributes unassigned NEW leads{niche !== "all" ? ` in the "${niche}" niche` : ""} evenly across all{" "}
            {meta?.agents.length ?? 0} agents in round-robin order.
          </p>
          <label className="text-xs font-semibold text-slate-600">Leads per agent</label>
          <Input type="number" value={perAgent} onChange={(e) => setPerAgent(e.target.value)} />
          <Button variant="success" className="w-full" onClick={autoAssign}>
            Assign {Number(perAgent) * (meta?.agents.length ?? 0)} leads now
          </Button>
        </div>
      </Modal>
    </div>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={<Spinner className="min-h-screen" />}>
      <Shell>
        <AdminLeads />
      </Shell>
    </Suspense>
  );
}
