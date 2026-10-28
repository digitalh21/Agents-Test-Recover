import { eq } from "drizzle-orm";
import { db } from "@/db";
import { fieldPermissions } from "@/db/schema";
import { FIELD_KEYS, ROLES, type Visibility, type VisibilityMap } from "@/lib/fields";

/** Visibility map for a single role (defaults to VISIBLE). */
export async function getVisibilityMap(role: string): Promise<VisibilityMap> {
  const rows = await db.select().from(fieldPermissions).where(eq(fieldPermissions.role, role));
  const map: VisibilityMap = {};
  for (const key of FIELD_KEYS) map[key] = "VISIBLE";
  for (const r of rows) {
    if (map[r.fieldKey] !== undefined) map[r.fieldKey] = r.visibility as Visibility;
  }
  return map;
}

/** Full matrix for the Admin settings grid: { fieldKey: { role: visibility } } */
export async function getFullMatrix(): Promise<Record<string, Record<string, Visibility>>> {
  const rows = await db.select().from(fieldPermissions);
  const matrix: Record<string, Record<string, Visibility>> = {};
  for (const key of FIELD_KEYS) {
    matrix[key] = {};
    for (const role of ROLES) matrix[key][role] = "VISIBLE";
  }
  for (const r of rows) {
    if (matrix[r.fieldKey]) matrix[r.fieldKey][r.role] = r.visibility as Visibility;
  }
  return matrix;
}
