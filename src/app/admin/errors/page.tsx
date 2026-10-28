"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { Shell } from "@/components/shell";
import { LeadModal } from "@/components/lead-modal";
import { Badge, Button, Card, Empty, Spinner, Tabs } from "@/components/ui";
import { cn, fmtDate } from "@/lib/utils";

type ErrRow = {
  id: number;
  leadId: number;
  agentName: string;
  businessName: string;
  issue: string;
  status: string;
  resolutionNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

function LeadErrorsPage() {
  const [rows, setRows] = useState<ErrRow[] | null>(null);
  const [tab, setTab] = useState("OPEN");
  const [viewLead, setViewLead] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/lead-errors").then((r) => r.json()).then((d) => setRows(d.rows ?? []));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(id: number, decision: "resolve" | "dismiss") {
    let note: string | undefined;
    if (decision === "resolve") {
      const input = window.prompt("Resolution note (what was corrected?):", "Lead data corrected.");
      if (input === null) return;
      note = input;
    }
    await fetch("/api/lead-errors", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, decision, note }),
    });
    setMsg(`✅ Error report #${id} ${decision}d`);
    load();
    setTimeout(() => setMsg(null), 2500);
  }

  if (rows === null) return <Spinner />;

  const open = rows.filter((r) => r.status === "OPEN");
  const closed = rows.filter((r) => r.status !== "OPEN");
  const list = tab === "OPEN" ? open : closed;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold">🚩 Lead Errors / Corrections</h1>
        <p className="text-xs text-slate-500">Agent-reported data problems — review, fix the lead, then resolve.</p>
      </div>
      {msg && <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-3 text-sm text-indigo-700">{msg}</div>}
      <Tabs
        tabs={[
          { key: "OPEN", label: "🔴 Open Reports", count: open.length },
          { key: "DONE", label: "✅ Reviewed", count: closed.length },
        ]}
        active={tab}
        onChange={setTab}
      />
      {list.length === 0 ? (
        <Empty icon="🚩" text={tab === "OPEN" ? "No open error reports — data looks clean!" : "No reviewed reports yet."} />
      ) : (
        <div className="space-y-2.5">
          {list.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {r.businessName}
                    <Badge
                      className={cn(
                        "ml-2",
                        r.status === "OPEN"
                          ? "bg-amber-50 text-amber-700 border-amber-200"
                          : r.status === "RESOLVED"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-slate-100 text-slate-600 border-slate-200"
                      )}
                    >
                      {r.status}
                    </Badge>
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Reported by <b>{r.agentName}</b> · {fmtDate(r.createdAt)}
                  </p>
                  <p className="mt-1.5 rounded-lg bg-rose-50 border border-rose-200 p-2 text-xs text-rose-800">“{r.issue}”</p>
                  {r.resolutionNote && (
                    <p className="mt-1 rounded-lg bg-emerald-50 border border-emerald-200 p-2 text-xs text-emerald-800">
                      ✅ Resolution: “{r.resolutionNote}”
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                  <Button variant="outline" size="sm" className="flex-1 sm:flex-none" onClick={() => setViewLead(r.leadId)}>
                    🔎 Open Lead
                  </Button>
                  {r.status === "OPEN" && (
                    <>
                      <Button variant="success" size="sm" className="flex-1 sm:flex-none" onClick={() => decide(r.id, "resolve")}>
                        ✓ Resolve
                      </Button>
                      <Button variant="ghost" size="sm" className="flex-1 sm:flex-none" onClick={() => decide(r.id, "dismiss")}>
                        Dismiss
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      {viewLead !== null && (
        <LeadModal leadId={viewLead} agentName="Reviewer" onClose={() => setViewLead(null)} onChanged={load} />
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<Spinner className="min-h-screen" />}>
      <Shell>
        <LeadErrorsPage />
      </Shell>
    </Suspense>
  );
}
