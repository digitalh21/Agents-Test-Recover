"use client";

import { Suspense, useEffect, useState } from "react";
import { Shell } from "@/components/shell";
import { Badge, Button, Card, Input, NumberInput, Select, Spinner } from "@/components/ui";
import { FIELD_DEFS, ROLES, VISIBILITY_OPTIONS, type Visibility } from "@/lib/fields";
import { cn } from "@/lib/utils";

type Matrix = Record<string, Record<string, Visibility>>;
type NicheRow = { id: number; name: string; slug: string; icon: string; leadCount: number; visibleToAgents: boolean };
type Slab = { id: number; minCloses: number; maxCloses: number | null; amount: number };
type AgentRow = { id: number; name: string };

// ─── Niche Management: Show Niches + Add New Niche ────────────────
function NicheManager() {
  const [rows, setRows] = useState<NicheRow[] | null>(null);
  const [showList, setShowList] = useState(true);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("📁");
  const [msg, setMsg] = useState<string | null>(null);

  const load = () => fetch("/api/niches").then((r) => r.json()).then((d) => setRows(d.rows ?? []));
  useEffect(() => {
    load();
  }, []);

  async function add() {
    const res = await fetch("/api/niches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, icon }),
    });
    const d = await res.json();
    setMsg(res.ok ? `✅ Niche "${d.row.name}" added — now in sidebar & dropdowns` : `❌ ${d.error}`);
    if (res.ok) {
      setName("");
      load();
    }
    setTimeout(() => setMsg(null), 3500);
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-slate-800">🗂 Niche & Category Management</p>
        <Button variant="outline" size="sm" onClick={() => setShowList((s) => !s)}>
          {showList ? "Hide Niches" : "Show Niches"}
        </Button>
      </div>
      {msg && <p className="text-xs font-semibold text-indigo-700">{msg}</p>}
      {showList &&
        (rows === null ? (
          <Spinner />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {rows.map((n) => (
              <div key={n.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 p-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">
                    {n.icon} {n.name}
                  </p>
                  <p className="text-[10px] text-slate-400">{n.leadCount.toLocaleString()} leads</p>
                </div>
                <button
                  title={n.visibleToAgents ? "Click to hide from agents" : "Click to make visible to agents"}
                  onClick={async () => {
                    await fetch("/api/niches", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ id: n.id, visibleToAgents: !n.visibleToAgents }),
                    });
                    setMsg(
                      n.visibleToAgents
                        ? `🙈 "${n.name}" hidden from agents — removed from their sidebar & workspace`
                        : `👁 "${n.name}" now visible to agents`
                    );
                    setTimeout(() => setMsg(null), 3500);
                    load();
                  }}
                  className={cn(
                    "shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold transition-colors",
                    n.visibleToAgents
                      ? "bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100"
                      : "bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100"
                  )}
                >
                  {n.visibleToAgents ? "👁 Visible to Agents" : "🙈 Hidden from Agents"}
                </button>
              </div>
            ))}
          </div>
        ))}
      <div className="flex flex-col sm:flex-row gap-2 border-t border-slate-100 pt-3">
        <Input className="sm:w-20 text-center" value={icon} onChange={(e) => setIcon(e.target.value)} aria-label="Icon emoji" />
        <Input placeholder="New niche name — e.g. 'Salons & Spas'" value={name} onChange={(e) => setName(e.target.value)} />
        <Button variant="primary" onClick={add} disabled={!name.trim()}>
          ＋ Add New Niche
        </Button>
      </div>
    </Card>
  );
}

// ─── Tiered commission slabs + bonus sender ───────────────────────
function CommissionManager() {
  const [slabs, setSlabs] = useState<Slab[] | null>(null);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [bonusAgent, setBonusAgent] = useState("");
  const [bonusAmount, setBonusAmount] = useState("");
  const [bonusNote, setBonusNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/commission").then((r) => r.json()).then((d) => setSlabs(d.slabs ?? []));
    fetch("/api/meta").then((r) => r.json()).then((d) => {
      setAgents(d.agents ?? []);
      if (d.agents?.length) setBonusAgent(String(d.agents[0].id));
    });
  }, []);

  async function saveSlabs() {
    if (!slabs) return;
    const res = await fetch("/api/commission", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slabs: slabs.map((s) => ({ id: s.id, amount: s.amount })) }),
    });
    setMsg(res.ok ? "✅ Slab rates saved — applied to the next deal close" : "❌ Save failed");
    setTimeout(() => setMsg(null), 3000);
  }

  async function sendBonus() {
    const res = await fetch("/api/commission", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId: Number(bonusAgent), amount: Number(bonusAmount), note: bonusNote }),
    });
    const d = await res.json();
    setMsg(res.ok ? `🎁 Bonus sent! Agent now has ${d.closes} closes on record.` : `❌ ${d.error}`);
    if (res.ok) {
      setBonusAmount("");
      setBonusNote("");
    }
    setTimeout(() => setMsg(null), 3500);
  }

  const slabLabel = (s: Slab) => (s.maxCloses === null ? `${s.minCloses}+ Closes` : `${s.minCloses}–${s.maxCloses} Closes`);

  return (
    <Card className="p-4 space-y-4">
      <p className="text-sm font-bold text-slate-800">💰 Tiered Commission Slabs & Bonuses</p>
      {msg && <p className="text-xs font-semibold text-indigo-700">{msg}</p>}
      {slabs === null ? (
        <Spinner />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {slabs.map((s, i) => (
            <div key={s.id} className="rounded-xl border border-slate-200 p-3">
              <p className="text-[11px] font-bold text-slate-500">{slabLabel(s)}</p>
              <div className="mt-1.5 flex items-center gap-1">
                <span className="text-sm font-bold text-slate-400">₹</span>
                <NumberInput
                  className="h-8 text-sm"
                  value={s.amount}
                  onChange={(e) => {
                    const next = [...slabs];
                    next[i] = { ...s, amount: Number(e.target.value) || 0 };
                    setSlabs(next);
                  }}
                />
              </div>
              <p className="mt-1 text-[10px] text-slate-400">per close</p>
            </div>
          ))}
        </div>
      )}
      <Button variant="primary" size="sm" onClick={saveSlabs}>
        💾 Save Slab Rates
      </Button>
      <div className="border-t border-slate-100 pt-3 space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">🎁 Send Custom Bonus</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Select value={bonusAgent} onChange={(e) => setBonusAgent(e.target.value)} className="sm:max-w-[180px]">
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
          <NumberInput placeholder="Amount (₹)" value={bonusAmount} onChange={(e) => setBonusAmount(e.target.value)} className="sm:max-w-[140px]" />
          <Input placeholder="Reason — e.g. 'Best caller of the week 🏆'" value={bonusNote} onChange={(e) => setBonusNote(e.target.value)} />
          <Button variant="success" onClick={sendBonus} disabled={!Number(bonusAmount)}>
            Send Bonus
          </Button>
        </div>
      </div>
    </Card>
  );
}

const VIS_STYLE: Record<Visibility, string> = {
  VISIBLE: "bg-emerald-50 text-emerald-700 border-emerald-300",
  MASKED: "bg-amber-50 text-amber-700 border-amber-300",
  HIDDEN: "bg-rose-50 text-rose-700 border-rose-300",
};
const VIS_ICON: Record<Visibility, string> = { VISIBLE: "👁", MASKED: "🎭", HIDDEN: "🚫" };

const ROLE_STYLE: Record<string, string> = {
  ADMIN: "bg-rose-50 text-rose-700 border-rose-200",
  HR: "bg-violet-50 text-violet-700 border-violet-200",
  MANAGER: "bg-amber-50 text-amber-700 border-amber-200",
  AGENT: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

function FieldVisibilitySettings() {
  const [matrix, setMatrix] = useState<Matrix | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/field-permissions")
      .then((r) => r.json())
      .then((d) => {
        setMatrix(d.matrix ?? null);
        setCanEdit(!!d.canEdit);
      });
    fetch("/api/app-settings")
      .then((r) => r.json())
      .then((d) => setShowHistory(d.settings?.show_history_to_agent === "true"));
  }, []);

  async function toggleHistory() {
    const next = !showHistory;
    setShowHistory(next);
    await fetch("/api/app-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "show_history_to_agent", value: String(next) }),
    });
    setMsg(next ? "✅ Agents can now see anonymized past call-note history." : "🔐 Past history is now hidden from agents — they can request access per lead.");
    setTimeout(() => setMsg(null), 4000);
  }

  function cycle(field: string, role: string) {
    if (!canEdit || !matrix) return;
    const current = matrix[field][role];
    const next = VISIBILITY_OPTIONS[(VISIBILITY_OPTIONS.indexOf(current) + 1) % VISIBILITY_OPTIONS.length];
    setMatrix({ ...matrix, [field]: { ...matrix[field], [role]: next } });
    setDirty(true);
  }

  function setAllForRole(role: string, vis: Visibility) {
    if (!canEdit || !matrix) return;
    const m: Matrix = { ...matrix };
    for (const f of FIELD_DEFS) m[f.key] = { ...m[f.key], [role]: vis };
    setMatrix(m);
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    const res = await fetch("/api/field-permissions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matrix }),
    });
    const d = await res.json();
    if (res.ok) {
      setMatrix(d.matrix);
      setDirty(false);
      setMsg(`✅ Saved ${d.changed} field×role visibility rules. Applied instantly across all dashboards.`);
    } else {
      setMsg(`❌ ${d.error}`);
    }
    setSaving(false);
    setTimeout(() => setMsg(null), 4000);
  }

  if (!matrix) return <Spinner />;

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Settings — Role Field Visibility</h1>
          <p className="text-xs text-slate-500">
            Dynamic RBAC engine · 14 lead fields × 4 roles · enforced server-side on every API response
          </p>
        </div>
        {canEdit ? (
          <Button variant="primary" onClick={save} disabled={!dirty || saving}>
            {saving ? "Saving…" : dirty ? "💾 Save Visibility Rules" : "✓ All Saved"}
          </Button>
        ) : (
          <Badge className="bg-amber-50 text-amber-700 border-amber-200">👁 Read-only — only ADMIN can edit</Badge>
        )}
      </div>

      {msg && <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-3 text-sm text-indigo-700">{msg}</div>}

      {/* ── Agent audit-history visibility toggle ── */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-800">🕵️ Agent Audit History Access</p>
            <p className="text-xs text-slate-500 mt-0.5">
              When hidden, agents see “Audit history · previous agents (anonymous)” and can request per-lead access.
            </p>
          </div>
          {showHistory === null ? (
            <span className="text-xs text-slate-400">Loading…</span>
          ) : (
            <button
              onClick={toggleHistory}
              className={cn(
                "relative inline-flex h-8 w-44 items-center rounded-full border text-[11px] font-bold transition-colors",
                showHistory
                  ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                  : "bg-rose-50 border-rose-300 text-rose-700"
              )}
            >
              <span className="w-full text-center">
                {showHistory ? "👁 Show History to Agent" : "🔐 Hide History to Agent"}
              </span>
            </button>
          )}
        </div>
      </Card>

      <NicheManager />
      <CommissionManager />

      <Card className="p-3 sm:p-4">
        <div className="flex flex-wrap gap-3 text-[11px] text-slate-500 mb-3">
          <span className="inline-flex items-center gap-1"><span className={cn("rounded border px-1.5 py-0.5 font-semibold", VIS_STYLE.VISIBLE)}>👁 Visible</span> full value shown</span>
          <span className="inline-flex items-center gap-1"><span className={cn("rounded border px-1.5 py-0.5 font-semibold", VIS_STYLE.MASKED)}>🎭 Masked</span> partial e.g. 97******54</span>
          <span className="inline-flex items-center gap-1"><span className={cn("rounded border px-1.5 py-0.5 font-semibold", VIS_STYLE.HIDDEN)}>🚫 Hidden</span> not rendered at all</span>
          {canEdit && <span className="ml-auto italic">Tap any cell to cycle Visible → Masked → Hidden</span>}
        </div>

        <div className="overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0">
          <table className="w-full min-w-[640px] text-left text-sm border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="sticky left-0 bg-white py-2 pr-3 text-[11px] uppercase text-slate-400 min-w-[200px]">
                  Lead Field (14)
                </th>
                {ROLES.map((role) => (
                  <th key={role} className="px-2 py-2 text-center">
                    <Badge className={ROLE_STYLE[role]}>{role === "AGENT" ? "TELECALLER" : role}</Badge>
                    {canEdit && (
                      <div className="mt-1 flex justify-center gap-1">
                        {VISIBILITY_OPTIONS.map((v) => (
                          <button
                            key={v}
                            title={`Set all → ${v}`}
                            onClick={() => setAllForRole(role, v)}
                            className="rounded px-1 text-[10px] text-slate-400 hover:bg-slate-100"
                          >
                            {VIS_ICON[v]}
                          </button>
                        ))}
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FIELD_DEFS.map((f, i) => (
                <tr key={f.key} className={i % 2 ? "bg-slate-50/60" : ""}>
                  <td className="sticky left-0 bg-inherit py-2 pr-3 border-t border-slate-100">
                    <p className="font-semibold text-slate-800 text-xs sm:text-sm">
                      {f.icon} {f.label}
                    </p>
                    <p className="text-[10px] font-mono text-slate-400">{f.hint}</p>
                  </td>
                  {ROLES.map((role) => {
                    const vis = matrix[f.key][role];
                    return (
                      <td key={role} className="px-2 py-2 text-center border-t border-slate-100">
                        <button
                          onClick={() => cycle(f.key, role)}
                          disabled={!canEdit}
                          className={cn(
                            "w-full max-w-[110px] rounded-lg border px-2 py-1.5 text-[11px] font-bold transition-colors",
                            VIS_STYLE[vis],
                            canEdit && "hover:ring-2 hover:ring-indigo-300 cursor-pointer"
                          )}
                        >
                          {VIS_ICON[vis]} {vis}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4 text-xs text-slate-500 space-y-1">
        <p className="font-semibold text-slate-700">How enforcement works</p>
        <p>• Rules are applied <b>server-side</b> in every leads API response — hidden fields never leave the server; masked fields are partially redacted before transmission.</p>
        <p>• Example: set <b>phone → MASKED</b> for TELECALLER to show <code className="bg-slate-100 px-1 rounded">97******54</code>, while ADMIN/HR keep full visibility.</p>
        <p>• Example: set <b>service_status</b> or <b>opens_at → HIDDEN</b> for TELECALLER and it disappears from their Lead Action Modal entirely.</p>
        <p>• Lead lock (🔒 unapproved access) still force-masks phone for agents regardless of these rules. Agents retain <b>zero delete permissions</b>.</p>
      </Card>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<Spinner className="min-h-screen" />}>
      <Shell>
        <FieldVisibilitySettings />
      </Shell>
    </Suspense>
  );
}
