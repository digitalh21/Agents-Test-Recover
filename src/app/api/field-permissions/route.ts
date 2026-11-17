import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { auditLogs, fieldPermissions } from "@/db/schema";
import { getSessionUser, isStaff } from "@/lib/auth";
import { getFullMatrix } from "@/lib/field-visibility";
import { FIELD_KEYS, ROLES, VISIBILITY_OPTIONS, type FieldKey, type Visibility } from "@/lib/fields";

export const dynamic = "force-dynamic";

// GET — full 14-field × 4-role visibility matrix (staff view, admin edit)
export async function GET() {
  const user = await getSessionUser();
  if (!user || !isStaff(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const matrix = await getFullMatrix();
  return NextResponse.json({ matrix, canEdit: user.role === "ADMIN" });
}

// PUT { matrix: { fieldKey: { ROLE: "VISIBLE"|"MASKED"|"HIDDEN" } } } — ADMIN only
export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Only ADMIN can modify field visibility rules" }, { status: 403 });
  }
  const { matrix } = await req.json();
  if (!matrix || typeof matrix !== "object") {
    return NextResponse.json({ error: "Invalid matrix payload" }, { status: 400 });
  }

  let changed = 0;
  for (const fieldKey of FIELD_KEYS) {
    const roleMap = matrix[fieldKey];
    if (!roleMap) continue;
    for (const role of ROLES) {
      const vis = roleMap[role] as Visibility | undefined;
      if (!vis || !VISIBILITY_OPTIONS.includes(vis)) continue;
      await db
        .insert(fieldPermissions)
        .values({ fieldKey: fieldKey as FieldKey, role, visibility: vis })
        .onConflictDoUpdate({
          target: [fieldPermissions.fieldKey, fieldPermissions.role],
          set: { visibility: vis },
        });
      changed++;
    }
  }

  await db.insert(auditLogs).values({
    userId: user.id,
    action: "FIELD_VISIBILITY_UPDATE",
    detail: `Admin updated role field visibility matrix (${changed} field×role rules saved)`,
  });

  const fresh = await getFullMatrix();
  return NextResponse.json({ ok: true, changed, matrix: fresh });
}
