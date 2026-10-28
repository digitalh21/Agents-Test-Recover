"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { NotificationCenter } from "@/components/notification-center";
import { cn } from "@/lib/utils";

type Niche = { id: number; name: string; slug: string; icon: string };
type Me = { id: number; name: string; role: string };

// ─── Active-time tracker (Page Visibility API) ─────────────────────
function TimeTracker() {
  const [today, setToday] = useState(0);
  const bucket = useRef(0);

  useEffect(() => {
    fetch("/api/agent/track-time").then((r) => r.json()).then((d) => setToday(d.todaySeconds ?? 0));
    const tick = setInterval(() => {
      // Count ONLY when tab is focused / visible
      if (document.visibilityState === "visible") {
        bucket.current += 1;
        setToday((t) => t + 1);
      }
    }, 1000);
    const sync = setInterval(async () => {
      if (bucket.current > 0) {
        const seconds = bucket.current;
        bucket.current = 0;
        try {
          const d = await fetch("/api/agent/track-time", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ seconds }),
          }).then((r) => r.json());
          if (typeof d.todaySeconds === "number") setToday(d.todaySeconds);
        } catch {
          bucket.current += seconds;
        }
      }
    }, 60_000); // sync every 60 seconds
    return () => {
      clearInterval(tick);
      clearInterval(sync);
    };
  }, []);

  const h = Math.floor(today / 3600);
  const m = Math.floor((today % 3600) / 60);
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-[11px] font-semibold text-emerald-700"
      title="Active time — tracked only while this tab is visible"
    >
      ⏱ {h}h {m}m active
    </span>
  );
}

// ─── Push notification poller (browser Notification API) ──────────
// Native browser pushes only — all in-app alerts live in the Notification Center modal.
function NotificationPoller() {
  const sinceId = useRef(0);

  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
    let first = true;
    const poll = async () => {
      try {
        const d = await fetch(`/api/notifications?sinceId=${sinceId.current}`).then((r) => r.json());
        if (d.latestId) {
          if (!first) {
            for (const n of d.rows ?? []) {
              if (typeof Notification !== "undefined" && Notification.permission === "granted") {
                new Notification(n.title, { body: n.body });
              }
            }
          }
          sinceId.current = d.latestId;
        }
        first = false;
      } catch {}
    };
    poll();
    const t = setInterval(poll, 15_000);
    return () => clearInterval(t);
  }, []);

  return null;
}

// ─── Automated management-decision popup (agents only) ─────────────
function DecisionPopup() {
  const [queue, setQueue] = useState<{ id: number; kind: string; title: string; body: string; decision: string | null; createdAt: string }[]>([]);

  const check = useCallback(async () => {
    try {
      const d = await fetch("/api/alerts?unread=1").then((r) => r.json());
      setQueue(d.rows ?? []);
    } catch {}
  }, []);

  useEffect(() => {
    check();
    const t = setInterval(check, 20000);
    return () => clearInterval(t);
  }, [check]);

  async function dismiss() {
    const ids = queue.map((q) => q.id);
    setQueue([]);
    await fetch("/api/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
  }

  if (queue.length === 0) return null;
  const first = queue[0];
  const rejected = first.decision === "REJECTED";
  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
        <p className={cn("text-[10px] font-bold uppercase tracking-widest", rejected ? "text-rose-500" : "text-emerald-600")}>
          {rejected ? "⚠️ Management decision — action may be needed" : "📬 Management responded to your request"}
        </p>
        <h2 className="mt-2 text-lg font-bold text-slate-900">{first.title}</h2>
        <p className="mt-2 text-sm text-slate-600 whitespace-pre-wrap">{first.body}</p>
        {queue.length > 1 && (
          <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 max-h-40 overflow-y-auto">
            {queue.slice(1).map((q) => (
              <div key={q.id} className="rounded-lg bg-slate-50 border border-slate-200 p-2.5">
                <p className="text-xs font-bold text-slate-800">{q.title}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{q.body}</p>
              </div>
            ))}
          </div>
        )}
        <button
          onClick={dismiss}
          className="mt-4 w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          ✅ Got it{queue.length > 1 ? ` (${queue.length} updates)` : ""}
        </button>
      </div>
    </div>
  );
}

// ─── Avatar menu with logout (all screens) ─────────────────────────
function AvatarMenu({ me, onLogout }: { me: Me | null; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  if (!me) return null;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white ring-2 ring-indigo-400/30 hover:ring-indigo-400/60"
        aria-label="Profile menu"
      >
        {me.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 z-50 w-48 rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl">
            <div className="px-2.5 py-2 border-b border-slate-100">
              <p className="text-sm font-bold text-slate-900 truncate">{me.name}</p>
              <p className="text-[10px] text-slate-400">{me.role}</p>
            </div>
            <Link
              href="/agent/profile"
              onClick={() => setOpen(false)}
              className="block rounded-lg px-2.5 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              👤 My Profile
            </Link>
            <button
              onClick={onLogout}
              className="w-full text-left rounded-lg px-2.5 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50"
            >
              🚪 Logout
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── App Shell ─────────────────────────────────────────────────────
export function Shell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const niche = params.get("niche") ?? "all";
  const [me, setMe] = useState<Me | null>(null);
  const [niches, setNiches] = useState<Niche[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    fetch("/api/meta")
      .then((r) => (r.status === 401 ? Promise.reject() : r.json()))
      .then((d) => {
        setMe(d.me);
        setNiches(d.niches ?? []);
      })
      .catch(() => router.push("/login"));
  }, [router]);

  const setNiche = useCallback(
    (slug: string) => {
      // Clicking a niche always navigates to the Leads page with that category filter
      const leadsPage = me?.role === "AGENT" ? "/agent" : "/admin";
      const sp = new URLSearchParams(params.toString());
      if (slug === "all") sp.delete("niche");
      else sp.set("niche", slug);
      sp.delete("page");
      const qs = sp.toString();
      router.push(qs ? `${leadsPage}?${qs}` : leadsPage);
      setMenuOpen(false);
    },
    [params, me, router]
  );

  const isAgent = me?.role === "AGENT";
  const withNiche = (href: string) => (niche !== "all" ? `${href}?niche=${niche}` : href);

  const staffNav = [
    { href: "/admin", label: "Leads Pipeline", short: "Leads", icon: "📊" },
    { href: "/admin/approvals", label: "Approvals Center", short: "Approvals", icon: "✅" },
    { href: "/admin/errors", label: "Lead Errors", short: "Errors", icon: "🚩" },
    { href: "/tickets", label: "Help Desk Tickets", short: "Tickets", icon: "🎫" },
    { href: "/banners", label: "Banners & Popups", short: "Banners", icon: "📢" },
    { href: "/admin/audit", label: "Audit Trail", short: "Audit", icon: "🧾" },
    { href: "/admin/settings", label: "Settings", short: "Settings", icon: "⚙️" },
    { href: "/agent/profile", label: "My Profile", short: "Profile", icon: "👤" },
  ];
  const agentNav = [
    { href: "/agent", label: "My Leads", short: "My Leads", icon: "📋" },
    { href: "/tickets", label: "Complaints / Requests", short: "Tickets", icon: "🎫" },
    { href: "/banners", label: "Announcements", short: "Alerts", icon: "📣" },
    { href: "/agent/profile", label: "Profile & Earnings", short: "Profile", icon: "👤" },
  ];
  const nav = isAgent ? agentNav : staffNav;

  async function logout() {
    await fetch("/api/auth", { method: "DELETE" });
    router.push("/login");
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-slate-800">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-lg shadow-lg shadow-indigo-900/40">🚀</div>
        <div>
          <p className="text-sm font-extrabold tracking-tight text-white leading-tight">
            Auto Growth <span className="text-indigo-400">Systems</span>
          </p>
          <p className="text-[10px] text-slate-400">{me?.role ?? "…"} console</p>
        </div>
      </div>

      <nav className="px-3 py-3 space-y-1">
        {nav.map((n) => (
          <Link
            key={n.href}
            href={withNiche(n.href)}
            onClick={() => setMenuOpen(false)}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium",
              pathname === n.href ? "bg-indigo-600 text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white"
            )}
          >
            <span>{n.icon}</span> {n.label}
          </Link>
        ))}
      </nav>

      <div className="px-3 pt-2 flex-1 overflow-y-auto">
        <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">Niches</p>
        <button
          onClick={() => setNiche("all")}
          className={cn(
            "w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm",
            niche === "all" ? "bg-slate-800 text-white font-semibold" : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
          )}
        >
          🗂 All Niches
        </button>
        {niches.map((n) => (
          <button
            key={n.id}
            onClick={() => setNiche(n.slug)}
            className={cn(
              "w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm",
              niche === n.slug ? "bg-slate-800 text-white font-semibold" : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
            )}
          >
            <span>{n.icon}</span> {n.name}
          </button>
        ))}
      </div>

      <div className="border-t border-slate-800 p-3 space-y-2">
        <div className="flex items-center gap-2.5 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
            {me ? me.name.split(" ").map((p) => p[0]).slice(0, 2).join("") : "…"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{me?.name ?? "Loading…"}</p>
            <p className="text-[10px] text-slate-400">{me?.role}</p>
          </div>
        </div>
        {/* Prominent logout at the bottom of the sidebar */}
        <button
          onClick={logout}
          className="w-full flex items-center justify-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-300 hover:bg-rose-500/20 hover:text-rose-200"
        >
          🚪 Logout
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden lg:block fixed inset-y-0 left-0 w-64 bg-slate-950 z-30">{sidebar}</aside>

      {/* Mobile top bar */}
      <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between gap-2 bg-slate-950 px-3 py-2.5">
        <button onClick={() => setMenuOpen(true)} className="text-white text-xl px-1" aria-label="Menu">
          ☰
        </button>
        <p className="text-[13px] font-extrabold tracking-tight text-white truncate">
          🚀 Auto Growth <span className="text-indigo-400">Systems</span>
        </p>
        <div className="flex items-center gap-1.5">
          {isAgent && <TimeTracker />}
          <NotificationCenter />
          <AvatarMenu me={me} onLogout={logout} />
        </div>
      </header>

      {menuOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => setMenuOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-slate-950">{sidebar}</aside>
        </div>
      )}

      <main className="lg:pl-64 pb-24 lg:pb-8">
        {/* Desktop header strip */}
        <div className="hidden lg:flex items-center justify-between border-b border-slate-200 bg-white px-6 py-2.5">
          <p className="text-sm text-slate-500">
            <span className="font-extrabold text-slate-900 mr-3">🚀 Auto Growth <span className="text-indigo-600">Systems</span></span>
            Niche: <span className="font-semibold text-slate-900">{niche === "all" ? "All Niches" : niches.find((n) => n.slug === niche)?.name ?? niche}</span>
          </p>
          <div className="flex items-center gap-2.5">
            {isAgent && <TimeTracker />}
            <NotificationCenter />
            <AvatarMenu me={me} onLogout={logout} />
          </div>
        </div>
        <div className="p-4 sm:p-6">{children}</div>
      </main>

      {/* Mobile bottom nav — all roles (staff limited to 5 key tabs) */}
      {me && (
        <nav
          className="lg:hidden fixed bottom-0 inset-x-0 z-30 grid border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]"
          style={{ gridTemplateColumns: `repeat(${Math.min(nav.length, 5)}, minmax(0, 1fr))` }}
        >
          {(isAgent
            ? nav
            : nav.filter((n) => ["/admin", "/admin/approvals", "/admin/errors", "/tickets", "/agent/profile"].includes(n.href))
          ).map((n) => (
            <Link
              key={n.href}
              href={withNiche(n.href)}
              className={cn(
                "flex flex-col items-center gap-0.5 py-2 text-[10px] font-semibold",
                pathname === n.href ? "text-indigo-600" : "text-slate-400"
              )}
            >
              <span className="text-lg leading-none">{n.icon}</span>
              <span className="truncate max-w-full px-0.5">{n.short}</span>
            </Link>
          ))}
        </nav>
      )}

      {isAgent && <DecisionPopup />}
      <NotificationPoller />
    </div>
  );
}
