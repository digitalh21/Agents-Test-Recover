import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { appSettings, auditLogs } from "@/db/schema";
import { getSessionUser, isStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";

const ALLOWED_KEYS = ["show_history_to_agent"];

// GET — all app settings (staff)
export async function GET() {
  const user = await getSessionUser();
  if (!user || !isStaff(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const rows = await db.select().from(appSettings);
  const settings: Record<string, string> = { show_history_to_agent: "false" };
  for (const r of rows) settings[r.key] = r.value;
  return NextResponse.json({ settings });
}

// PUT { key, value } — Admin/HR/Manager single-click toggle
export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !isStaff(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { key, value } = await req.json();
  if (!ALLOWED_KEYS.includes(key)) return NextResponse.json({ error: "Unknown setting" }, { status: 400 });

  await db
    .insert(appSettings)
    .values({ key, value: String(value) })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: String(value) } });

  await db.insert(auditLogs).values({
    userId: user.id,
    action: "APP_SETTING_UPDATE",
    detail: `${key} → ${value}`,
  });
  return NextResponse.json({ ok: true });
}
