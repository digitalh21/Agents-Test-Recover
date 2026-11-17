"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { Shell } from "@/components/shell";
import { Badge, Button, Card, Empty, Input, Select, Spinner, Textarea } from "@/components/ui";
import { fmtDate, relTime } from "@/lib/utils";

type Ack = { agentName: string; response: string | null; createdAt: string };
type BannerRow = {
  id: number;
  title: string;
  body: string;
  imageUrl: string | null;
  targetAgentId: number | null;
  targetName?: string;
  senderName?: string;
  requireAck: boolean;
  createdAt: string;
  acks?: Ack[];
  acked?: boolean;
  ackAt?: string | null;
  myResponse?: string | null;
};

function BannersPage() {
  const [rows, setRows] = useState<BannerRow[] | null>(null);
  const [isStaff, setIsStaff] = useState(false);
  const [agents, setAgents] = useState<{ id: number; name: string }[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [target, setTarget] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await fetch("/api/banners").then((r) => r.json());
    setRows(d.rows ?? []);
    setIsStaff(!!d.isStaff);
    if (d.isStaff) {
      const m = await fetch("/api/meta").then((r) => r.json());
      setAgents(m.agents ?? []);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function attach(file: File) {
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", "banner_image");
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const d = await res.json();
    if (res.ok) setImageUrl(d.url);
    setUploading(false);
  }

  async function send() {
    const res = await fetch("/api/banners", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body, imageUrl, targetAgentId: target || null }),
    });
    const d = await res.json();
    setMsg(res.ok ? `📢 Broadcast sent to ${target ? agents.find((a) => a.id === Number(target))?.name : "All Agents"} — agents must acknowledge.` : `❌ ${d.error}`);
    if (res.ok) {
      setTitle("");
      setBody("");
      setImageUrl(null);
      load();
    }
    setTimeout(() => setMsg(null), 4000);
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold">{isStaff ? "📢 Banners & Popups" : "📣 Announcements"}</h1>
        <p className="text-xs text-slate-500">
          {isStaff
            ? "Broadcast locking popups to all agents or a single agent. Agents must acknowledge before continuing."
            : "Broadcasts from management, with your acknowledgment timestamps."}
        </p>
      </div>

      {msg && <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-3 text-sm text-indigo-700">{msg}</div>}

      {isStaff && (
        <Card className="p-4 space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Create Broadcast (Text or Text + Image)</p>
          <Input placeholder="Title — e.g. 'New commission slabs from Monday 🎯'" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Textarea placeholder="Message body…" rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
          <div className="flex flex-col sm:flex-row gap-2">
            <Select value={target} onChange={(e) => setTarget(e.target.value)} className="sm:max-w-[220px]">
              <option value="">🎯 Target: All Agents</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  🎯 Target: {a.name} only
                </option>
              ))}
            </Select>
            <label className="flex-1 cursor-pointer rounded-lg border border-dashed border-slate-300 px-3 py-2.5 text-center text-xs text-slate-500 hover:border-indigo-400 hover:text-indigo-600">
              {uploading ? "Uploading…" : imageUrl ? "🖼 Image attached — replace?" : "🖼 Attach Image (optional)"}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && attach(e.target.files[0])} />
            </label>
            <Button variant="primary" onClick={send} disabled={!title.trim() || !body.trim()}>
              📢 Send Broadcast
            </Button>
          </div>
          {imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="banner" className="h-20 rounded-lg border border-slate-200 object-cover" />
          )}
        </Card>
      )}

      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Broadcast History</p>
      {rows === null ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <Empty icon="📢" text="No broadcasts yet." />
      ) : (
        <div className="space-y-2.5">
          {rows.map((b) => (
            <Card key={b.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold">{b.title}</p>
                  <p className="mt-0.5 text-xs text-slate-600">{b.body}</p>
                  <p className="mt-1 text-[10px] text-slate-400">
                    {isStaff ? `By ${b.senderName} → ${b.targetName} · ` : ""}
                    {fmtDate(b.createdAt)}
                  </p>
                </div>
                {!isStaff &&
                  (b.acked ? (
                    <Badge className="shrink-0 bg-emerald-50 text-emerald-700 border-emerald-200">✅ Acked {relTime(b.ackAt)}</Badge>
                  ) : (
                    <Badge className="shrink-0 bg-amber-50 text-amber-700 border-amber-200">⏳ Pending</Badge>
                  ))}
              </div>
              {b.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={b.imageUrl} alt="banner" className="mt-2 max-h-36 rounded-lg border border-slate-200 object-contain bg-slate-50" />
              )}
              {!isStaff && b.myResponse && (
                <p className="mt-2 rounded-lg bg-slate-50 border border-slate-200 p-2 text-xs text-slate-600">↩️ Your reply: “{b.myResponse}”</p>
              )}
              {isStaff && (
                <div className="mt-2 border-t border-slate-100 pt-2">
                  <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">
                    Agent responses ({b.acks?.length ?? 0})
                  </p>
                  {(b.acks ?? []).length === 0 ? (
                    <p className="text-xs text-amber-600">⏳ No acknowledgments yet</p>
                  ) : (
                    <div className="space-y-1">
                      {(b.acks ?? []).map((a, i) => (
                        <p key={i} className="text-xs text-slate-600">
                          ✅ <b>{a.agentName}</b> acknowledged {relTime(a.createdAt)}
                          {a.response ? <span className="text-slate-500"> — “{a.response}”</span> : ""}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<Spinner className="min-h-screen" />}>
      <Shell>
        <BannersPage />
      </Shell>
    </Suspense>
  );
}
