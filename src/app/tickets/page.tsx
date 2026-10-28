"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Shell } from "@/components/shell";
import { Badge, Button, Card, Empty, Input, Modal, Select, Spinner, Textarea } from "@/components/ui";
import { cn, fmtDate, relTime } from "@/lib/utils";

type Ticket = {
  id: number;
  ticketNo: string;
  agentId: number;
  agentName?: string;
  category: string;
  details: string;
  attachmentUrl: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};
type Msg = { id: number; body: string; createdAt: string; senderName: string; senderRole: string; mine: boolean };

const CATEGORIES = [
  { value: "ACCESS_ISSUE", label: "🔑 Access Issue" },
  { value: "DATA_CORRECTION", label: "✏️ Data Correction" },
  { value: "PAYOUT_QUERY", label: "💸 Payout Query" },
  { value: "LEAD_ISSUE", label: "📋 Lead Issue" },
  { value: "OTHER", label: "📌 Other" },
];

const STATUS_STYLE: Record<string, string> = {
  OPEN: "bg-amber-50 text-amber-700 border-amber-200",
  IN_PROGRESS: "bg-blue-50 text-blue-700 border-blue-200",
  RESOLVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  CLOSED: "bg-slate-100 text-slate-600 border-slate-200",
};

function catLabel(v: string) {
  return CATEGORIES.find((c) => c.value === v)?.label ?? v;
}

function TicketChat({ ticket, isStaff, onClose, onChanged }: { ticket: Ticket; isStaff: boolean; onClose: () => void; onChanged: () => void }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [meta, setMeta] = useState<Ticket>(ticket);
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const d = await fetch(`/api/tickets?ticketId=${ticket.id}`).then((r) => r.json());
    if (d.ticket) {
      setMeta((m) => ({ ...m, ...d.ticket }));
      setMessages(d.messages ?? []);
    }
  }, [ticket.id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function send() {
    if (!text.trim()) return;
    const body = text;
    setText("");
    await fetch("/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketId: ticket.id, body }),
    });
    load();
    onChanged();
  }

  async function setStatus(status: string) {
    await fetch("/api/tickets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketId: ticket.id, status }),
    });
    load();
    onChanged();
  }

  return (
    <Modal open onClose={onClose} title={`🎫 ${meta.ticketNo} · ${catLabel(meta.category)}`} maxWidth="max-w-2xl">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={STATUS_STYLE[meta.status]}>{meta.status.replace("_", " ")}</Badge>
          {ticket.agentName && <span className="text-xs text-slate-500">Raised by <b>{ticket.agentName}</b></span>}
          <span className="text-xs text-slate-400">· {fmtDate(meta.createdAt)}</span>
          {isStaff && (
            <div className="ml-auto flex items-center gap-2">
              <Select className="h-8 max-w-[150px] text-xs" value={meta.status} onChange={(e) => setStatus(e.target.value)}>
                <option value="OPEN">OPEN</option>
                <option value="IN_PROGRESS">IN PROGRESS</option>
                <option value="RESOLVED">RESOLVED</option>
                <option value="CLOSED">CLOSED</option>
              </Select>
              <Button
                variant="ghost"
                size="sm"
                className="text-rose-500"
                onClick={async () => {
                  if (!window.confirm("Remove / clear the entire chat history of this ticket?")) return;
                  await fetch(`/api/tickets?ticketId=${ticket.id}`, { method: "DELETE" });
                  load();
                }}
              >
                🧹 Clear Chat
              </Button>
            </div>
          )}
        </div>
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-700">
          <p className="font-semibold text-slate-500 text-[10px] uppercase mb-1">Issue details</p>
          {meta.details}
          {meta.attachmentUrl && (
            <a href={meta.attachmentUrl} target="_blank" rel="noreferrer" className="mt-2 block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={meta.attachmentUrl} alt="attachment" className="h-20 rounded-lg border border-slate-200 object-cover" />
            </a>
          )}
        </div>
        {/* Private ticket chat */}
        <div className="h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 space-y-2">
          {messages.length === 0 && <p className="text-xs text-slate-400 text-center py-8">No replies yet. Start the conversation…</p>}
          {messages.map((m) => (
            <div key={m.id} className={cn("flex", m.mine ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[80%] rounded-2xl px-3 py-2 text-xs", m.mine ? "bg-indigo-600 text-white rounded-br-sm" : "bg-slate-100 rounded-bl-sm")}>
                <p className={cn("text-[9px] font-bold mb-0.5", m.mine ? "text-indigo-200" : "text-slate-500")}>
                  {m.senderName} · {m.senderRole}
                </p>
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className={cn("mt-0.5 text-[8px]", m.mine ? "text-indigo-200" : "text-slate-400")}>{relTime(m.createdAt)}</p>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
        <div className="flex gap-2">
          <Input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Type a private reply…" />
          <Button variant="primary" onClick={send}>Send</Button>
        </div>
        <p className="text-[10px] text-slate-400">🔒 Private thread — visible only to the agent and Admin/HR/Manager.</p>
      </div>
    </Modal>
  );
}

function TicketsPage() {
  const [rows, setRows] = useState<Ticket[] | null>(null);
  const [isStaff, setIsStaff] = useState(false);
  const [category, setCategory] = useState("ACCESS_ISSUE");
  const [details, setDetails] = useState("");
  const [attachment, setAttachment] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [open, setOpen] = useState<Ticket | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    const d = await fetch("/api/tickets").then((r) => r.json());
    setRows(d.rows ?? []);
    setIsStaff(!!d.isStaff);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function attach(file: File) {
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", "ticket_proof");
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const d = await res.json();
    if (res.ok) setAttachment(d.url);
    setUploading(false);
  }

  async function submit() {
    const res = await fetch("/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, details, attachmentUrl: attachment }),
    });
    const d = await res.json();
    if (res.ok) {
      setMsg(`🎫 Ticket ${d.row.ticketNo} created! Management will respond here.`);
      setDetails("");
      setAttachment(null);
      load();
    } else {
      setMsg(`❌ ${d.error}`);
    }
    setTimeout(() => setMsg(null), 4000);
  }

  const filtered = (rows ?? []).filter((t) => filter === "all" || t.status === filter);

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold">{isStaff ? "🎧 Help Desk — Complaints & Requests" : "🎫 Complaints / Requests"}</h1>
        <p className="text-xs text-slate-500">
          {isStaff
            ? "Unified view of all agent tickets. Open any ticket to reply privately and update its status."
            : "Raise a ticket — a unique ticket number is generated and management responds in a private chat."}
        </p>
      </div>

      {msg && <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-3 text-sm text-indigo-700">{msg}</div>}

      {/* Agent submission form */}
      {!isStaff && (
        <Card className="p-4 space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">New Request / Complaint</p>
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
          <Textarea placeholder="Describe your issue in detail…" rows={4} value={details} onChange={(e) => setDetails(e.target.value)} />
          <div className="flex flex-wrap items-center gap-2">
            <label className="cursor-pointer rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500 hover:border-indigo-400 hover:text-indigo-600">
              {uploading ? "Uploading…" : attachment ? "✅ Proof attached — replace?" : "📎 Attach File / Proof (optional)"}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && attach(e.target.files[0])} />
            </label>
            {attachment && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={attachment} alt="attachment" className="h-10 w-10 rounded-lg border border-slate-200 object-cover" />
            )}
            <Button variant="primary" className="ml-auto" onClick={submit} disabled={!details.trim()}>
              🎫 Submit Ticket
            </Button>
          </div>
        </Card>
      )}

      {/* Filter + list */}
      <div className="flex items-center gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
          {isStaff ? "All Tickets" : "Your Ticket History"}
        </p>
        <Select className="ml-auto h-8 max-w-[160px] text-xs" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="OPEN">Open</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="RESOLVED">Resolved</option>
          <option value="CLOSED">Closed</option>
        </Select>
      </div>

      {rows === null ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <Empty icon="🎫" text="No tickets here yet." />
      ) : (
        <div className="space-y-2.5">
          {filtered.map((t) => (
            <button key={t.id} className="w-full text-left" onClick={() => setOpen(t)}>
              <Card className="p-3.5 hover:border-indigo-300 hover:shadow-md transition-all">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      <span className="font-mono text-indigo-600">{t.ticketNo}</span> · {catLabel(t.category)}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500 truncate">{t.details}</p>
                    <p className="mt-1 text-[10px] text-slate-400">
                      {isStaff && t.agentName ? `${t.agentName} · ` : ""}
                      updated {relTime(t.updatedAt)}
                      {t.attachmentUrl ? " · 📎 attachment" : ""}
                    </p>
                  </div>
                  <Badge className={cn("shrink-0", STATUS_STYLE[t.status])}>{t.status.replace("_", " ")}</Badge>
                </div>
              </Card>
            </button>
          ))}
        </div>
      )}

      {open && <TicketChat ticket={open} isStaff={isStaff} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<Spinner className="min-h-screen" />}>
      <Shell>
        <TicketsPage />
      </Shell>
    </Suspense>
  );
}
