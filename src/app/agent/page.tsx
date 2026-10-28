"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Shell } from "@/components/shell";
import { LeadModal } from "@/components/lead-modal";
import { Badge, Button, Card, Empty, Modal, Spinner, Stat, Tabs, Textarea } from "@/components/ui";
import { cn, fmtDate, inr, STATUS_COLORS, STATUS_LABELS } from "@/lib/utils";
import { numText, ratingText, type VisibilityMap } from "@/lib/fields";

type PendingBanner = {
  id: number;
  title: string;
  body: string;
  imageUrl: string | null;
  createdAt: string;
};

function greeting(name: string) {
  const h = new Date().getHours();
  const part = h < 12 ? "Good Morning" : h < 17 ? "Good Afternoon" : "Good Evening";
  const emoji = h < 12 ? "🌅" : h < 17 ? "☀️" : "🌙";
  return `${part}, ${name.split(" ")[0]}! ${emoji}`;
}

// ── Live Active Time Tracker card (Page Visibility API) ──
// Display-only: the shell's TimeTracker owns the 60s server sync; this card
// mirrors the count locally and re-syncs from the server every 30s.
function ActiveTimeCard() {
  const [seconds, setSeconds] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const sync = () =>
      fetch("/api/agent/track-time")
        .then((r) => r.json())
        .then((d) => setSeconds(d.todaySeconds ?? 0))
        .catch(() => {});
    sync();
    const resync = setInterval(sync, 30000);
    const tick = setInterval(() => {
      const vis = document.visibilityState === "visible";
      setVisible(vis);
      if (vis) setSeconds((s) => s + 1);
    }, 1000);
    const onVis = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(resync);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return (
    <Card className="p-3.5 flex items-center justify-between bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">
          ⏱ Active Time Tracker {visible ? "· 🟢 counting" : "· ⏸ paused (tab hidden)"}
        </p>
        <p className="mt-1 text-2xl font-extrabold tabular-nums text-slate-900">
          {h}h {String(m).padStart(2, "0")}m {String(s).padStart(2, "0")}s
        </p>
        <p className="text-[10px] text-slate-500">
          Counts only while this tab is visible · syncs to server every 60s
        </p>
      </div>
      <div className={cn("flex h-12 w-12 items-center justify-center rounded-full text-xl", visible ? "bg-emerald-100 animate-pulse" : "bg-slate-200")}>
        {visible ? "🟢" : "⏸"}
      </div>
    </Card>
  );
}

// ── Mandatory acknowledgment popup — locks the screen until the agent responds ──
function BannerGate({ onLatest }: { onLatest: (b: PendingBanner | null) => void }) {
  const [pending, setPending] = useState<PendingBanner | null>(null);
  const [response, setResponse] = useState("");

  const check = useCallback(async () => {
    try {
      const d = await fetch("/api/banners?pending=1").then((r) => r.json());
      setPending(d.pending ?? null);
      onLatest(d.pending ?? d.latest ?? null);
    } catch {}
  }, [onLatest]);

  useEffect(() => {
    check();
    const t = setInterval(check, 20000);
    return () => clearInterval(t);
  }, [check]);

  async function ack() {
    if (!pending) return;
    await fetch("/api/banners", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ackBannerId: pending.id, response }),
    });
    setResponse("");
    check();
  }

  if (!pending) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
        <p className="text-[10px] font-bold uppercase tracking-widest text-rose-500">📢 Management broadcast — action required</p>
        <h2 className="mt-2 text-lg font-bold text-slate-900">{pending.title}</h2>
        <p className="mt-2 text-sm text-slate-600 whitespace-pre-wrap">{pending.body}</p>
        {pending.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={pending.imageUrl} alt="broadcast" className="mt-3 max-h-48 w-full rounded-xl border border-slate-200 object-contain bg-slate-50" />
        )}
        <p className="mt-2 text-[10px] text-slate-400">Sent {fmtDate(pending.createdAt)} · You must acknowledge to continue working.</p>
        <Textarea
          className="mt-3"
          rows={2}
          placeholder="Optional reply to management…"
          value={response}
          onChange={(e) => setResponse(e.target.value)}
        />
        <Button variant="primary" className="mt-3 w-full" onClick={ack}>
          ✅ Acknowledge & Continue
        </Button>
      </div>
    </div>
  );
}

type LeadRow = {
  id: number;
  leadCode: string | null;
  businessName: string | null;
  contactName: string | null;
  phone: string | null;
  phoneNormalized: string | null;
  city: string | null;
  cityKeyword: string | null;
  categoryName: string | null;
  rating: number | string | null;
  reviewsCount: number | string | null;
  competitorReviews: number | string | null;
  status: string | null;
  unlocked: boolean;
  recycled: boolean;
};

function AgentDashboard() {
  const params = useSearchParams();
  const niche = params.get("niche") ?? "all";
  const [tab, setTab] = useState("all");
  const [rows, setRows] = useState<LeadRow[] | null>(null);
  const [vis, setVis] = useState<VisibilityMap>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [me, setMe] = useState<{ id: number; name: string } | null>(null);
  const [openLead, setOpenLead] = useState<number | null>(null);
  const [latestBanner, setLatestBanner] = useState<PendingBanner | null>(null);
  const [wallet, setWallet] = useState<{ total: number; pending: number; approved: number; withdrawn: number } | null>(null);

  // lead request modal
  const [showRequest, setShowRequest] = useState(false);
  const [reqType, setReqType] = useState("NEW");
  const [reqNote, setReqNote] = useState("");
  const [reqSent, setReqSent] = useState(false);

  const load = useCallback(async () => {
    const status = tab === "all" ? "" : `&status=${tab}`;
    const [leadsRes, metaRes] = await Promise.all([
      fetch(`/api/leads?mine=1&page=1&niche=${niche}${status}`).then((r) => r.json()),
      fetch(`/api/meta?niche=${niche}`).then((r) => r.json()), // niche-filtered tab counts
    ]);
    setRows(leadsRes.rows ?? []);
    setVis(leadsRes.fieldVisibility ?? {});
    setCounts(metaRes.statusCounts ?? {});
    setMe(metaRes.me ?? null);
  }, [tab, niche]);

  useEffect(() => {
    setRows(null);
    load();
  }, [load]);

  useEffect(() => {
    fetch("/api/agent/profile")
      .then((r) => r.json())
      .then((d) =>
        setWallet({
          total: d.profile?.walletTotal ?? 0,
          pending: d.profile?.walletPending ?? 0,
          approved: d.profile?.walletApproved ?? 0,
          withdrawn: d.withdrawnTotal ?? 0,
        })
      )
      .catch(() => {});
  }, []);

  async function sendRequest() {
    await fetch("/api/agent/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "lead-request", type: reqType, note: reqNote }),
    });
    setReqSent(true);
    setTimeout(() => {
      setShowRequest(false);
      setReqSent(false);
      setReqNote("");
    }, 1500);
  }

  const tabs = [
    { key: "all", label: "All", count: Object.values(counts).reduce((a, b) => a + b, 0) },
    { key: "NEW", label: "New", count: counts.NEW ?? 0 },
    { key: "IN_PROGRESS", label: "In Process", count: counts.IN_PROGRESS ?? 0 },
    { key: "CALLBACK", label: "Call back", count: counts.CALLBACK ?? 0 },
    { key: "NO_RESPONSE", label: "No Response", count: counts.NO_RESPONSE ?? 0 },
    { key: "PAYMENT_PENDING", label: "Payment Approval", count: counts.PAYMENT_PENDING ?? 0 },
    { key: "REJECTED", label: "Reject/Not Interest", count: counts.REJECTED ?? 0 },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* ── Mandatory broadcast gate ── */}
      <BannerGate onLatest={setLatestBanner} />

      {/* ── Personalized greeting ── */}
      {me && (
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">{greeting(me.name)}</h1>
          <p className="text-xs text-slate-500">Here&apos;s your dashboard summary for today.</p>
        </div>
      )}

      {/* ── Latest management banner ── */}
      {latestBanner && (
        <div className="rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-violet-50 p-3.5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-500">📢 Announcement</p>
          <p className="mt-0.5 text-sm font-bold text-slate-900">{latestBanner.title}</p>
          <p className="mt-0.5 text-xs text-slate-600">{latestBanner.body}</p>
        </div>
      )}

      {/* ── Live active time tracker ── */}
      <ActiveTimeCard />

      {/* ── Live stage counters ── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {(["IN_PROGRESS", "CALLBACK", "NO_RESPONSE", "PAYMENT_PENDING", "REJECTED"] as const).map((s) => (
          <Card key={s} className="p-2.5 text-center">
            <p className="text-lg font-bold text-slate-900">{(counts[s] ?? 0).toLocaleString()}</p>
            <p className="text-[10px] font-semibold text-slate-500 leading-tight">{STATUS_LABELS[s]}</p>
          </Card>
        ))}
      </div>

      {/* ── Earnings summary ── */}
      {wallet && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label="Total Earned" value={inr(wallet.total)} />
          <Stat label="Pending Payout" value={inr(wallet.pending)} accent="text-amber-600" />
          <Stat label="Approved Payout" value={inr(wallet.approved)} accent="text-emerald-600" />
          <Stat label="Withdrawn" value={inr(wallet.withdrawn)} accent="text-indigo-600" />
        </div>
      )}

      <div className="flex items-center justify-between gap-3 pt-1">
        <div>
          <h2 className="text-lg sm:text-xl font-bold">My Assigned Leads</h2>
          <p className="text-xs text-slate-500">Tap a lead card to open the full workspace</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowRequest(true)}>
          ➕ Request New Leads
        </Button>
      </div>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {rows === null ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <Empty icon="🎉" text="No leads in this bucket. Finished your list? Request new leads above!" />
      ) : (
        <div className="space-y-2.5">
          {rows.map((l) => (
            <button key={l.id} onClick={() => setOpenLead(l.id)} className="w-full text-left">
              <Card className="p-3.5 hover:border-indigo-300 hover:shadow-md transition-all">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-slate-900 truncate flex items-center gap-1.5">
                      {!l.unlocked && <span title="Details locked until approved">🔒</span>}
                      {l.recycled && <span title="Recycled lead">♻️</span>}
                      {l.businessName ?? "(business hidden)"}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {/* phone arrives pre-masked/hidden from the server per RBAC rules */}
                      {(vis["phone"] ?? "VISIBLE") !== "HIDDEN" && l.phone ? `+91 ${l.phone}` : "📵 phone hidden"}
                      {l.city ? ` · ${l.city}` : ""}
                      {l.leadCode ? ` · ${l.leadCode}` : ""}
                    </p>
                  </div>
                  {(vis["status"] ?? "VISIBLE") !== "HIDDEN" && l.status && (
                    <Badge className={cn("shrink-0", STATUS_COLORS[l.status] ?? "bg-slate-100 text-slate-600 border-slate-200")}>
                      {STATUS_LABELS[l.status] ?? l.status}
                    </Badge>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-500">
                  {(vis["rating"] ?? "VISIBLE") !== "HIDDEN" && (
                    <span className="text-amber-600 font-semibold">★ {ratingText(l.rating)}</span>
                  )}
                  {(vis["reviews_count"] ?? "VISIBLE") !== "HIDDEN" && (
                    <span>
                      {numText(l.reviewsCount)} reviews <span className="text-slate-300">vs</span>{" "}
                      <span className="text-rose-500 font-semibold">{numText(l.competitorReviews)} competitor</span>
                    </span>
                  )}
                  {(vis["niche_category"] ?? "VISIBLE") !== "HIDDEN" && l.categoryName && (
                    <span className="truncate">🗂 {l.categoryName}</span>
                  )}
                </div>
              </Card>
            </button>
          ))}
        </div>
      )}

      {openLead !== null && me && (
        <LeadModal leadId={openLead} agentName={me.name} onClose={() => setOpenLead(null)} onChanged={load} />
      )}

      <Modal open={showRequest} onClose={() => setShowRequest(false)} title="➕ Request New Leads">
        {reqSent ? (
          <div className="py-8 text-center">
            <p className="text-3xl">📨</p>
            <p className="mt-2 text-sm font-semibold text-emerald-700">Request sent — Admin will approve shortly!</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              Finished your daily leads? Request a fresh batch — Admin / Manager approval assigns up to 10 leads
              instantly. For a specific problematic lead, open it and use <b>🔄 Request Replace Lead</b> instead.
            </p>
            <Textarea placeholder="Optional note…" rows={3} value={reqNote} onChange={(e) => setReqNote(e.target.value)} />
            <Button variant="primary" className="w-full" onClick={sendRequest}>
              Send Request
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default function AgentPage() {
  return (
    <Suspense fallback={<Spinner className="min-h-screen" />}>
      <Shell>
        <AgentDashboard />
      </Shell>
    </Suspense>
  );
}
