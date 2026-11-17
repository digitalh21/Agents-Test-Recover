"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Shell } from "@/components/shell";
import { Badge, Button, Card, Empty, Input, Modal, Select, Spinner, Textarea } from "@/components/ui";
import { cn, fmtDate, relTime } from "@/lib/utils";

type Attachment = { url: string; name: string; type: string };
type Ticket = {
  id: number;
  ticketNo: string;
  agentId: string;
  agentName?: string;
  ticketType: "COMPLAINT" | "HELPDESK" | "REQUEST";
  category: string;
  details: string;
  attachmentUrl: string | null;
  attachmentName: string | null;
  attachmentType: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};
type Msg = {
  id: number;
  body: string;
  attachmentUrl: string | null;
  attachmentName: string | null;
  attachmentType: string | null;
  createdAt: string;
  senderName: string;
  senderRole: string;
  mine: boolean;
};

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
  WAITING_AGENT: "bg-violet-50 text-violet-700 border-violet-200",
  RESOLVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  CLOSED: "bg-slate-100 text-slate-600 border-slate-200",
};

function catLabel(v: string) {
  return CATEGORIES.find((c) => c.value === v)?.label ?? v;
}

function AttachmentPreview({ attachment, compact = false, inverted = false }: { attachment: Attachment; compact?: boolean; inverted?: boolean }) {
  const image = attachment.type.startsWith("image/") || attachment.url.startsWith("data:image/") || /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(attachment.url);
  if (image) {
    return (
      <a href={attachment.url} target="_blank" rel="noreferrer" className="mt-2 block" title={`Open ${attachment.name}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={attachment.url}
          alt={attachment.name || "Ticket attachment"}
          className={cn("rounded-xl border object-cover shadow-sm", compact ? "max-h-36 max-w-[240px]" : "max-h-56 w-full", inverted ? "border-white/30" : "border-slate-200")}
        />
      </a>
    );
  }
  const ext = attachment.name.split(".").pop()?.toUpperCase() || "FILE";
  const icon = attachment.type.includes("pdf") ? "📕" : attachment.type.includes("sheet") || attachment.type.includes("excel") || attachment.type.includes("csv") ? "📊" : attachment.type.includes("word") ? "📘" : "📄";
  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noreferrer"
      className={cn("mt-2 flex max-w-sm items-center gap-2.5 rounded-xl border p-2.5 transition-colors", inverted ? "border-white/25 bg-white/10 hover:bg-white/15" : "border-slate-200 bg-white hover:border-indigo-300")}
    >
      <span className="text-2xl">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-bold">{attachment.name || "Attachment"}</span>
        <span className={cn("block text-[9px] uppercase", inverted ? "text-indigo-200" : "text-slate-400")}>{ext} document · Open preview</span>
      </span>
      <span aria-hidden>↗</span>
    </a>
  );
}

function TicketChat({ ticket, isStaff, onClose, onChanged }: { ticket: Ticket; isStaff: boolean; onClose: () => void; onChanged: () => void }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [meta, setMeta] = useState<Ticket>(ticket);
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [uploading, setUploading] = useState(false);
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

  async function attach(file: File) {
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", "ticket_proof");
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const d = await res.json();
    if (res.ok) setAttachment({ url: d.url, name: d.fileName ?? file.name, type: d.contentType ?? file.type });
    setUploading(false);
  }

  async function send() {
    if (!text.trim() && !attachment) return;
    const body = text;
    const file = attachment;
    setText("");
    setAttachment(null);
    await fetch("/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticketId: ticket.id,
        body,
        attachmentUrl: file?.url,
        attachmentName: file?.name,
        attachmentType: file?.type,
      }),
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
                <option value="WAITING_AGENT">WAITING AGENT</option>
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
            <AttachmentPreview
              attachment={{
                url: meta.attachmentUrl,
                name: meta.attachmentName ?? "Ticket attachment",
                type: meta.attachmentType ?? "application/octet-stream",
              }}
            />
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
                {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                {m.attachmentUrl && (
                  <AttachmentPreview
                    compact
                    inverted={m.mine}
                    attachment={{
                      url: m.attachmentUrl,
                      name: m.attachmentName ?? "Chat attachment",
                      type: m.attachmentType ?? "application/octet-stream",
                    }}
                  />
                )}
                <p className={cn("mt-1 text-[8px]", m.mine ? "text-indigo-200" : "text-slate-400")}>{relTime(m.createdAt)}</p>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
        {attachment && (
          <div className="relative rounded-xl border border-indigo-200 bg-indigo-50 p-2.5">
            <AttachmentPreview compact attachment={attachment} />
            <button onClick={() => setAttachment(null)} className="absolute right-2 top-2 rounded-full bg-white px-2 py-1 text-[10px] font-bold text-rose-600 shadow">Remove</button>
          </div>
        )}
        <div className="flex gap-2">
          <label className="flex shrink-0 cursor-pointer items-center justify-center rounded-lg border border-slate-300 px-3 text-lg hover:border-indigo-400 hover:bg-indigo-50" title="Attach image or document">
            {uploading ? "…" : "📎"}
            <input
              type="file"
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
              className="hidden"
              disabled={uploading}
              onChange={(e) => e.target.files?.[0] && attach(e.target.files[0])}
            />
          </label>
          <Input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Type a private reply…" />
          <Button variant="primary" onClick={send} disabled={(!text.trim() && !attachment) || uploading}>Send</Button>
        </div>
        <p className="text-[10px] text-slate-400">🔒 Private thread — visible only to the agent and Admin/HR/Manager.</p>
      </div>
    </Modal>
  );
}

function TicketsPage() {
  const [rows, setRows] = useState<Ticket[] | null>(null);
  const [isStaff, setIsStaff] = useState(false);
  const [ticketType, setTicketType] = useState<"COMPLAINT" | "HELPDESK" | "REQUEST">("REQUEST");
  const [category, setCategory] = useState("ACCESS_ISSUE");
  const [details, setDetails] = useState("");
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [open, setOpen] = useState<Ticket | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [section, setSection] = useState<"COMPLAINT" | "HELPDESK" | "REQUEST">("REQUEST");
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
    if (res.ok) setAttachment({ url: d.url, name: d.fileName ?? file.name, type: d.contentType ?? file.type });
    setUploading(false);
  }

  async function submit() {
    const res = await fetch("/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticketType,
        category,
        details,
        attachmentUrl: attachment?.url,
        attachmentName: attachment?.name,
        attachmentType: attachment?.type,
      }),
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

  const sectionCounts = {
    COMPLAINT: (rows ?? []).filter((t) => t.ticketType === "COMPLAINT").length,
    HELPDESK: (rows ?? []).filter((t) => t.ticketType === "HELPDESK").length,
    REQUEST: (rows ?? []).filter((t) => t.ticketType === "REQUEST").length,
  };
  const filtered = (rows ?? []).filter((t) => t.ticketType === section && (filter === "all" || t.status === filter));

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
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">New Support Ticket</p>
          <div className="grid grid-cols-3 gap-2">
            {(["COMPLAINT", "HELPDESK", "REQUEST"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setTicketType(type)}
                className={cn(
                  "rounded-xl border px-2 py-2 text-[10px] font-bold transition-colors",
                  ticketType === type ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-500 hover:border-indigo-300"
                )}
              >
                {type === "COMPLAINT" ? "⚠️ Complaint" : type === "HELPDESK" ? "🎧 Helpdesk" : "📨 Request"}
              </button>
            ))}
          </div>
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
          <Textarea placeholder="Describe your issue in detail…" rows={4} value={details} onChange={(e) => setDetails(e.target.value)} />
          {attachment && (
            <div className="relative rounded-xl border border-indigo-200 bg-indigo-50 p-2.5">
              <AttachmentPreview attachment={attachment} compact />
              <button onClick={() => setAttachment(null)} className="absolute right-2 top-2 rounded-full bg-white px-2 py-1 text-[10px] font-bold text-rose-600 shadow">Remove</button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <label className="cursor-pointer rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500 hover:border-indigo-400 hover:text-indigo-600">
              {uploading ? "Uploading…" : attachment ? "✅ File attached — replace?" : "📎 Attach Image / Document (optional)"}
              <input
                type="file"
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
                className="hidden"
                disabled={uploading}
                onChange={(e) => e.target.files?.[0] && attach(e.target.files[0])}
              />
            </label>
            <Button variant="primary" className="ml-auto" onClick={submit} disabled={!details.trim() || uploading}>
              🎫 Submit Ticket
            </Button>
          </div>
        </Card>
      )}

      {/* Support sections + ticket status filters */}
      <Card className="overflow-hidden p-0">
        <div className="grid grid-cols-3 border-b border-slate-200">
          {([
            { key: "COMPLAINT", label: `Complaints (${sectionCounts.COMPLAINT})`, icon: "⚠️" },
            { key: "HELPDESK", label: `Helpdesk (${sectionCounts.HELPDESK})`, icon: "🎧" },
            { key: "REQUEST", label: "Requests (All)", icon: "📨" },
          ] as const).map((item) => (
            <button
              key={item.key}
              onClick={() => {
                setSection(item.key);
                setFilter("all");
              }}
              className={cn(
                "border-r border-slate-200 px-2 py-3 text-xs font-bold last:border-r-0 sm:text-sm",
                section === item.key ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"
              )}
            >
              <span className="mr-1">{item.icon}</span>{item.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 p-3">
          <span className="mr-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Status</span>
          {[
            { key: "all", label: "ALL" },
            { key: "OPEN", label: "OPEN" },
            { key: "IN_PROGRESS", label: "IN PROGRESS" },
            { key: "WAITING_AGENT", label: "WAITING AGENT" },
            { key: "RESOLVED", label: "RESOLVED" },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => setFilter(item.key)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[10px] font-bold",
                filter === item.key ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-500 hover:border-slate-400"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </Card>

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
