import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { auditLogs, uploads } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { uploadToStorage } from "@/lib/storage";

export const dynamic = "force-dynamic";

const FOLDER_BY_KIND: Record<string, string> = {
  proof: "proofs",
  ticket_proof: "tickets",
  banner_image: "banners",
  kyc_aadhaar: "kyc",
  kyc_marksheet: "kyc",
  kyc_photo: "kyc",
  kyc_pan: "kyc",
};

// POST multipart/form-data { file, leadId?, kind }
// All files (KYC, payment proofs, ticket attachments, banner images) go
// directly to Backblaze B2; the resulting public URL is stored in PostgreSQL.
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const leadId = form.get("leadId") ? Number(form.get("leadId")) : null;
  const kind = String(form.get("kind") ?? "proof");

  if (!file) return NextResponse.json({ error: "No file supplied" }, { status: 400 });
  if (file.size > 4 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 4MB)" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Only image files are allowed" }, { status: 400 });
  }

  // Max 5 marksheet uploads per agent
  if (kind === "kyc_marksheet") {
    const { eq, and, count } = await import("drizzle-orm");
    const [{ n }] = await db
      .select({ n: count() })
      .from(uploads)
      .where(and(eq(uploads.userId, user.id), eq(uploads.kind, "kyc_marksheet")));
    if (Number(n) >= 5) {
      return NextResponse.json({ error: "Maximum 5 marksheet uploads reached" }, { status: 400 });
    }
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // B2 first; ANY failure (CORS, network policy, auth, bucket) falls back to an
  // inline Base64 data-URL so the image always renders and the row always saves.
  let url: string;
  let provider: "b2" | "inline";
  try {
    const result = await uploadToStorage({
      buffer,
      fileName: file.name || "upload.png",
      contentType: file.type,
      folder: FOLDER_BY_KIND[kind] ?? "uploads",
    });
    url = result.url;
    provider = result.provider;
  } catch {
    url = `data:${file.type};base64,${buffer.toString("base64")}`;
    provider = "inline";
  }

  const [row] = await db
    .insert(uploads)
    .values({ leadId, userId: user.id, kind, fileName: file.name, url })
    .returning();

  // Passport-size photo automatically becomes the agent's profile avatar
  if (kind === "kyc_photo") {
    const { users } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    await db.update(users).set({ avatarUrl: url }).where(eq(users.id, user.id));
  }

  await db.insert(auditLogs).values({
    userId: user.id,
    leadId,
    action: "FILE_UPLOAD",
    detail: `Uploaded ${kind} (${file.name}, ${(file.size / 1024).toFixed(0)}KB) → ${provider === "b2" ? "Backblaze B2" : "inline storage"}`,
  });

  return NextResponse.json({ id: row.id, url: row.url, kind: row.kind, provider });
}

// PATCH { id, decision: "approve"|"reject", note? } — staff KYC document review
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  const { isStaff } = await import("@/lib/auth");
  if (!user || !isStaff(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id, decision, note } = await req.json();
  const { eq } = await import("drizzle-orm");
  const status = decision === "approve" ? "APPROVED" : "REJECTED";
  const [row] = await db
    .update(uploads)
    .set({ status, rejectionNote: status === "REJECTED" ? String(note ?? "Document unclear — please re-upload").slice(0, 500) : null })
    .where(eq(uploads.id, Number(id)))
    .returning();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.insert(auditLogs).values({
    userId: user.id,
    action: "KYC_" + status,
    detail: `KYC ${row.kind} #${row.id} of user #${row.userId} ${status.toLowerCase()}${row.rejectionNote ? ` — "${row.rejectionNote}"` : ""}`,
  });

  // Automated popup to the agent on KYC decisions
  if (row.kind.startsWith("kyc")) {
    const { notifyAgent } = await import("@/lib/alerts");
    const label = row.kind.replace("kyc_", "").replace("_", " ");
    await notifyAgent({
      agentId: row.userId,
      kind: "KYC",
      decision: status,
      title: status === "APPROVED" ? `✅ KYC Approved — ${label}` : `❌ KYC Rejected — ${label}`,
      body:
        status === "APPROVED"
          ? `Your ${label} document has been verified and approved by management.`
          : `Your ${label} document was rejected. Reason: "${row.rejectionNote}". Please re-upload & re-submit from your Profile → KYC section.`,
    });
  }
  return NextResponse.json({ ok: true, row });
}

// GET ?userId= — list a user's uploads (self, or staff for anyone)
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { eq, desc } = await import("drizzle-orm");
  const target = req.nextUrl.searchParams.get("userId") ?? user.id;
  const uid = user.role === "AGENT" ? user.id : target;
  const rows = await db.select().from(uploads).where(eq(uploads.userId, uid)).orderBy(desc(uploads.createdAt)).limit(50);
  return NextResponse.json({ rows });
}
