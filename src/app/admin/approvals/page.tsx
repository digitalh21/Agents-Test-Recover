"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { Shell } from "@/components/shell";
import { LeadModal } from "@/components/lead-modal";
import { Badge, Button, Card, Empty, Modal, Spinner, Tabs } from "@/components/ui";
import { cn, fmtDate, inr, STATUS_LABELS } from "@/lib/utils";

function ZoomableProof({ url }: { url: string }) {
  const [zoom, setZoom] = useState(false);
  return (
    <div className="space-y-2">
      <div className="overflow-auto max-h-[65vh] rounded-lg border border-slate-200 bg-slate-50">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt="payment proof"
          onClick={() => setZoom((z) => !z)}
          className={zoom ? "mx-auto scale-[1.8] origin-top cursor-zoom-out transition-transform" : "mx-auto max-h-[60vh] object-contain cursor-zoom-in transition-transform"}
        />
      </div>
      <Button variant="outline" size="sm" onClick={() => setZoom((z) => !z)}>
        {zoom ? "🔍 Zoom Out" : "🔍 Zoom In"}
      </Button>
    </div>
  );
}

type Deal = { id: number; leadId: number; agentName: string; businessName: string; amount: number; commission: number; screenshotUrl: string | null; note: string | null; rejectionNote: string | null; status: string; createdAt: string; decidedAt: string | null };
type Withdrawal = { id: number; agentName: string; amount: number; createdAt: string };
type Correction = { id: number; leadId: number; agentName: string; businessName: string; reason: string; requestedStatus: string | null; createdAt: string };
type LeadReq = { id: number; leadId: number | null; agentName: string; businessName: string | null; type: string; note: string | null; createdAt: string };

function ApprovalsCenter() {
  const [tab, setTab] = useState("deals");
  const [dealTab, setDealTab] = useState<"pending" | "approved" | "rejected">("pending");
  const [data, setData] = useState<{ deals: Deal[]; approvedDeals: Deal[]; rejectedDeals: Deal[]; withdrawals: Withdrawal[]; corrections: Correction[]; leadRequests: LeadReq[] } | null>(null);
  const [proof, setProof] = useState<string | null>(null);
  const [viewLead, setViewLead] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/approvals").then((r) => r.json()).then(setData);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000); // near-real-time refresh
    return () => clearInterval(t);
  }, [load]);

  async function decide(type: string, id: number, decision: "approve" | "reject") {
    let rejectionNote: string | undefined;
    if (type === "deal" && decision === "reject") {
      // Mandatory rejection comments — shown to the agent with a Re-upload button
      const input = window.prompt(
        "Rejection comments for the agent (why is this proof rejected?):",
        "Screenshot unclear / amount mismatch — please re-upload a valid payment proof."
      );
      if (input === null) return;
      rejectionNote = input;
    }
    const res = await fetch("/api/approvals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, id, decision, rejectionNote }),
    });
    const d = await res.json();
    setMsg(res.ok ? `✅ ${type} #${id} ${decision}d${d.assigned ? ` — ${d.assigned} leads assigned` : ""}` : `❌ ${d.error}`);
    load();
    setTimeout(() => setMsg(null), 3000);
  }

  if (!data) return <Spinner />;

  const tabs = [
    { key: "deals", label: "💰 Deal Approvals", count: data.deals.length },
    { key: "withdrawals", label: "💸 Payouts", count: data.withdrawals.length },
    { key: "corrections", label: "⚠️ Corrections", count: data.corrections.length },
    { key: "leadRequests", label: "➕ Lead Requests", count: data.leadRequests.length },
  ];

  const Actions = ({ type, id }: { type: string; id: number }) => (
    <div className="flex gap-2 w-full sm:w-auto sm:shrink-0">
      <Button variant="success" size="sm" className="flex-1 sm:flex-none" onClick={() => decide(type, id, "approve")}>✓ Approve</Button>
      <Button variant="danger" size="sm" className="flex-1 sm:flex-none" onClick={() => decide(type, id, "reject")}>✕ Reject</Button>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold">Real-time Approvals Center</h1>
        <p className="text-xs text-slate-500">Auto-refreshes every 15s · Deal commissions, payouts, corrections & lead requests</p>
      </div>
      {msg && <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-3 text-sm text-indigo-700">{msg}</div>}
      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === "deals" && (
        <div className="space-y-3">
          <Tabs
            tabs={[
              { key: "pending", label: "⏳ Pending", count: data.deals.length },
              { key: "approved", label: "✅ Approved", count: data.approvedDeals.length },
              { key: "rejected", label: "❌ Rejected", count: data.rejectedDeals.length },
            ]}
            active={dealTab}
            onChange={(k) => setDealTab(k as "pending" | "approved" | "rejected")}
          />
          {(dealTab === "pending" ? data.deals : dealTab === "approved" ? data.approvedDeals : data.rejectedDeals).length === 0 && (
            <Empty icon="💰" text={`No ${dealTab} deals.`} />
          )}
          {(dealTab === "pending" ? data.deals : dealTab === "approved" ? data.approvedDeals : data.rejectedDeals).map((d) => (
            <Card key={d.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-sm">
                    {d.businessName}
                    {dealTab !== "pending" && (
                      <Badge
                        className={cn(
                          "ml-2",
                          d.status === "APPROVED"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-rose-50 text-rose-700 border-rose-200"
                        )}
                      >
                        {d.status}
                      </Badge>
                    )}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Agent: <b>{d.agentName}</b> · {fmtDate(d.createdAt)}
                    {d.decidedAt ? ` · decided ${fmtDate(d.decidedAt)}` : ""}
                  </p>
                  <p className="text-xs mt-1">
                    Deal Value <b className="text-slate-900">{inr(d.amount)}</b> · Slab Commission{" "}
                    <b className="text-emerald-600">{inr(d.commission)}</b>
                  </p>
                  {d.note && (
                    <p className="mt-1 rounded-lg bg-slate-50 border border-slate-200 p-2 text-xs text-slate-600">
                      📝 Agent note: “{d.note}”
                    </p>
                  )}
                  {d.rejectionNote && d.status === "REJECTED" && (
                    <p className="mt-1 rounded-lg bg-rose-50 border border-rose-200 p-2 text-xs text-rose-700">
                      ❌ Rejection notes: “{d.rejectionNote}” — agent sees a Re-Submit option
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  <Button variant="outline" size="sm" className="flex-1 sm:flex-none" onClick={() => setViewLead(d.leadId)}>
                    🔎 Lead Context
                  </Button>
                  {d.screenshotUrl ? (
                    <Button variant="outline" size="sm" className="flex-1 sm:flex-none" onClick={() => setProof(d.screenshotUrl)}>
                      🖼 Verify Proof
                    </Button>
                  ) : (
                    <Badge className="bg-amber-50 text-amber-700 border-amber-200">No screenshot</Badge>
                  )}
                  {dealTab === "pending" && <Actions type="deal" id={d.id} />}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === "withdrawals" && (
        <div className="space-y-3">
          {data.withdrawals.length === 0 && <Empty icon="💸" text="No pending withdrawal requests." />}
          {data.withdrawals.map((w) => (
            <Card key={w.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-sm">{inr(w.amount)} payout request</p>
                <p className="text-xs text-slate-500">Agent: <b>{w.agentName}</b> · {fmtDate(w.createdAt)}</p>
              </div>
              <Actions type="withdrawal" id={w.id} />
            </Card>
          ))}
        </div>
      )}

      {tab === "corrections" && (
        <div className="space-y-3">
          {data.corrections.length === 0 && <Empty icon="⚠️" text="No pending correction requests." />}
          {data.corrections.map((c) => (
            <Card key={c.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-sm">{c.businessName}</p>
                  <p className="text-xs text-slate-500">Agent: <b>{c.agentName}</b> · {fmtDate(c.createdAt)}</p>
                  <p className="mt-1 text-xs bg-amber-50 border border-amber-200 rounded-lg p-2 text-amber-800">
                    “{c.reason}”
                  </p>
                  {c.requestedStatus && (
                    <p className="mt-1 text-[11px] text-slate-500">
                      Requested status → <b>{STATUS_LABELS[c.requestedStatus] ?? c.requestedStatus}</b>
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  <Button variant="outline" size="sm" className="flex-1 sm:flex-none" onClick={() => setViewLead(c.leadId)}>
                    🔎 Lead Context
                  </Button>
                  <Actions type="correction" id={c.id} />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === "leadRequests" && (
        <div className="space-y-3">
          {data.leadRequests.length === 0 && <Empty icon="➕" text="No pending lead requests." />}
          {data.leadRequests.map((r) => (
            <Card key={r.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-sm">
                  {r.type === "REPLACE" ? "🔄 Replace Lead" : r.type === "HISTORY" ? "🔓 History Access" : "➕ Fresh Leads"} request
                  {r.businessName && <span className="text-slate-500 font-normal"> — {r.businessName}</span>}
                </p>
                <p className="text-xs text-slate-500">Agent: <b>{r.agentName}</b> · {fmtDate(r.createdAt)}</p>
                {r.note && (
                  <p className="mt-1 rounded-lg bg-amber-50 border border-amber-200 p-2 text-xs text-amber-800">
                    “{r.note}”
                  </p>
                )}
                <p className="text-[11px] text-emerald-600 mt-1">
                  {r.type === "REPLACE"
                    ? "Approving returns this lead to pool + assigns 1 replacement"
                    : r.type === "HISTORY"
                      ? "Approving unlocks past call-note history on this lead for the agent"
                      : "Approving assigns 10 pool leads instantly"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                {r.leadId && (
                  <Button variant="outline" size="sm" className="flex-1 sm:flex-none" onClick={() => setViewLead(r.leadId)}>
                    🔎 Lead Context
                  </Button>
                )}
                <Actions type="leadRequest" id={r.id} />
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={!!proof} onClose={() => setProof(null)} title="🖼 Payment Proof Verification (click image to zoom)" maxWidth="max-w-2xl">
        {proof && <ZoomableProof url={proof} />}
      </Modal>

      {/* Full lead context for approval review */}
      {viewLead !== null && (
        <LeadModal leadId={viewLead} agentName="Reviewer" onClose={() => setViewLead(null)} onChanged={load} />
      )}
    </div>
  );
}

export default function ApprovalsPage() {
  return (
    <Suspense fallback={<Spinner className="min-h-screen" />}>
      <Shell>
        <ApprovalsCenter />
      </Shell>
    </Suspense>
  );
}
