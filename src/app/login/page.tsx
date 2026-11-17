"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Badge, Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";

type DirUser = { id: string; name: string; email: string; role: string; online: boolean };

const roleStyle: Record<string, string> = {
  ADMIN: "bg-rose-50 text-rose-700 border-rose-200",
  HR: "bg-violet-50 text-violet-700 border-violet-200",
  MANAGER: "bg-amber-50 text-amber-700 border-amber-200",
  AGENT: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

export default function LoginPage() {
  const router = useRouter();
  const [directory, setDirectory] = useState<DirUser[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then((d) => setDirectory(d.directory ?? []))
      .catch(() => setDirectory([]));
  }, []);

  async function login(id: string) {
    setBusy(id);
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: id }),
    });
    const d = await res.json();
    if (d.user) router.push(d.user.role === "AGENT" ? "/agent" : "/admin");
    else setBusy(null);
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-7">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-3xl shadow-xl shadow-indigo-900/50">
            🚀
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            Auto Growth <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">Systems</span>
          </h1>
          <p className="mt-2 text-sm font-medium text-indigo-200">Enterprise Telecalling CRM & HR Management</p>
          <div className="mx-auto mt-3 h-1 w-16 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500" />
        </div>
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
            Sign in as (RBAC demo accounts)
          </p>
          {!directory ? (
            <Spinner />
          ) : (
            <div className="space-y-2">
              {directory.map((u) => (
                <button
                  key={u.id}
                  onClick={() => login(u.id)}
                  disabled={busy !== null}
                  className="w-full flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-left hover:border-indigo-400 hover:bg-indigo-50/50 transition-colors disabled:opacity-60"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white text-sm font-bold">
                    {u.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900 truncate">{u.name}</p>
                    <p className="text-xs text-slate-500 truncate">{u.email}</p>
                  </div>
                  <Badge className={cn(roleStyle[u.role] ?? roleStyle.AGENT)}>{u.role}</Badge>
                  {busy === u.id && (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
                  )}
                </button>
              ))}
              {directory.length === 0 && (
                <p className="text-sm text-slate-500 py-4 text-center">No users seeded yet. Run the seed script.</p>
              )}
            </div>
          )}
        </Card>
        <p className="mt-4 text-center text-xs text-indigo-300/70">
          Mobile-first for Telecallers · Desktop-optimized for Admin, HR & Managers
        </p>
      </div>
    </main>
  );
}
