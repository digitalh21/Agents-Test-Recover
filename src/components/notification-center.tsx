"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Spinner } from "@/components/ui";
import { cn, relTime } from "@/lib/utils";

type Alert = {
  id: string;
  kind: "push" | "broadcast";
  title: string;
  body: string;
  imageUrl?: string | null;
  acked?: boolean;
  createdAt: string;
};

// Interactive Notification Center — bell icon opens a full popup modal with
// recent alerts, broadcast messages, system updates and task reminders.
export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [unseen, setUnseen] = useState(0);
  const lastSeenId = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [pushes, banners] = await Promise.all([
        fetch("/api/notifications?sinceId=0").then((r) => r.json()),
        fetch("/api/banners").then((r) => r.json()),
      ]);
      const list: Alert[] = [
        ...(pushes.rows ?? []).map((n: { id: number; title: string; body: string; createdAt: string }) => ({
          id: `push-${n.id}`,
          kind: "push" as const,
          title: n.title,
          body: n.body,
          createdAt: n.createdAt,
        })),
        ...(banners.rows ?? []).map(
          (b: { id: number; title: string; body: string; imageUrl: string | null; acked?: boolean; createdAt: string }) => ({
            id: `bc-${b.id}`,
            kind: "broadcast" as const,
            title: b.title,
            body: b.body,
            imageUrl: b.imageUrl,
            acked: b.acked,
            createdAt: b.createdAt,
          })
        ),
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setAlerts(list.slice(0, 30));

      const stored = localStorage.getItem("notif_last_seen");
      lastSeenId.current = stored;
      const newer = stored ? list.filter((a) => a.id !== stored && new Date(a.createdAt).getTime() > Number(localStorage.getItem("notif_last_seen_ts") ?? 0)) : list;
      setUnseen(Math.min(9, newer.length));
    } catch {}
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  function openCenter() {
    setOpen(true);
    setUnseen(0);
    localStorage.setItem("notif_last_seen_ts", String(Date.now()));
    if (alerts?.[0]) localStorage.setItem("notif_last_seen", alerts[0].id);
  }

  return (
    <>
      <button
        onClick={openCenter}
        className="relative flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-base text-white hover:bg-slate-700"
        aria-label="Notifications"
        title="Notification Center"
      >
        🔔
        {unseen > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white">
            {unseen}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative w-full sm:max-w-md max-h-[85vh] rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <p className="font-bold text-slate-900">🔔 Notification Center</p>
                <p className="text-[10px] text-slate-400">Alerts · broadcasts · system updates · task reminders</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-rose-100 hover:text-rose-600 font-bold"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {alerts === null ? (
                <Spinner />
              ) : alerts.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-400">No notifications yet. All caught up! ✨</p>
              ) : (
                alerts.map((a) => (
                  <div key={a.id} className="rounded-xl border border-slate-200 p-3 hover:border-indigo-200 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">
                        {a.kind === "broadcast" ? "📢" : "🔔"} {a.title}
                      </p>
                      <span className="shrink-0 text-[9px] text-slate-400">{relTime(a.createdAt)}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600 whitespace-pre-wrap">{a.body}</p>
                    {a.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.imageUrl} alt="" className="mt-2 max-h-28 rounded-lg border border-slate-200 object-contain bg-slate-50" />
                    )}
                    <div className="mt-1.5 flex gap-1.5">
                      <Badge
                        className={cn(
                          a.kind === "broadcast"
                            ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                            : "bg-slate-100 text-slate-600 border-slate-200"
                        )}
                      >
                        {a.kind === "broadcast" ? "Broadcast" : "System Alert"}
                      </Badge>
                      {a.kind === "broadcast" && a.acked !== undefined && (
                        <Badge
                          className={cn(
                            a.acked
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-amber-50 text-amber-700 border-amber-200"
                          )}
                        >
                          {a.acked ? "✅ Acknowledged" : "⏳ Response pending"}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
