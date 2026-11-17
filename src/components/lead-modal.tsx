"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Badge, Button, Card, Input, Modal, NumberInput, Select, Spinner, Textarea } from "@/components/ui";
import { cn, fillTemplate, fmtDate, fmtDuration, relTime, STATUS_COLORS, STATUS_LABELS } from "@/lib/utils";
import { FIELD_DEFS, numText, ratingText, type VisibilityMap } from "@/lib/fields";

type LeadValue = string | number | null;

type LeadDetail = {
  lead: {
    id: number;
    nicheId: number;
    leadCode: LeadValue;
    cityKeyword: LeadValue;
    gmapLink: LeadValue;
    businessName: LeadValue;
    contactName: string | null;
    phone: LeadValue;
    phoneNormalized: LeadValue;
    city: string | null;
    rating: LeadValue;
    reviewsCount: LeadValue;
    competitorReviews: LeadValue;
    categoryName: LeadValue;
    opensAt: LeadValue;
    websiteStatus: LeadValue;
    websiteUrl: LeadValue;
    serviceStatus: LeadValue;
    callStatus: LeadValue;
    status: LeadValue;
    unlocked: boolean;
    recycled: boolean;
    dealAmount: number | null;
  };
  dial: string | null;
  locked: boolean;
  fieldVisibility: VisibilityMap;
  niche: { id: number; name: string; icon: string } | null;
  notes: { id: number; note: string; status: string | null; createdAt: string; author: string; mine: boolean }[];
  historyVisible: boolean;
  hiddenHistoryCount: number;
  historyRequested: boolean;
  assignedAt: string | null;
  lastActivityAt: string | null;
  rejectedDeal: { id: number; rejectionNote: string | null; amount: number; decidedAt: string | null } | null;
  pendingDeal: boolean;
  calls: { id: number; startedAt: string; durationSec: number }[];
  files: { id: number; url: string; kind: string; fileName: string | null; createdAt: string }[];
};

type Template = { id: number; name: string; body: string; nicheId: number | null };

const CALL_OUTCOMES = [
  { value: "CONNECTED", label: "✅ Connected — Spoke to prospect" },
  { value: "NO_ANSWER", label: "📵 No Answer" },
  { value: "BUSY", label: "⏳ Busy / Call Later" },
  { value: "SWITCHED_OFF", label: "🔌 Switched Off" },
  { value: "WRONG_NUMBER", label: "❌ Wrong Number" },
];

export function LeadModal({
  leadId,
  agentName,
  onClose,
  onChanged,
}: {
  leadId: number;
  agentName: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [data, setData] = useState<LeadDetail | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  // staff inline management
  const [me, setMe] = useState<{ id: number; role: string } | null>(null);
  const [agents, setAgents] = useState<{ id: number; name: string }[]>([]);
  const [staffNote, setStaffNote] = useState("");
  const [staffMsg, setStaffMsg] = useState<string | null>(null);
  const [tplId, setTplId] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  // call tracking
  const [callStartedAt, setCallStartedAt] = useState<string | null>(null);

  // status form
  const [status, setStatus] = useState("IN_PROGRESS");
  const [callOutcome, setCallOutcome] = useState("CONNECTED");
  const [note, setNote] = useState("");
  const [dealAmount, setDealAmount] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // uploads
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);
  const [zoom, setZoom] = useState(false);

  // deal proof note (optional, sent with payment approval)
  const [dealNote, setDealNote] = useState("");

  // correction modal
  const [showCorrection, setShowCorrection] = useState(false);
  const [corrReason, setCorrReason] = useState("");
  const [corrStatus, setCorrStatus] = useState("IN_PROGRESS");
  const [corrSent, setCorrSent] = useState(false);

  // replace lead modal
  const [showReplace, setShowReplace] = useState(false);
  const [replaceReason, setReplaceReason] = useState("");
  const [replaceSent, setReplaceSent] = useState(false);

  // history access request
  const [histRequested, setHistRequested] = useState(false);

  // callback scheduling
  const [callbackAt, setCallbackAt] = useState("");

  // lead error report
  const [showError, setShowError] = useState(false);
  const [errorIssue, setErrorIssue] = useState("");
  const [errorSent, setErrorSent] = useState(false);

  // lost lead / return to pool
  const [showLost, setShowLost] = useState(false);
  const [lostReason, setLostReason] = useState("");
  const [lostSent, setLostSent] = useState(false);

  const load = useCallback(async () => {
    const d = await fetch(`/api/leads/${leadId}`).then((r) => r.json());
    if (d.lead) {
      setData(d);
      const st = String(d.lead.status ?? "");
      setStatus(st === "NEW" || !STATUS_LABELS[st] ? "IN_PROGRESS" : st);
      const t = await fetch(`/api/templates?nicheId=${d.lead.nicheId}`).then((r) => r.json());
      setTemplates(t.rows ?? []);
      if (t.rows?.length) setTplId(t.rows[0].id);
    }
  }, [leadId]);

  useEffect(() => {
    load();
    const saved = localStorage.getItem(`call_start_${leadId}`);
    if (saved) setCallStartedAt(saved);
    fetch("/api/meta")
      .then((r) => r.json())
      .then((d) => {
        setMe(d.me ?? null);
        setAgents(d.agents ?? []);
      })
      .catch(() => {});
  }, [load, leadId]);

  // staff inline update — instant, no page reload (modal re-fetches in place)
  async function staffUpdate(body: Record<string, unknown>, successMsg: string) {
    const res = await fetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setStaffMsg(successMsg);
      setTimeout(() => setStaffMsg(null), 2500);
      load();
      onChanged();
    }
  }

  if (!data) {
    return (
      <Modal open onClose={onClose} title="Loading lead…" fullScreen>
        <Spinner />
      </Modal>
    );
  }

  const {
    lead,
    dial,
    locked,
    fieldVisibility: vis,
    niche,
    notes,
    historyVisible,
    hiddenHistoryCount,
    historyRequested,
    assignedAt,
    lastActivityAt,
    rejectedDeal,
    calls,
    files,
  } = data;
  const show = (key: string) => (vis[key] ?? "VISIBLE") !== "HIDDEN";
  const isMasked = (key: string) => (vis[key] ?? "VISIBLE") === "MASKED";

  const statusStr = lead.status === null ? null : String(lead.status);
  const formLocked = submitted || statusStr === "PAYMENT_PENDING" || statusStr === "APPROVED";

  const tpl = templates.find((t) => t.id === tplId);
  const message = tpl ? fillTemplate(tpl.body, lead as unknown as Record<string, unknown>, agentName) : "";
  const canAct = !locked && !!dial;
  const waLink = dial ? `https://wa.me/91${dial.replace(/\D/g, "")}?text=${encodeURIComponent(message)}` : "#";

  // ── Dynamic 14-field grid (respects admin visibility rules) ──────
  const linkValue = (v: LeadValue): ReactNode => {
    const s = v === null ? "" : String(v);
    if (!s) return "—";
    if (s.startsWith("http"))
      return (
        <a href={s} target="_blank" rel="noreferrer" className="text-indigo-600 underline break-all">
          {s.length > 36 ? s.slice(0, 36) + "…" : s} ↗
        </a>
      );
    return s;
  };

  const fieldValue = (key: string): ReactNode => {
    switch (key) {
      case "lead_code":
        return lead.leadCode ?? "—";
      case "city_keyword":
        return lead.cityKeyword ?? lead.city ?? "—";
      case "gmap_link":
        return linkValue(lead.gmapLink);
      case "business_name":
        return lead.businessName ?? "—";
      case "rating":
        return <span className="text-amber-600 font-semibold">★ {ratingText(lead.rating)}</span>;
      case "reviews_count":
        return (
          <span>
            {numText(lead.reviewsCount)} <span className="text-slate-300">vs</span>{" "}
            <span className="text-rose-500 font-semibold">{numText(lead.competitorReviews)}</span>
          </span>
        );
      case "niche_category":
        return lead.categoryName ?? niche?.name ?? "—";
      case "opens_at":
        return lead.opensAt ?? "—";
      case "phone":
        return (
          <span className={cn("font-semibold", (locked || isMasked("phone")) && "tracking-wide text-slate-500")}>
            {lead.phoneNormalized ?? (lead.phone ? `+91 ${lead.phone}` : "—")}
          </span>
        );
      case "website_status":
        return lead.websiteStatus ? (
          <Badge
            className={
              lead.websiteStatus === "ACTIVE"
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : lead.websiteStatus === "BROKEN"
                  ? "bg-rose-50 text-rose-700 border-rose-200"
                  : "bg-slate-100 text-slate-600 border-slate-200"
            }
          >
            {String(lead.websiteStatus)}
          </Badge>
        ) : (
          "—"
        );
      case "website_url":
        return linkValue(lead.websiteUrl);
      case "service_status":
        return lead.serviceStatus ? (
          <Badge
            className={
              lead.serviceStatus === "VERIFIED"
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-amber-50 text-amber-700 border-amber-200"
            }
          >
            {String(lead.serviceStatus)}
          </Badge>
        ) : (
          "—"
        );
      case "call_status":
        return lead.callStatus ?? "—";
      case "status":
        return statusStr ? (
          <Badge className={STATUS_COLORS[statusStr] ?? "bg-slate-100 text-slate-600 border-slate-200"}>
            {STATUS_LABELS[statusStr] ?? statusStr}
          </Badge>
        ) : (
          "—"
        );
      default:
        return "—";
    }
  };

  const visibleFields = FIELD_DEFS.filter((f) => show(f.key));

  function startCall() {
    const now = new Date().toISOString();
    setCallStartedAt(now);
    localStorage.setItem(`call_start_${leadId}`, now); // start time saved on click
  }

  async function copyText() {
    await navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function uploadFile(file: File) {
    setUploading(true);
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("leadId", String(leadId));
    fd.append("kind", "proof");
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const d = await res.json();
    if (!res.ok) setError(d.error ?? "Upload failed");
    setUploading(false);
    load();
  }

  async function submitReport() {
    setSaving(true);
    setError(null);
    try {
      // Call notes / reason is required for general status updates,
      // but NOT when submitting for Payment Approval (proof is the evidence).
      if (status !== "PAYMENT_PENDING" && !note.trim()) {
        setError("Call notes / reason is required for this status change.");
        setSaving(false);
        return;
      }
      if (status === "CALLBACK" && !callbackAt) {
        setError("Select the callback date & time before submitting.");
        setSaving(false);
        return;
      }
      if (status === "PAYMENT_PENDING") {
        const amount = Number(dealAmount);
        if (!amount || amount <= 0) {
          setError("Enter the deal amount for payment approval.");
          setSaving(false);
          return;
        }
        const proof = files[0]?.url ?? null;
        if (!proof) {
          setError("Upload the payment proof / screenshot before submitting for approval.");
          setSaving(false);
          return;
        }
        const res = await fetch("/api/agent/actions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "deal-submit", leadId, amount, screenshotUrl: proof, note: dealNote }),
        });
        if (!res.ok) throw new Error((await res.json()).error);
      }
      const res = await fetch("/api/agent/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "status-update",
          leadId,
          status,
          note,
          callStartedAt,
          callStatus: status === "IN_PROGRESS" ? callOutcome : undefined,
          callbackAt: status === "CALLBACK" ? callbackAt : undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      localStorage.removeItem(`call_start_${leadId}`); // end time recorded on submit
      setCallStartedAt(null);
      setSubmitted(true);
      onChanged();
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit");
    }
    setSaving(false);
  }

  async function sendReplaceRequest() {
    const res = await fetch("/api/agent/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "replace-request", leadId, reason: replaceReason }),
    });
    if (res.ok) {
      setReplaceSent(true);
      setTimeout(() => {
        setShowReplace(false);
        setReplaceSent(false);
        setReplaceReason("");
      }, 1600);
    }
  }

  async function requestHistoryAccess() {
    await fetch("/api/agent/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "history-request", leadId }),
    });
    setHistRequested(true);
  }

  async function sendCorrection() {
    await fetch("/api/agent/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "correction", leadId, reason: corrReason, requestedStatus: corrStatus }),
    });
    setCorrSent(true);
    setTimeout(() => {
      setShowCorrection(false);
      setCorrSent(false);
      setCorrReason("");
    }, 1500);
  }

  return (
    <>
      <Modal
        open
        onClose={onClose}
        fullScreen
        title={
          <span className="flex items-center gap-2">
            {niche?.icon} {lead.businessName ?? "Lead"}
            {statusStr && (
              <Badge className={STATUS_COLORS[statusStr] ?? "bg-slate-100 text-slate-600 border-slate-200"}>
                {STATUS_LABELS[statusStr] ?? statusStr}
              </Badge>
            )}
          </span>
        }
      >
        <div className="space-y-4 max-w-2xl mx-auto">
          {/* ── Locked banner ── */}
          {locked && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 flex items-start gap-2">
              <span className="text-lg">🔒</span>
              <div>
                <p className="font-semibold">Prospect details locked</p>
                <p className="text-xs mt-0.5">
                  Full contact details stay masked until Admin / Manager approves lead access for you.
                </p>
              </div>
            </div>
          )}
          {lead.recycled && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-700">
              ♻️ Recycled lead — previously worked by another agent (identity hidden for privacy). Review past notes below.
            </div>
          )}

          {/* ── Staff inline management: instant updates, no reload ── */}
          {me && me.role !== "AGENT" && (
            <Card className="p-4 border-indigo-200 space-y-2.5">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wide text-indigo-500">🛠 Quick Management Actions</p>
                {staffMsg && <span className="text-[11px] font-semibold text-emerald-600">{staffMsg}</span>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <p className="mb-1 text-[9px] font-bold uppercase text-slate-400">Pipeline Status</p>
                  <Select
                    value={statusStr ?? "NEW"}
                    onChange={(e) => staffUpdate({ status: e.target.value }, "✓ Status updated")}
                  >
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <p className="mb-1 text-[9px] font-bold uppercase text-slate-400">Assigned To</p>
                  <Select
                    value={(lead as unknown as { assignedTo: number | null }).assignedTo ?? ""}
                    onChange={(e) =>
                      staffUpdate(
                        { assignedTo: e.target.value === "" ? null : Number(e.target.value) },
                        e.target.value === "" ? "✓ Returned to Pool" : "✓ Re-assigned"
                      )
                    }
                  >
                    <option value="">🗃 Pool</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <p className="mb-1 text-[9px] font-bold uppercase text-slate-400">Prospect Details Lock</p>
                  <Button
                    variant={lead.unlocked ? "outline" : "success"}
                    size="sm"
                    className="w-full h-10"
                    onClick={() => staffUpdate({ unlocked: !lead.unlocked }, lead.unlocked ? "✓ Locked" : "✓ Unlocked for agent")}
                  >
                    {lead.unlocked ? "🔒 Lock Details" : "🔓 Unlock Details"}
                  </Button>
                </div>
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Add internal note / remark… (Enter to save)"
                  value={staffNote}
                  onChange={(e) => setStaffNote(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && staffNote.trim()) {
                      staffUpdate({ addNote: staffNote }, "✓ Note added to timeline");
                      setStaffNote("");
                    }
                  }}
                />
                <Button
                  variant="primary"
                  size="sm"
                  className="h-10"
                  disabled={!staffNote.trim()}
                  onClick={() => {
                    staffUpdate({ addNote: staffNote }, "✓ Note added to timeline");
                    setStaffNote("");
                  }}
                >
                  ➕ Note
                </Button>
              </div>
            </Card>
          )}

          {/* ── Dynamic prospect info — 14 fields, RBAC-filtered ── */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Prospect Info & Audit</p>
              <p className="text-[10px] text-slate-400">
                {visibleFields.length}/{FIELD_DEFS.length} fields visible for your role
              </p>
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
              <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200">
                📥 Assigned {relTime(assignedAt)}
              </Badge>
              <Badge className="bg-slate-100 text-slate-600 border-slate-200">
                ✋ Last touched {relTime(lastActivityAt)}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-3 text-sm">
              {visibleFields.map((f) => (
                <div key={f.key} className={cn(f.key === "gmap_link" || f.key === "website_url" ? "col-span-2" : "")}>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">
                    {f.icon} {f.label}
                    {isMasked(f.key) && <span className="ml-1 normal-case text-amber-500">(masked)</span>}
                  </p>
                  <div className="mt-0.5 font-medium text-slate-800 text-[13px] break-words">{fieldValue(f.key)}</div>
                </div>
              ))}
            </div>
            {show("reviews_count") &&
              typeof lead.reviewsCount === "number" &&
              typeof lead.competitorReviews === "number" && (
                <>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-center">
                      <p className="text-xl font-bold text-emerald-700">{lead.reviewsCount}</p>
                      <p className="text-[11px] font-semibold text-emerald-600">Their Google Reviews</p>
                    </div>
                    <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-center">
                      <p className="text-xl font-bold text-rose-700">{lead.competitorReviews}</p>
                      <p className="text-[11px] font-semibold text-rose-600">Top Competitor Reviews</p>
                    </div>
                  </div>
                  {lead.competitorReviews > lead.reviewsCount && (
                    <p className="mt-2 text-xs text-slate-500">
                      💡 Pitch angle: competitor has <b>{lead.competitorReviews - lead.reviewsCount} more reviews</b> —
                      perfect gap for the Google Audit Report.
                    </p>
                  )}
                </>
              )}
          </Card>

          {/* ── One-click native call ── */}
          <Card className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Native Phone Call</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {callStartedAt
                    ? `📞 Call started ${fmtDate(callStartedAt)} — duration saves on report submit`
                    : "Tap to open your phone dialer. Duration is tracked automatically."}
                </p>
              </div>
              {!canAct ? (
                <Button variant="outline" disabled>
                  🔒 Locked
                </Button>
              ) : (
                <a href={`tel:+91${dial!.replace(/\D/g, "")}`} onClick={startCall}>
                  <Button variant="success" size="lg">
                    📞 Call Now
                  </Button>
                </a>
              )}
            </div>
            {calls.length > 0 && (
              <div className="mt-3 border-t border-slate-100 pt-2 space-y-1">
                {calls.slice(0, 3).map((c) => (
                  <p key={c.id} className="text-[11px] text-slate-500">
                    ☎ {fmtDate(c.startedAt)} · {fmtDuration(c.durationSec)}
                  </p>
                ))}
              </div>
            )}
          </Card>

          {/* ── WhatsApp templates ── */}
          <Card className="p-4 space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
              Personalized WhatsApp Template
            </p>
            <Select value={tplId ?? ""} onChange={(e) => setTplId(Number(e.target.value))}>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
            <Textarea readOnly value={message} rows={7} className="bg-slate-50 text-[13px] leading-relaxed" />
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={copyText}>
                {copied ? "✅ Copied!" : "📋 Copy Text"}
              </Button>
              {!canAct ? (
                <Button variant="whatsapp" disabled>
                  🔒 Unlock to Send
                </Button>
              ) : (
                <a href={waLink} target="_blank" rel="noreferrer" className="contents">
                  <Button variant="whatsapp" className="w-full">
                    🟢 Send via WhatsApp
                  </Button>
                </a>
              )}
            </div>
          </Card>

          {/* ── Rejected proof banner (staff comments + re-upload) ── */}
          {rejectedDeal && (
            <Card className="p-4 border-rose-300 bg-rose-50/60 space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-rose-600">
                ❌ Payment Proof Rejected {rejectedDeal.decidedAt ? `· ${relTime(rejectedDeal.decidedAt)}` : ""}
              </p>
              <div className="rounded-lg bg-white border border-rose-200 p-3 text-xs text-rose-800">
                <p className="font-semibold mb-0.5">Admin/HR comments:</p>
                <p>“{rejectedDeal.rejectionNote ?? "Proof could not be verified."}”</p>
              </div>
              <p className="text-[11px] text-rose-600">
                Fix the issue, upload a fresh screenshot below, set status to Payment Approval and re-submit.
              </p>
              <Button
                variant="danger"
                size="sm"
                className="w-full"
                onClick={() => {
                  setSubmitted(false);
                  setStatus("PAYMENT_PENDING");
                  setDealAmount(String(rejectedDeal.amount));
                }}
              >
                🔁 Re-upload Proof & Re-submit Deal
              </Button>
            </Card>
          )}

          {/* ── Payment proof upload — ONE clean section, ONLY for Payment Approval ── */}
          {(status === "PAYMENT_PENDING" || statusStr === "PAYMENT_PENDING") && (
          <Card className="p-4 space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
              Upload Payment Proof / Screenshot
            </p>
            {!formLocked && (
              <>
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 p-4 text-sm text-slate-500 hover:border-indigo-400 hover:text-indigo-600">
                  {uploading ? "Uploading securely…" : "📤 Tap to upload screenshot / proof (max 4MB)"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])}
                  />
                </label>
                <Input
                  placeholder="Optional note with your proof (e.g. 'UPI ref 4921…, paid 50% advance')"
                  value={dealNote}
                  onChange={(e) => setDealNote(e.target.value)}
                />
              </>
            )}
            {files.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {files.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => {
                      setPreview({ url: f.url, name: f.fileName ?? "proof" });
                      setZoom(false);
                    }}
                    className="group relative h-16 w-16 overflow-hidden rounded-lg border border-slate-200"
                    title="View uploaded proof"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.url} alt={f.fileName ?? "proof"} className="h-full w-full object-cover" />
                    <span className="absolute inset-0 hidden items-center justify-center bg-slate-900/50 text-white text-lg group-hover:flex">
                      🔍
                    </span>
                  </button>
                ))}
              </div>
            )}
            {files.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => setPreview({ url: files[0].url, name: files[0].fileName ?? "proof" })}>
                👁 View Uploaded Proof / Preview
              </Button>
            )}
          </Card>
          )}

          {/* ── Status update / post-call report ── */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Post-Call Report</p>
              {formLocked && <Badge className="bg-slate-100 text-slate-600 border-slate-200">🔒 Form locked</Badge>}
            </div>
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase text-slate-400">Pipeline Status</p>
              <Select value={status} onChange={(e) => setStatus(e.target.value)} disabled={formLocked}>
                <option value="IN_PROGRESS">In Process</option>
                <option value="CALLBACK">Call back</option>
                <option value="NO_RESPONSE">No Response</option>
                <option value="PAYMENT_PENDING">Payment Approval (Deal Closed)</option>
                <option value="REJECTED">Reject/Not Interest</option>
              </Select>
            </div>
            {/* Callback Date & Time — shown ONLY when status is Call back */}
            {status === "CALLBACK" && !formLocked && (
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase text-slate-400">
                  📅 Callback Date & Time <span className="text-rose-500">*</span>
                </p>
                <Input
                  type="datetime-local"
                  value={callbackAt}
                  min={new Date().toISOString().slice(0, 16)}
                  onChange={(e) => setCallbackAt(e.target.value)}
                />
              </div>
            )}
            {/* Call Outcome — shown ONLY when status is In Process */}
            {status === "IN_PROGRESS" && (
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase text-slate-400">Call Outcome (call_status)</p>
                <Select value={callOutcome} onChange={(e) => setCallOutcome(e.target.value)} disabled={formLocked}>
                  {CALL_OUTCOMES.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            {status === "PAYMENT_PENDING" && !formLocked && (
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase text-slate-400">
                  Deal Value (₹) <span className="text-rose-500">*</span> — exact amount paid by the customer
                </p>
                <NumberInput
                  placeholder="e.g. 15000"
                  value={dealAmount}
                  onChange={(e) => setDealAmount(e.target.value)}
                />
                <p className="mt-1 text-[10px] text-slate-400">
                  Commission credits per close as per your current slab tier.
                </p>
              </div>
            )}
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase text-slate-400">
                Call Notes / Reason{" "}
                {status !== "PAYMENT_PENDING" ? (
                  <span className="text-rose-500">* (required)</span>
                ) : (
                  <span className="text-slate-400 normal-case">(optional — proof is your evidence)</span>
                )}
              </p>
              <Textarea
                placeholder={
                  status === "PAYMENT_PENDING"
                    ? "Optional notes — e.g. 'Prospect paid full amount via UPI'"
                    : "What happened on the call? e.g. 'Owner asked to call back Friday 11am' — appended to the audit timeline"
                }
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={formLocked}
              />
            </div>
            {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
            {!formLocked ? (
              <Button
                variant="primary"
                className="w-full"
                onClick={submitReport}
                disabled={saving || (status !== "PAYMENT_PENDING" && !note.trim())}
              >
                {saving ? "Submitting…" : "✔ Submit Report & Lock"}
              </Button>
            ) : (
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-700">
                <p className="font-semibold">Report submitted & locked 🔒</p>
                <p className="mt-0.5">This form is now read-only. Made a mistake? Raise a correction request below.</p>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Button variant="warning" size="sm" onClick={() => setShowCorrection(true)}>
                ⚠️ Request Correction
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowReplace(true)}>
                🔄 Request Replace Lead
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowError(true)}>
                🚩 Report Lead Error
              </Button>
            </div>
            <Button variant="ghost" size="sm" className="w-full text-zinc-500" onClick={() => setShowLost(true)}>
              🏳️ Remove Lead / I Lost My Efforts
            </Button>
          </Card>

          {/* ── Audit history timeline (append-only, anonymized) ── */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                Audit History · Call Notes Timeline
              </p>
              <span className="text-[10px] text-slate-400">append-only</span>
            </div>
            {!historyVisible && (
              <div className="mb-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold text-slate-600">
                  🔐 Audit history · previous agents (anonymous)
                </p>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  {hiddenHistoryCount > 0
                    ? `${hiddenHistoryCount} past note${hiddenHistoryCount > 1 ? "s" : ""} hidden by admin policy.`
                    : "Past agent notes are hidden by admin policy."}{" "}
                  You can request access from HR/Admin.
                </p>
                {historyRequested || histRequested ? (
                  <Badge className="mt-2 bg-amber-50 text-amber-700 border-amber-200">
                    ⏳ History access requested — awaiting HR/Admin approval
                  </Badge>
                ) : (
                  <Button variant="outline" size="sm" className="mt-2" onClick={requestHistoryAccess}>
                    🔓 Request History Access
                  </Button>
                )}
              </div>
            )}
            {notes.length === 0 ? (
              <p className="text-xs text-slate-400 py-2">
                {historyVisible ? "No notes yet — you're first on this lead." : "No notes from you on this lead yet."}
              </p>
            ) : (
              <div className="space-y-2">
                {notes.map((n) => (
                  <div key={n.id} className={cn("rounded-lg border p-2.5", n.mine ? "border-indigo-200 bg-indigo-50/50" : "border-slate-200 bg-slate-50")}>
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span className={cn("font-semibold", n.mine ? "text-indigo-600" : "")}>
                        {n.mine ? "🧑 You" : "🕵️ " + n.author}
                      </span>
                      <span>{fmtDate(n.createdAt)}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-700">{n.note}</p>
                    {n.status && <Badge className={cn("mt-1", STATUS_COLORS[n.status])}>{STATUS_LABELS[n.status]}</Badge>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </Modal>

      {/* ── Image preview with zoom ── */}
      <Modal open={!!preview} onClose={() => setPreview(null)} title={`Preview — ${preview?.name ?? ""}`} maxWidth="max-w-2xl">
        {preview && (
          <div className="space-y-3">
            <div className="overflow-auto max-h-[65vh] rounded-lg border border-slate-200 bg-slate-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview.url}
                alt={preview.name}
                onClick={() => setZoom((z) => !z)}
                className={cn("mx-auto cursor-zoom-in transition-transform", zoom ? "scale-[1.8] cursor-zoom-out origin-top" : "max-h-[60vh] object-contain")}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setZoom((z) => !z)}>
                {zoom ? "🔍 Zoom Out" : "🔍 Zoom In"}
              </Button>
              <a href={preview.url} target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm">↗ Open Full Size</Button>
              </a>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Lost lead / return to pool modal ── */}
      <Modal open={showLost} onClose={() => setShowLost(false)} title="🏳️ Remove Lead / I Lost My Efforts">
        {lostSent ? (
          <div className="py-8 text-center">
            <p className="text-3xl">🏳️</p>
            <p className="mt-2 text-sm font-semibold text-emerald-700">Lead moved to the Lost / Returned pool.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              Tried everything and can&apos;t move this prospect forward? Surrendering sends the lead to the{" "}
              <b>&ldquo;Lost / Returned to Pool&rdquo;</b> pipeline stage for management review — it leaves your queue
              immediately.
            </p>
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase text-slate-400">
                Why are you giving up this lead? <span className="text-rose-500">*</span>
              </p>
              <Textarea
                placeholder="e.g. 'Called 8 times over 2 weeks, owner refuses to engage — not worth further effort'"
                rows={4}
                value={lostReason}
                onChange={(e) => setLostReason(e.target.value)}
              />
            </div>
            <Button
              variant="danger"
              className="w-full"
              disabled={!lostReason.trim()}
              onClick={async () => {
                const res = await fetch("/api/agent/actions", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "lost-lead", leadId, reason: lostReason }),
                });
                if (res.ok) {
                  setLostSent(true);
                  onChanged();
                  setTimeout(() => onClose(), 1500);
                }
              }}
            >
              Confirm — Move to Lost Pool
            </Button>
          </div>
        )}
      </Modal>

      {/* ── Report Lead Error modal ── */}
      <Modal open={showError} onClose={() => setShowError(false)} title="🚩 Report Lead Error">
        {errorSent ? (
          <div className="py-8 text-center">
            <p className="text-3xl">✅</p>
            <p className="mt-2 text-sm font-semibold text-emerald-700">
              Error report sent to the Lead Errors review queue!
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              Wrong data on this lead? Incorrect phone, duplicate entry, wrong niche, bad review counts — describe the
              issue and management will review it in their Lead Errors dashboard.
            </p>
            <Textarea
              placeholder="e.g. 'Phone number belongs to a different business — actual business is a bakery, not a dentist'"
              rows={4}
              value={errorIssue}
              onChange={(e) => setErrorIssue(e.target.value)}
            />
            <Button
              variant="danger"
              className="w-full"
              disabled={!errorIssue.trim()}
              onClick={async () => {
                const res = await fetch("/api/lead-errors", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ leadId, issue: errorIssue }),
                });
                if (res.ok) {
                  setErrorSent(true);
                  setTimeout(() => {
                    setShowError(false);
                    setErrorSent(false);
                    setErrorIssue("");
                  }, 1600);
                }
              }}
            >
              Submit Error Report
            </Button>
          </div>
        )}
      </Modal>

      {/* ── Request Replace Lead modal ── */}
      <Modal open={showReplace} onClose={() => setShowReplace(false)} title="🔄 Request Replace Lead">
        {replaceSent ? (
          <div className="py-8 text-center">
            <p className="text-3xl">📨</p>
            <p className="mt-2 text-sm font-semibold text-emerald-700">
              Replacement request sent to Admin/HR/Manager for approval!
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              Wrong number, shut business, duplicate, or unreachable lead? Request a replacement — on approval this
              lead returns to the pool and a fresh one is assigned to you.
            </p>
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase text-slate-400">
                Reason for Replacement <span className="text-rose-500">*</span>
              </p>
              <Textarea
                placeholder="e.g. 'Number is permanently switched off — tried 5 times over 3 days' or 'Business has shut down'"
                rows={4}
                value={replaceReason}
                onChange={(e) => setReplaceReason(e.target.value)}
              />
            </div>
            <Button variant="primary" className="w-full" onClick={sendReplaceRequest} disabled={!replaceReason.trim()}>
              Submit Replacement Request
            </Button>
          </div>
        )}
      </Modal>

      {/* ── Correction request modal ── */}
      <Modal open={showCorrection} onClose={() => setShowCorrection(false)} title="⚠️ Request Correction (Admin / HR review)">
        {corrSent ? (
          <div className="py-8 text-center">
            <p className="text-3xl">✅</p>
            <p className="mt-2 text-sm font-semibold text-emerald-700">Correction request sent for review!</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              Made a mistake in the submitted status? Explain what happened — Admin / HR will review and correct it.
            </p>
            <Select value={corrStatus} onChange={(e) => setCorrStatus(e.target.value)}>
              <option value="IN_PROGRESS">Correct status → In Progress</option>
              <option value="CALLBACK">Correct status → Callback</option>
              <option value="PAYMENT_PENDING">Correct status → Payment Pending</option>
              <option value="REJECTED">Correct status → Rejected</option>
            </Select>
            <Textarea
              placeholder="Reason — e.g. 'Selected Rejected by mistake, prospect actually asked for a callback tomorrow'"
              rows={4}
              value={corrReason}
              onChange={(e) => setCorrReason(e.target.value)}
            />
            <Button variant="warning" className="w-full" onClick={sendCorrection} disabled={!corrReason.trim()}>
              Submit Correction Request
            </Button>
          </div>
        )}
      </Modal>
    </>
  );
}
