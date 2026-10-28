"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Shell } from "@/components/shell";
import { Badge, Button, Card, Input, Modal, NumberInput, Select, Spinner, Stat, Textarea } from "@/components/ui";
import { cn, fmtDate, inr, STATUS_COLORS, STATUS_LABELS } from "@/lib/utils";

type Profile = {
  id: number;
  name: string;
  email: string;
  role: string;
  phone: string | null;
  altPhone: string | null;
  guardianPhone: string | null;
  qualification: string | null;
  aboutNote: string | null;
  badges: string | null;
  avatarUrl: string | null;
  upiId: string | null;
  bankAccount: string | null;
  ifsc: string | null;
  paymentDetailsStatus: string;
  walletTotal: number;
  walletPending: number;
  walletApproved: number;
};
type Earning = { id: number; kind: string; status: string; leadName: string | null; businessName: string; amount: number; approvedAt: string };
type Withdrawal = { id: number; amount: number; status: string; createdAt: string };
type Upload = { id: number; kind: string; url: string; fileName: string | null; status: string; rejectionNote: string | null; createdAt: string };
type DailyLog = { day: string; activeSeconds: number; touchedLeads: number; statusChanges: number; dealsClosed: number };

const KYC_DOCS = [
  { kind: "kyc_aadhaar", label: "Aadhaar Card" },
  { kind: "kyc_photo", label: "Passport Photo → Avatar" },
  { kind: "kyc_pan", label: "PAN Card" },
];

const QUALIFICATIONS = ["10th Pass", "12th Pass", "Diploma", "Graduate", "Post Graduate", "Other"];
const BADGE_STYLES = ["bg-amber-50 text-amber-700 border-amber-300", "bg-indigo-50 text-indigo-700 border-indigo-300", "bg-emerald-50 text-emerald-700 border-emerald-300"];

function ProfilePage() {
  const params = useSearchParams();
  const viewUserId = params.get("userId");

  const [profile, setProfile] = useState<Profile | null>(null);
  const [isStaffViewer, setIsStaffViewer] = useState(false);
  const [viewingSelf, setViewingSelf] = useState(true);
  const [earnings, setEarnings] = useState<Earning[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [kyc, setKyc] = useState<Upload[]>([]);
  const [dailyLog, setDailyLog] = useState<DailyLog[]>([]);
  const [pipeline, setPipeline] = useState<Record<string, number>>({});
  const [closes, setCloses] = useState(0);
  const [slabAmount, setSlabAmount] = useState(0);
  const [rank, setRank] = useState(0);
  const [totalAgents, setTotalAgents] = useState(0);
  const [showIdCard, setShowIdCard] = useState(false);
  const [slabTiers, setSlabTiers] = useState<{ label: string; amount: number; custom: boolean }[]>([]);
  const [currentTier, setCurrentTier] = useState(0);
  const [slabInputs, setSlabInputs] = useState<string[]>(["", "", "", "", ""]);
  const [quotaInput, setQuotaInput] = useState("");
  const [todaySeconds, setTodaySeconds] = useState(0);
  const [agents, setAgents] = useState<{ id: number; name: string }[]>([]);

  // form state
  const [upi, setUpi] = useState("");
  const [bank, setBank] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [phone, setPhone] = useState("");
  const [altPhone, setAltPhone] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [qualification, setQualification] = useState("Graduate");
  const [wAmount, setWAmount] = useState("");
  const [about, setAbout] = useState("");
  const [badgesInput, setBadgesInput] = useState("");
  const [preview, setPreview] = useState<Upload | null>(null);
  const [zoom, setZoom] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [uploadingKind, setUploadingKind] = useState<string | null>(null);

  const load = useCallback(async () => {
    const q = viewUserId ? `?userId=${viewUserId}` : "";
    const d = await fetch(`/api/agent/profile${q}`).then((r) => r.json());
    if (d.profile) {
      setProfile(d.profile);
      setIsStaffViewer(!!d.isStaffViewer);
      setViewingSelf(!!d.viewingSelf);
      setEarnings(d.earnings ?? []);
      setWithdrawals(d.withdrawals ?? []);
      setKyc(d.kyc ?? []);
      setDailyLog(d.dailyLog ?? []);
      setPipeline(d.pipeline ?? {});
      setCloses(d.closes ?? 0);
      setSlabAmount(d.currentSlabAmount ?? 0);
      setRank(d.rank ?? 0);
      setTotalAgents(d.totalAgents ?? 0);
      setSlabTiers(d.slabTiers ?? []);
      setCurrentTier(d.currentTier ?? 0);
      setSlabInputs((d.slabTiers ?? []).map((t: { amount: number; custom: boolean }) => (t.custom ? String(t.amount) : "")));
      setQuotaInput(d.dailyLeadQuota === null || d.dailyLeadQuota === undefined ? "" : String(d.dailyLeadQuota));
      setTodaySeconds(d.todaySeconds ?? 0);
      setUpi(d.profile.upiId ?? "");
      setBank(d.profile.bankAccount ?? "");
      setIfsc(d.profile.ifsc ?? "");
      setPhone(d.profile.phone ?? "");
      setAltPhone(d.profile.altPhone ?? "");
      setGuardianPhone(d.profile.guardianPhone ?? "");
      setQualification(d.profile.qualification ?? "Graduate");
      setAbout(d.profile.aboutNote ?? "");
      setBadgesInput(d.profile.badges ?? "");
    }
    if (d.isStaffViewer) {
      fetch("/api/meta").then((r) => r.json()).then((m) => setAgents(m.agents ?? []));
    }
  }, [viewUserId]);

  useEffect(() => {
    load();
  }, [load]);

  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(null), 3000);
  };

  async function savePayment() {
    const res = await fetch("/api/agent/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "payment-details", upiId: upi, bankAccount: bank, ifsc }),
    });
    const d = await res.json();
    flash(res.ok ? "Payout details submitted for approval ✅" : `❌ ${d.error}`);
    load();
  }

  async function saveKycFields() {
    await fetch("/api/agent/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "kyc-fields", phone, altPhone, guardianPhone, qualification }),
    });
    flash("Contact & qualification details saved ✅");
    load();
  }

  async function requestWithdrawal() {
    const res = await fetch("/api/agent/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "withdrawal", amount: Number(wAmount) }),
    });
    const d = await res.json();
    flash(res.ok ? "Withdrawal request submitted ✅" : `❌ ${d.error}`);
    setWAmount("");
    load();
  }

  async function uploadKyc(kind: string, file: File) {
    setUploadingKind(kind);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", kind);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    if (!res.ok) flash(`❌ ${(await res.json()).error}`);
    setUploadingKind(null);
    load();
  }

  async function kycDecision(docId: number, decision: "approve" | "reject") {
    let note: string | undefined;
    if (decision === "reject") {
      const input = window.prompt("Rejection reason (shown to the agent as a popup):", "Document unclear / cropped — please re-upload a sharp full photo.");
      if (input === null) return;
      note = input;
    }
    await fetch("/api/upload", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: docId, decision, note }),
    });
    flash(decision === "approve" ? "✅ KYC document approved" : "❌ KYC rejected — agent gets an automatic popup");
    load();
  }

  async function staffPatch(body: Record<string, unknown>) {
    const res = await fetch("/api/agent/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: profile!.id, ...body }),
    });
    flash(res.ok ? "Saved ✅" : "❌ Update failed");
    load();
  }

  if (!profile) return <Spinner />;

  const docFor = (kind: string) => kyc.find((k) => k.kind === kind);
  const marksheets = kyc.filter((k) => k.kind === "kyc_marksheet");
  const payLocked = profile.paymentDetailsStatus === "APPROVED";
  const badgeList = (profile.badges ?? "").split(",").map((b) => b.trim()).filter(Boolean);
  const commissionTotal = earnings.filter((e) => e.kind === "COMMISSION").reduce((a, e) => a + e.amount, 0);
  const bonusTotal = earnings.filter((e) => e.kind === "BONUS").reduce((a, e) => a + e.amount, 0);
  const fmtActive = (s: number) => `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Staff: agent picker */}
      {isStaffViewer && (
        <Card className="p-3 flex flex-wrap items-center gap-2">
          <p className="text-xs font-bold text-slate-500">👥 Viewing profile:</p>
          <Select
            className="max-w-[220px]"
            value={viewingSelf ? "" : String(profile.id)}
            onChange={(e) => {
              const v = e.target.value;
              window.location.href = v ? `/agent/profile?userId=${v}` : "/agent/profile";
            }}
          >
            <option value="">My own profile</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Card>
      )}

      {/* Header with avatar + badges */}
      <div className="flex items-center gap-3">
        {profile.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.avatarUrl} alt={profile.name} className="h-14 w-14 rounded-2xl object-cover border border-slate-200" />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-lg font-bold text-white">
            {profile.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold flex items-center gap-2 flex-wrap">
            {profile.name}
            {profile.role === "AGENT" && rank > 0 && (
              <Badge className="bg-slate-900 text-white border-slate-900">
                {rank === 1 ? "🥇 #1 Top Closer" : `🏆 Rank #${rank} of ${totalAgents}`}
              </Badge>
            )}
            {badgeList.map((b, i) => (
              <Badge key={b} className={BADGE_STYLES[i % BADGE_STYLES.length]}>
                🏅 {b}
              </Badge>
            ))}
          </h1>
          <p className="text-xs text-slate-500">
            {profile.email} · <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200">{profile.role}</Badge>
            {profile.role === "AGENT" && (
              <span className="ml-2 text-emerald-600 font-semibold">💼 {inr(slabAmount)} commission per close</span>
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowIdCard(true)}>
          🪪 ID Card
        </Button>
      </div>

      {profile.aboutNote && (
        <Card className="p-3 bg-slate-50 text-xs text-slate-600 italic">💬 {profile.aboutNote}</Card>
      )}

      {msg && <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-3 text-sm text-indigo-700">{msg}</div>}

      {/* Wallet + slab position */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Total Earned" value={inr(profile.walletTotal)} />
        <Stat label="Pending Approval" value={inr(profile.walletPending)} accent="text-amber-600" />
        <Stat label="Withdrawable" value={inr(profile.walletApproved)} accent="text-emerald-600" />
        <Stat label="Closes / Next Rate" value={`${closes} · ${inr(slabAmount)}`} sub="per close at current slab" accent="text-indigo-600" />
      </div>

      {/* Staff controls: about, badges, pipeline, lock */}
      {isStaffViewer && !viewingSelf && (
        <Card className="p-4 space-y-3 border-indigo-200">
          <p className="text-[11px] font-bold uppercase tracking-wide text-indigo-500">🛠 Management Controls</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase text-slate-400">About Person</p>
              <Textarea rows={3} value={about} onChange={(e) => setAbout(e.target.value)} placeholder="e.g. 'Consistent closer, strong Hindi+English, best at dentist niche'" />
              <Button variant="outline" size="sm" onClick={() => staffPatch({ aboutNote: about })}>💾 Save About</Button>
            </div>
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase text-slate-400">Role & Badges (comma-separated)</p>
              <Input value={badgesInput} onChange={(e) => setBadgesInput(e.target.value)} placeholder="Star Caller, Top Closer" />
              <Button variant="outline" size="sm" onClick={() => staffPatch({ badges: badgesInput })}>🏅 Save Badges</Button>
              <div className="flex items-center gap-2 pt-1">
                {payLocked ? (
                  <Button variant="warning" size="sm" onClick={() => staffPatch({ paymentDetailsAction: "unlock" })}>
                    🔓 Unlock Bank/UPI Details
                  </Button>
                ) : (
                  <Button variant="success" size="sm" onClick={() => staffPatch({ paymentDetailsAction: "approve" })} disabled={profile.paymentDetailsStatus === "NONE"}>
                    ✅ Approve & Lock Bank/UPI
                  </Button>
                )}
                <Badge className="bg-slate-100 text-slate-600 border-slate-200">{profile.paymentDetailsStatus}</Badge>
              </div>
            </div>
          </div>
          {/* Per-agent 5-tier commission slab configuration */}
          <div className="border-t border-slate-100 pt-3">
            <p className="text-[10px] font-semibold uppercase text-slate-400 mb-1.5">
              💰 Custom Commission Slabs (₹ per close) — blank = use global rate
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {slabTiers.map((t, i) => (
                <div key={i} className={cn("rounded-xl border p-2", i === currentTier ? "border-indigo-400 bg-indigo-50/50" : "border-slate-200")}>
                  <p className="text-[9px] font-bold text-slate-500 leading-tight">{t.label}</p>
                  <NumberInput
                    className="mt-1 h-8 text-xs"
                    placeholder={`${t.custom ? "" : "global "}₹${t.amount}`}
                    value={slabInputs[i] ?? ""}
                    onChange={(e) => {
                      const next = [...slabInputs];
                      next[i] = e.target.value;
                      setSlabInputs(next);
                    }}
                  />
                  <p className="mt-0.5 text-[8px] text-slate-400">
                    {i === currentTier ? "← active tier" : t.custom ? "custom" : "global"}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-2 flex flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => staffPatch({ slabs: slabInputs.map((v) => (v.trim() === "" ? null : Number(v))) })}
              >
                💾 Save Custom Slab Rates
              </Button>
              <div className="flex items-center gap-2 sm:ml-auto">
                <p className="text-[10px] font-semibold uppercase text-slate-400 whitespace-nowrap">📦 Daily Auto-Assign Limit</p>
                <NumberInput
                  className="h-8 w-24 text-xs"
                  placeholder="default"
                  value={quotaInput}
                  onChange={(e) => setQuotaInput(e.target.value)}
                />
                <span className="text-[10px] text-slate-400">leads/day</span>
                <Button variant="outline" size="sm" onClick={() => staffPatch({ dailyLeadQuota: quotaInput.trim() === "" ? null : Number(quotaInput) })}>
                  Save
                </Button>
              </div>
            </div>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase text-slate-400 mb-1.5">Pipeline Breakdown</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(pipeline).map(([s, n]) => (
                <Badge key={s} className={STATUS_COLORS[s] ?? "bg-slate-100 text-slate-600 border-slate-200"}>
                  {STATUS_LABELS[s] ?? s}: {n}
                </Badge>
              ))}
              {Object.keys(pipeline).length === 0 && <p className="text-xs text-slate-400">No active leads</p>}
            </div>
          </div>
        </Card>
      )}

      {/* Payout details + withdrawal */}
      <div className="grid sm:grid-cols-2 gap-4">
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Bank / UPI Payout Details</p>
            {payLocked ? (
              <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">✅ Approved & Locked</Badge>
            ) : profile.paymentDetailsStatus === "SUBMITTED" ? (
              <Badge className="bg-amber-50 text-amber-700 border-amber-200">⏳ Awaiting approval</Badge>
            ) : null}
          </div>
          <Input placeholder="Bank Account Number" value={bank} onChange={(e) => setBank(e.target.value)} disabled={payLocked && !isStaffViewer} />
          <Input placeholder="IFSC Code" value={ifsc} onChange={(e) => setIfsc(e.target.value.toUpperCase())} disabled={payLocked && !isStaffViewer} />
          <Input placeholder="UPI ID (name@upi)" value={upi} onChange={(e) => setUpi(e.target.value)} disabled={payLocked && !isStaffViewer} />
          {payLocked && !isStaffViewer ? (
            <p className="text-[11px] text-slate-400">🔒 Locked after approval — contact HR/Admin to unlock.</p>
          ) : (
            viewingSelf && (
              <Button variant="outline" onClick={savePayment} className="w-full">
                💾 Submit Payout Details
              </Button>
            )
          )}
        </Card>
        <Card className="p-4 space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Request Withdrawal</p>
          <p className="text-xs text-slate-500">
            Withdrawable: <b className="text-emerald-600">{inr(profile.walletApproved)}</b>
          </p>
          <NumberInput placeholder="Amount (₹)" value={wAmount} onChange={(e) => setWAmount(e.target.value)} disabled={!viewingSelf} />
          <Button variant="success" className="w-full" onClick={requestWithdrawal} disabled={!Number(wAmount) || !viewingSelf}>
            💸 Request Payout
          </Button>
          {withdrawals.slice(0, 3).map((w) => (
            <div key={w.id} className="flex items-center justify-between text-xs border-t border-slate-100 pt-2">
              <span>
                {inr(w.amount)} · {fmtDate(w.createdAt)}
              </span>
              <Badge
                className={cn(
                  w.status === "APPROVED"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : w.status === "REJECTED"
                      ? "bg-rose-50 text-rose-700 border-rose-200"
                      : "bg-amber-50 text-amber-700 border-amber-200"
                )}
              >
                {w.status}
              </Badge>
            </div>
          ))}
        </Card>
      </div>

      {/* Contact & qualification */}
      <Card className="p-4 space-y-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Contact & Qualification (KYC)</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input placeholder="Working Phone Number" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={!viewingSelf} />
          <Input placeholder="Alternative Phone Number" value={altPhone} onChange={(e) => setAltPhone(e.target.value)} disabled={!viewingSelf} />
          <Input placeholder="Parent / Guardian Phone Number" value={guardianPhone} onChange={(e) => setGuardianPhone(e.target.value)} disabled={!viewingSelf} />
          <Select value={qualification} onChange={(e) => setQualification(e.target.value)} disabled={!viewingSelf}>
            {QUALIFICATIONS.map((q) => (
              <option key={q} value={q}>
                {q}
              </option>
            ))}
          </Select>
        </div>
        {viewingSelf && (
          <Button variant="outline" size="sm" onClick={saveKycFields}>
            💾 Save Contact Details
          </Button>
        )}
      </Card>

      {/* KYC documents */}
      <Card className="p-4">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-3">KYC Documents</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {KYC_DOCS.map((d) => {
            const doc = docFor(d.kind);
            return (
              <div key={d.kind} className="rounded-xl border border-slate-200 p-3 text-center space-y-2">
                <p className="text-xs font-semibold text-slate-700">{d.label}</p>
                {doc ? (
                  <button
                    onClick={() => {
                      setPreview(doc);
                      setZoom(false);
                    }}
                    className="mx-auto block h-16 w-16 overflow-hidden rounded-lg border border-slate-200"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={doc.url} alt={d.label} className="h-full w-full object-cover" />
                  </button>
                ) : (
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-lg bg-slate-50 text-2xl">📄</div>
                )}
                {viewingSelf && (
                  <label className={cn("block cursor-pointer text-[11px] font-semibold hover:underline", doc?.status === "REJECTED" ? "text-rose-600" : "text-indigo-600")}>
                    {uploadingKind === d.kind ? "Uploading…" : doc?.status === "REJECTED" ? "🔁 Re-upload & Re-submit" : doc ? "Replace" : "Upload"}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadKyc(d.kind, e.target.files[0])} />
                  </label>
                )}
                {doc && (
                  <Badge
                    className={
                      doc.status === "APPROVED"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : doc.status === "REJECTED"
                          ? "bg-rose-50 text-rose-700 border-rose-200"
                          : "bg-amber-50 text-amber-700 border-amber-200"
                    }
                  >
                    {doc.status === "APPROVED" ? "✅ Approved" : doc.status === "REJECTED" ? "❌ Rejected" : "⏳ Pending review"}
                  </Badge>
                )}
                {doc?.status === "REJECTED" && doc.rejectionNote && (
                  <p className="text-[9px] text-rose-600 leading-tight">“{doc.rejectionNote}”</p>
                )}
                {isStaffViewer && !viewingSelf && doc && doc.status !== "APPROVED" && (
                  <div className="flex justify-center gap-1">
                    <button
                      onClick={() => kycDecision(doc.id, "approve")}
                      className="rounded-md border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 hover:bg-emerald-100"
                    >
                      ✓ Approve
                    </button>
                    <button
                      onClick={() => kycDecision(doc.id, "reject")}
                      className="rounded-md border border-rose-300 bg-rose-50 px-1.5 py-0.5 text-[9px] font-bold text-rose-700 hover:bg-rose-100"
                    >
                      ✕ Reject
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {/* Marksheets — up to 5 */}
        <div className="mt-4 border-t border-slate-100 pt-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-700">🎓 Marksheets ({marksheets.length}/5)</p>
            {viewingSelf && marksheets.length < 5 && (
              <label className="cursor-pointer text-[11px] font-semibold text-indigo-600 hover:underline">
                {uploadingKind === "kyc_marksheet" ? "Uploading…" : "＋ Upload Marksheet"}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadKyc("kyc_marksheet", e.target.files[0])} />
              </label>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {marksheets.map((m) => (
              <div key={m.id} className="text-center space-y-1">
                <button
                  onClick={() => {
                    setPreview(m);
                    setZoom(false);
                  }}
                  className={cn(
                    "h-16 w-16 overflow-hidden rounded-lg border-2",
                    m.status === "APPROVED" ? "border-emerald-400" : m.status === "REJECTED" ? "border-rose-400" : "border-amber-300"
                  )}
                  title={m.status === "REJECTED" ? `Rejected: ${m.rejectionNote ?? ""}` : m.status}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.url} alt="marksheet" className="h-full w-full object-cover" />
                </button>
                {isStaffViewer && !viewingSelf && m.status !== "APPROVED" ? (
                  <div className="flex justify-center gap-1">
                    <button onClick={() => kycDecision(m.id, "approve")} className="text-[9px] font-bold text-emerald-600">✓</button>
                    <button onClick={() => kycDecision(m.id, "reject")} className="text-[9px] font-bold text-rose-600">✕</button>
                  </div>
                ) : (
                  <p className="text-[8px] text-slate-400">{m.status === "APPROVED" ? "✅" : m.status === "REJECTED" ? "❌" : "⏳"}</p>
                )}
              </div>
            ))}
            {marksheets.length === 0 && <p className="text-xs text-slate-400">No marksheets uploaded yet.</p>}
          </div>
        </div>
      </Card>

      {/* Daily activity & performance log */}
      <Card className="p-4">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-3">
          📅 Daily Activity & Performance Log <span className="normal-case font-normal">(today: {fmtActive(todaySeconds)} active)</span>
        </p>
        {dailyLog.length === 0 ? (
          <p className="text-sm text-slate-400 py-3 text-center">No activity recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm min-w-[480px]">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] uppercase text-slate-400">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Active Time</th>
                  <th className="py-2 pr-3">Touched Leads</th>
                  <th className="py-2 pr-3">Status Changes</th>
                  <th className="py-2 text-right">Deals Closed</th>
                </tr>
              </thead>
              <tbody>
                {dailyLog.map((d) => (
                  <tr key={d.day} className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-medium">{d.day}</td>
                    <td className="py-2 pr-3 text-indigo-600 font-semibold">{fmtActive(d.activeSeconds)}</td>
                    <td className="py-2 pr-3">{d.touchedLeads}</td>
                    <td className="py-2 pr-3">{d.statusChanges}</td>
                    <td className="py-2 text-right font-bold text-emerald-600">{d.dealsClosed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Earnings breakdown — itemized commission vs bonus */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Earnings Breakdown — per closed deal</p>
          <div className="flex gap-2">
            <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">Commissions {inr(commissionTotal)}</Badge>
            <Badge className="bg-amber-50 text-amber-700 border-amber-200">Bonuses {inr(bonusTotal)}</Badge>
          </div>
        </div>
        {/* Applicable slab ladder */}
        {slabTiers.length > 0 && (
          <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
            {slabTiers.map((t, i) => (
              <div
                key={i}
                className={cn(
                  "shrink-0 rounded-lg border px-2.5 py-1.5 text-center",
                  i === currentTier ? "border-indigo-400 bg-indigo-50 ring-1 ring-indigo-300" : "border-slate-200 bg-slate-50"
                )}
              >
                <p className="text-[9px] font-semibold text-slate-500 whitespace-nowrap">{t.label}</p>
                <p className={cn("text-xs font-bold", i === currentTier ? "text-indigo-700" : "text-slate-700")}>
                  {inr(t.amount)}
                  {t.custom && <span className="ml-0.5 text-[8px] text-amber-600" title="Custom rate for this agent">★</span>}
                </p>
                {i === currentTier && <p className="text-[8px] font-bold text-indigo-500">YOUR TIER</p>}
              </div>
            ))}
          </div>
        )}
        {earnings.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">No approved deals yet. Close your first deal! 💪</p>
        ) : (
          <>
            <div className="sm:hidden space-y-2">
              {earnings.map((e) => (
                <div key={e.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold truncate">
                      {e.kind === "BONUS" ? "🎁 " : ""}
                      {e.businessName}
                    </p>
                    <p className="shrink-0 text-sm font-bold text-emerald-600">{inr(e.amount)}</p>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {e.kind === "BONUS" ? "Bonus" : e.leadName ?? "—"} · {fmtDate(e.approvedAt)}
                  </p>
                </div>
              ))}
            </div>
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] uppercase text-slate-400">
                    <th className="py-2 pr-3">Type</th>
                    <th className="py-2 pr-3">Lead Name</th>
                    <th className="py-2 pr-3">Business / Reason</th>
                    <th className="py-2 pr-3">Approval Date</th>
                    <th className="py-2 text-right">Amount</th>
                    <th className="py-2 pl-3">Status</th>
                    {isStaffViewer && <th className="py-2 pl-2 text-right">Manage</th>}
                  </tr>
                </thead>
                <tbody>
                  {earnings.map((e) => (
                    <tr key={e.id} className="border-b border-slate-100">
                      <td className="py-2 pr-3">
                        <Badge className={e.kind === "BONUS" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}>
                          {e.kind === "BONUS" ? "🎁 Bonus" : "💼 Commission"}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3">{e.leadName ?? "—"}</td>
                      <td className="py-2 pr-3 font-medium">{e.businessName}</td>
                      <td className="py-2 pr-3 text-slate-500">{fmtDate(e.approvedAt)}</td>
                      <td className="py-2 text-right font-bold text-emerald-600">{inr(e.amount)}</td>
                      <td className="py-2 pl-3">
                        <Badge
                          className={
                            e.status === "APPROVED"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-amber-50 text-amber-700 border-amber-200"
                          }
                        >
                          {e.status}
                        </Badge>
                      </td>
                      {isStaffViewer && (
                        <td className="py-2 pl-2 text-right whitespace-nowrap">
                          <button
                            title={e.status === "APPROVED" ? "Set Pending" : "Approve"}
                            className="rounded-md border border-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
                            onClick={async () => {
                              await fetch("/api/earnings", {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ id: e.id, status: e.status === "APPROVED" ? "PENDING" : "APPROVED" }),
                              });
                              load();
                            }}
                          >
                            {e.status === "APPROVED" ? "→ Pending" : "→ Approve"}
                          </button>
                          <button
                            title="Delete entry"
                            className="ml-1 rounded-md border border-rose-200 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600 hover:bg-rose-50"
                            onClick={async () => {
                              if (!window.confirm(`Delete this ${e.kind.toLowerCase()} entry of ${inr(e.amount)}?`)) return;
                              await fetch(`/api/earnings?id=${e.id}`, { method: "DELETE" });
                              load();
                            }}
                          >
                            ✕
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      {/* Digital ID Card */}
      <Modal open={showIdCard} onClose={() => setShowIdCard(false)} title="🪪 Digital Employee ID Card" maxWidth="max-w-md">
        <div id="id-card-print" className="mx-auto w-full max-w-sm">
          <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-lg">
            <div className="bg-gradient-to-r from-indigo-700 to-indigo-500 px-4 py-3 text-white">
              <p className="text-sm font-extrabold tracking-tight">🚀 Auto Growth Systems</p>
              <p className="text-[10px] text-indigo-200">Enterprise Telecalling CRM & HR</p>
            </div>
            <div className="bg-white p-4">
              <div className="flex items-center gap-4">
                {profile.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.avatarUrl} alt={profile.name} className="h-20 w-20 rounded-xl object-cover border-2 border-indigo-200" />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-indigo-600 text-2xl font-bold text-white">
                    {profile.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-base font-bold text-slate-900">{profile.name}</p>
                  <p className="text-xs font-semibold text-indigo-600">{profile.role === "AGENT" ? "Telecalling Agent" : profile.role}</p>
                  <p className="mt-1 font-mono text-[11px] text-slate-500">EMP-{String(profile.id).padStart(5, "0")}</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <p className="text-slate-400 uppercase text-[9px] font-bold">Email</p>
                  <p className="font-medium text-slate-700 truncate">{profile.email}</p>
                </div>
                <div>
                  <p className="text-slate-400 uppercase text-[9px] font-bold">Phone</p>
                  <p className="font-medium text-slate-700">{profile.phone ?? "—"}</p>
                </div>
                <div>
                  <p className="text-slate-400 uppercase text-[9px] font-bold">Qualification</p>
                  <p className="font-medium text-slate-700">{profile.qualification ?? "—"}</p>
                </div>
                <div>
                  <p className="text-slate-400 uppercase text-[9px] font-bold">Rank & Badges</p>
                  <p className="font-medium text-slate-700 truncate">
                    {rank > 0 ? `#${rank}` : "—"}
                    {badgeList.length ? ` · ${badgeList.join(", ")}` : ""}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-dashed border-slate-200 pt-3">
                <p className="text-[9px] text-slate-400">Valid while employed · Property of Auto Growth Systems</p>
                <div className="h-8 w-14 rounded bg-[repeating-linear-gradient(90deg,#1e293b_0_2px,transparent_2px_5px)]" title="barcode" />
              </div>
            </div>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <Button variant="primary" className="flex-1" onClick={() => window.print()}>
            🖨 Print / Save as PDF
          </Button>
          <Button variant="outline" onClick={() => setShowIdCard(false)}>
            Close
          </Button>
        </div>
      </Modal>

      {/* Preview modal */}
      <Modal open={!!preview} onClose={() => setPreview(null)} title={`Preview — ${preview?.fileName ?? preview?.kind ?? ""}`} maxWidth="max-w-2xl">
        {preview && (
          <div className="space-y-3">
            <div className="overflow-auto max-h-[65vh] rounded-lg border border-slate-200 bg-slate-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview.url}
                alt="doc"
                onClick={() => setZoom((z) => !z)}
                className={cn("mx-auto transition-transform", zoom ? "scale-[1.8] origin-top cursor-zoom-out" : "max-h-[60vh] object-contain cursor-zoom-in")}
              />
            </div>
            <Button variant="outline" size="sm" onClick={() => setZoom((z) => !z)}>
              {zoom ? "🔍 Zoom Out" : "🔍 Zoom In"}
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default function AgentProfilePage() {
  return (
    <Suspense fallback={<Spinner className="min-h-screen" />}>
      <Shell>
        <ProfilePage />
      </Shell>
    </Suspense>
  );
}
