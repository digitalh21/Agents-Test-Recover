"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { Shell } from "@/components/shell";
import { LeadModal } from "@/components/lead-modal";
import { Button, Card, Empty, Select, Spinner } from "@/components/ui";
import { fmtDate } from "@/lib/utils";

type Log = { id: number; userName: string; userId: number | null; leadId: number | null; action: string; detail: string | null; createdAt: string };

const ACTION_ICONS: Record<string, string> = {
  STATUS_CHANGE: "🔄",
  FILE_UPLOAD: "📤",
  DEAL_SUBMITTED: "💰",
  DEAL_APPROVED: "✅",
  DEAL_REJECTED: "❌",
  PAYOUT_APPROVED: "💸",
  PAYOUT_REJECTED: "🚫",
  CORRECTION_REQUEST: "⚠️",
  CORRECTION_APPROVED: "🛠",
  BULK_UPLOAD: "📦",
  AUTO_ASSIGN: "🔁",
  LEAD_UNLOCK: "🔓",
  LEAD_EDIT: "✏️",
  PUSH_BROADCAST: "🔔",
  CRON_DAILY_CLEANUP: "🌙",
  WITHDRAWAL_REQUEST: "🏦",
  LEAD_REQUEST: "➕",
};

function AuditTrail() {
  const [rows, setRows] = useState<Log[] | null>(null);
  const [users, setUsers] = useState<{ id: number; name: string; role: string }[]>([]);
  const [userId, setUserId] = useState("");
  const [page, setPage] = useState(1);
  const [viewLead, setViewLead] = useState<number | null>(null);

  const load = useCallback(async () => {
    setRows(null);
    const d = await fetch(`/api/audit?page=${page}${userId ? `&userId=${userId}` : ""}`).then((r) => r.json());
    setRows(d.rows ?? []);
    setUsers(d.users ?? []);
  }, [page, userId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold">Audit Trail Logs</h1>
        <p className="text-xs text-slate-500">
          Full timestamped history — status changes, uploads, edits, approvals — by User ID & Lead ID
        </p>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <Select className="sm:max-w-xs" value={userId} onChange={(e) => { setUserId(e.target.value); setPage(1); }}>
          <option value="">All users</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} ({u.role})
            </option>
          ))}
        </Select>
        <div className="sm:ml-auto flex items-center justify-between sm:justify-start gap-2 text-xs">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</Button>
          <span>Page {page}</span>
          <Button variant="outline" size="sm" disabled={(rows?.length ?? 0) < 100} onClick={() => setPage((p) => p + 1)}>Next →</Button>
        </div>
      </div>

      {rows === null ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <Empty icon="🧾" text="No audit entries yet." />
      ) : (
        <Card className="divide-y divide-slate-100">
          {rows.map((l) => (
            <div key={l.id} className="flex items-start gap-3 p-3">
              <span className="text-lg">{ACTION_ICONS[l.action] ?? "📌"}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <b>{l.userName}</b>{" "}
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-600">{l.action}</span>
                  {l.leadId && (
                    <button
                      onClick={() => setViewLead(l.leadId)}
                      className="ml-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-600 hover:bg-indigo-100"
                    >
                      🔎 Open Lead #{l.leadId}
                    </button>
                  )}
                </p>
                {l.detail && <p className="text-xs text-slate-500 mt-0.5">{l.detail}</p>}
              </div>
              <span className="shrink-0 text-[10px] text-slate-400">{fmtDate(l.createdAt)}</span>
            </div>
          ))}
        </Card>
      )}
      {viewLead !== null && (
        <LeadModal leadId={viewLead} agentName="Reviewer" onClose={() => setViewLead(null)} onChanged={load} />
      )}
    </div>
  );
}

export default function AuditPage() {
  return (
    <Suspense fallback={<Spinner className="min-h-screen" />}>
      <Shell>
        <AuditTrail />
      </Shell>
    </Suspense>
  );
}
