"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Card, Spinner } from "@/components/ui";
import { cn, inr, relTime, STATUS_COLORS, STATUS_LABELS } from "@/lib/utils";
import { numText, ratingText } from "@/lib/fields";

type KCard = {
  id: number;
  leadCode: string | null;
  businessName: string | null;
  phone: string | null;
  city: string | null;
  rating: number | string | null;
  reviewsCount: number | string | null;
  competitorReviews: number | string | null;
  status: string | null;
  assignedAt: string | null;
  lastActivityAt: string | null;
  dealAmount: number | null;
  agent: { id: number; name: string; online: boolean } | null;
};

type KColumn = { key: string; label: string; staffOnly: boolean; total: number; cards: KCard[] };

function Avatar({ agent }: { agent: KCard["agent"] }) {
  if (!agent)
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[9px] font-bold text-slate-500" title="Unassigned">
        —
      </span>
    );
  return (
    <span className="relative inline-flex" title={agent.name}>
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-[9px] font-bold text-white">
        {agent.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
      </span>
      <span
        className={cn(
          "absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-white",
          agent.online ? "bg-emerald-500" : "bg-slate-300"
        )}
      />
    </span>
  );
}

export function KanbanBoard({ niche, onOpenLead }: { niche: string; onOpenLead?: (id: number) => void }) {
  const [pipeline, setPipeline] = useState<"assigned" | "pool" | "unassigned">("assigned");
  const [columns, setColumns] = useState<KColumn[] | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await fetch(`/api/kanban?niche=${niche}&pipeline=${pipeline}`).then((r) => r.json());
    setColumns(d.columns ?? []);
  }, [niche, pipeline]);

  useEffect(() => {
    setColumns(null);
    load();
  }, [load]);

  async function drop(toColumn: string) {
    setDragOver(null);
    if (dragging === null) return;
    const leadId = dragging;
    setDragging(null);
    const res = await fetch("/api/kanban", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId, toColumn }),
    });
    if (res.ok) {
      setMsg(`✅ Lead #${leadId} moved to "${toColumn === "UNASSIGNED" ? "UnAssigned" : toColumn}"`);
      setTimeout(() => setMsg(null), 2500);
      load();
    }
  }

  return (
    <div className="space-y-2">
      {/* Three-tier pipeline tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setPipeline("assigned")}
          className={cn(
            "shrink-0 rounded-xl border px-4 py-2 text-xs font-bold transition-colors",
            pipeline === "assigned" ? "bg-indigo-600 text-white border-indigo-600 shadow-sm" : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300"
          )}
        >
          🧑‍💼 Assigned Leads <span className="font-normal opacity-70">(7 stages)</span>
        </button>
        <button
          onClick={() => setPipeline("pool")}
          className={cn(
            "shrink-0 rounded-xl border px-4 py-2 text-xs font-bold transition-colors",
            pipeline === "pool" ? "bg-emerald-600 text-white border-emerald-600 shadow-sm" : "bg-white text-slate-600 border-slate-200 hover:border-emerald-300"
          )}
        >
          🗃 Pool Leads <span className="font-normal opacity-70">(fresh inventory)</span>
        </button>
        <button
          onClick={() => setPipeline("unassigned")}
          className={cn(
            "shrink-0 rounded-xl border px-4 py-2 text-xs font-bold transition-colors",
            pipeline === "unassigned" ? "bg-slate-900 text-white border-slate-900 shadow-sm" : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
          )}
        >
          ♻️ Unassigned <span className="font-normal opacity-70">(assignment cleared)</span>
        </button>
      </div>

      {msg && <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-2.5 text-xs text-indigo-700">{msg}</div>}
      <p className="text-[11px] text-slate-400">
        {pipeline === "assigned"
          ? "🖱 Drag cards between stages · 'New' holds leads assigned today · 'Closed Won' is management-only · tap any card to open the lead"
          : pipeline === "pool"
            ? "🗃 Fresh inventory — new uploads & CSV imports land here automatically as 'New in Pool · Assigned to Pool', ready for round-robin distribution"
            : "♻️ Assignment-cleared leads — set to No Response / Reject / Lost and auto-returned here with their status preserved for recycling"}
      </p>
      {!columns ? (
        <Spinner />
      ) : (
      <>
      <div className="flex gap-3 overflow-x-auto pb-4 -mx-4 px-4 sm:mx-0 sm:px-0">
        {columns.map((col) => (
          <div
            key={col.key}
            className={cn("w-60 sm:w-64 shrink-0 transition-all", dragOver === col.key && "scale-[1.02]")}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(col.key);
            }}
            onDragLeave={() => setDragOver((d) => (d === col.key ? null : d))}
            onDrop={() => drop(col.key)}
          >
            <div
              className={cn(
                "flex items-center justify-between rounded-t-xl border px-3 py-2",
                col.key === "POOL_NEW"
                  ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                  : col.key === "POOL_CALLBACK"
                  ? "bg-amber-50 text-amber-700 border-amber-200"
                  : col.key === "NEW"
                    ? "bg-slate-100 text-slate-700 border-slate-200"
                    : col.key === "IN_PROGRESS"
                      ? "bg-blue-50 text-blue-700 border-blue-200"
                      : col.key === "CALLBACK"
                        ? "bg-amber-50 text-amber-700 border-amber-200"
                        : col.key === "NO_RESPONSE" || col.key === "POOL_NO_RESPONSE"
                          ? "bg-orange-50 text-orange-700 border-orange-200"
                          : col.key === "REJECTED" || col.key === "POOL_REJECTED"
                            ? "bg-rose-50 text-rose-700 border-rose-200"
                            : col.key === "PAYMENT_PENDING"
                              ? "bg-violet-50 text-violet-700 border-violet-200"
                              : col.key === "POOL_LOST"
                                ? "bg-zinc-100 text-zinc-600 border-zinc-300"
                                : "bg-emerald-50 text-emerald-700 border-emerald-200"
              )}
            >
              <span className="text-xs font-bold truncate">
                {col.label}
                {col.staffOnly && <span className="ml-1" title="Admin/HR/Manager only">🔐</span>}
              </span>
              <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold">{col.total.toLocaleString()}</span>
            </div>
            <div
              className={cn(
                "space-y-2 rounded-b-xl border border-t-0 border-slate-200 bg-slate-50 p-2 min-h-[160px] max-h-[62vh] overflow-y-auto",
                dragOver === col.key && "ring-2 ring-indigo-400 bg-indigo-50/50"
              )}
            >
              {col.cards.map((c) => (
                <Card
                  key={c.id}
                  draggable
                  onDragStart={() => setDragging(c.id)}
                  onDragEnd={() => setDragging(null)}
                  onClick={() => onOpenLead?.(c.id)}
                  className={cn(
                    "p-2.5 cursor-grab active:cursor-grabbing hover:border-indigo-300 hover:shadow-md transition-all",
                    dragging === c.id && "opacity-40"
                  )}
                >
                  <div className="flex items-start justify-between gap-1.5">
                    <p className="text-xs font-semibold truncate">{c.businessName ?? "(hidden)"}</p>
                    <Avatar agent={c.agent} />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                    {c.leadCode ?? `#${c.id}`}
                    {c.city ? ` · ${c.city}` : ""}
                  </p>
                  <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-500">
                    <span>
                      ★ {ratingText(c.rating)} · {numText(c.reviewsCount)}/{numText(c.competitorReviews)}
                    </span>
                    {c.dealAmount ? <span className="font-bold text-emerald-600">{inr(c.dealAmount)}</span> : null}
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[9px] text-slate-400">
                    <span title="Assigned date">📥 {relTime(c.assignedAt)}</span>
                    <span title="Last touched">✋ {relTime(c.lastActivityAt)}</span>
                  </div>
                  {/* Status & Assignment are decoupled — always show both explicitly */}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    {c.status && (
                      <Badge className={cn("max-w-full", STATUS_COLORS[String(c.status)] ?? "bg-slate-100 text-slate-600 border-slate-200")}>
                        <span className="truncate">Status: {STATUS_LABELS[String(c.status)] ?? c.status}</span>
                      </Badge>
                    )}
                    <Badge
                      className={cn(
                        "max-w-full",
                        c.agent ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "bg-slate-200 text-slate-600 border-slate-300"
                      )}
                    >
                      <span className="truncate">👤 {c.agent ? c.agent.name : "Pool"}</span>
                    </Badge>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenLead?.(c.id);
                    }}
                    className="mt-1.5 w-full rounded-md border border-indigo-200 bg-indigo-50 py-1 text-[10px] font-semibold text-indigo-600 hover:bg-indigo-100"
                  >
                    🔎 Open Lead
                  </button>
                </Card>
              ))}
              {col.cards.length === 0 && (
                <p className="py-6 text-center text-[10px] text-slate-400">
                  {dragOver === col.key ? "Drop here" : "Empty"}
                </p>
              )}
              {col.total > col.cards.length && (
                <p className="text-center text-[10px] text-slate-400 py-1">
                  +{(col.total - col.cards.length).toLocaleString()} more…
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
      </>
      )}
    </div>
  );
}
